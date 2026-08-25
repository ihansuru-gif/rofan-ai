package com.oai.stickersheet;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.SeekBar;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import com.oai.stickersheet.export.StickerExporter;
import com.oai.stickersheet.export.SvgCutlineExporter;
import com.oai.stickersheet.layout.StickerLayoutEngine;
import com.oai.stickersheet.model.BackgroundPattern;
import com.oai.stickersheet.model.DecorationTheme;
import com.oai.stickersheet.model.PageSpec;
import com.oai.stickersheet.model.StickerItem;
import com.oai.stickersheet.processing.StickerOutlineProcessor;
import com.oai.stickersheet.processing.SubjectCutoutService;
import com.oai.stickersheet.processing.TextStickerFactory;
import com.oai.stickersheet.storage.TemplateStore;
import com.oai.stickersheet.view.StickerCanvasView;

import java.io.File;
import java.io.FileOutputStream;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Queue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    private static final String EXPORT_PREFIX = "sticker_sheet";
    private static final int REQ_PICK_IMAGES = 1001;
    private static final int REQ_SAVE_PNG = 1002;
    private static final int REQ_SAVE_PDF = 1003;
    private static final int REQ_SAVE_SVG = 1004;
    private static final int MAX_STICKERS = 24;

    private final ExecutorService imageExecutor = Executors.newSingleThreadExecutor();
    private final Queue<Uri> processingQueue = new ArrayDeque<>();
    private SubjectCutoutService cutoutService;
    private StickerCanvasView canvasView;
    private TextView statusText;
    private Spinner patternSpinner;
    private Spinner pageSpinner;
    private SeekBar borderSeek;
    private SeekBar lineSeek;
    private CheckBox cutLineCheck;
    private CheckBox decorationCheck;
    private boolean processing = false;
    private boolean backgroundBusy = false;
    private boolean destroyed = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        cutoutService = new SubjectCutoutService(this);
        setContentView(buildUi());
    }

    private LinearLayout buildUi() {
        int pad = dp(12);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(pad, pad, pad, pad);
        root.setBackgroundColor(Color.rgb(250, 248, 250));
        canvasView = new StickerCanvasView(this);

        TextView title = new TextView(this);
        title.setText("내 사진 스티커 · 3차");
        title.setTextSize(22);
        title.setTextColor(Color.rgb(35, 35, 38));
        title.setPadding(0, 0, 0, dp(8));
        root.addView(title, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        LinearLayout row1 = row();
        Button add = button("사진 추가");
        add.setOnClickListener(v -> {
            if (backgroundBusy) {
                toast("지금 처리 중이에요. 완료된 뒤 다시 눌러 주세요.");
                return;
            }
            pickImages();
        });
        row1.addView(add, weighted());

        Button auto = button("자동 배치");
        auto.setOnClickListener(v -> {
            if (rejectWhenBusy()) return;
            syncPattern();
            canvasView.autoLayout(System.nanoTime());
        });
        row1.addView(auto, weighted());

        Button del = button("선택 삭제");
        del.setOnClickListener(v -> {
            if (rejectWhenBusy()) return;
            canvasView.deleteSelected();
        });
        row1.addView(del, weighted());
        root.addView(row1);

        LinearLayout row2 = row();
        patternSpinner = new Spinner(this);
        List<String> patternNames = new ArrayList<>();
        for (StickerLayoutEngine.PatternType p : StickerLayoutEngine.PatternType.values()) patternNames.add(p.label);
        patternSpinner.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, patternNames));
        row2.addView(patternSpinner, weighted());

        pageSpinner = new Spinner(this);
        List<String> pageNames = new ArrayList<>();
        for (PageSpec p : PageSpec.values()) pageNames.add(p.label);
        pageSpinner.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, pageNames));
        pageSpinner.setOnItemSelectedListener(new SimpleItemSelectedListener(position -> {
            PageSpec spec = PageSpec.fromIndex(position);
            canvasView.setPageAspect(spec.aspect);
        }));
        row2.addView(pageSpinner, weighted());
        root.addView(row2);

        LinearLayout settings = row();
        settings.setGravity(Gravity.CENTER_VERTICAL);
        settings.addView(smallLabel("흰 테두리"));
        borderSeek = new SeekBar(this);
        borderSeek.setMax(30);
        borderSeek.setProgress(14);
        settings.addView(borderSeek, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        settings.addView(smallLabel("칼선"));
        lineSeek = new SeekBar(this);
        lineSeek.setMax(8);
        lineSeek.setProgress(3);
        settings.addView(lineSeek, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, .65f));
        root.addView(settings);

        LinearLayout toggles = row();
        cutLineCheck = new CheckBox(this);
        cutLineCheck.setText("칼선 표시");
        cutLineCheck.setChecked(true);
        toggles.addView(cutLineCheck, weighted());

        decorationCheck = new CheckBox(this);
        decorationCheck.setText("빈칸 데코");
        decorationCheck.setChecked(true);
        decorationCheck.setOnCheckedChangeListener((buttonView, isChecked) -> canvasView.setDecorationsEnabled(isChecked));
        toggles.addView(decorationCheck, weighted());

        Button rebuild = button("테두리 적용");
        rebuild.setOnClickListener(v -> {
            if (rejectWhenBusy()) return;
            rebuildOutlines();
        });
        toggles.addView(rebuild, weighted());
        root.addView(toggles);

        LinearLayout.LayoutParams canvasParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f);
        canvasParams.topMargin = dp(8);
        root.addView(canvasView, canvasParams);

        statusText = new TextView(this);
        statusText.setText("사진을 여러 장 선택해 주세요. 첫 누끼 실행은 모델 준비 때문에 조금 걸릴 수 있어요.");
        statusText.setTextSize(12);
        statusText.setTextColor(Color.DKGRAY);
        statusText.setPadding(0, dp(6), 0, dp(4));
        root.addView(statusText);

        LinearLayout exportRow = row();
        Button clear = button("전체 지우기");
        clear.setOnClickListener(v -> {
            if (rejectWhenBusy()) return;
            processingQueue.clear();
            canvasView.clearAll();
            statusText.setText("스티커를 모두 지웠어요.");
        });
        exportRow.addView(clear, weighted());

        Button png = button("PNG 저장");
        png.setOnClickListener(v -> {
            if (rejectWhenBusy()) return;
            createDocument("image/png", defaultExportFileName("png"), REQ_SAVE_PNG);
        });
        exportRow.addView(png, weighted());

        Button pdf = button("PDF 저장");
        pdf.setOnClickListener(v -> {
            if (rejectWhenBusy()) return;
            createDocument("application/pdf", defaultExportFileName("pdf"), REQ_SAVE_PDF);
        });
        exportRow.addView(pdf, weighted());
        root.addView(exportRow);

        Button advanced = button("2차 기능 · 글자 / 배경 / 데코 / 스마트배치 / 템플릿 / SVG / 공유");
        advanced.setOnClickListener(v -> {
            if (rejectWhenBusy()) return;
            showAdvancedTools();
        });
        root.addView(advanced, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        return root;
    }

    private void showAdvancedTools() {
        String[] items = {
                "글자 스티커 추가",
                "배경 패턴 선택",
                "데코 테마 선택",
                "스마트 추천 배치",
                "템플릿 저장",
                "템플릿 불러오기",
                "벡터 칼선 SVG 저장",
                "PNG 바로 공유"
        };
        new AlertDialog.Builder(this)
                .setTitle("2차 기능")
                .setItems(items, (dialog, which) -> {
                    switch (which) {
                        case 0 -> showAddTextDialog();
                        case 1 -> chooseBackgroundPattern();
                        case 2 -> chooseDecorationTheme();
                        case 3 -> applySmartLayout();
                        case 4 -> chooseTemplateSlot(true);
                        case 5 -> chooseTemplateSlot(false);
                        case 6 -> createDocument("image/svg+xml", defaultCutlineFileName(), REQ_SAVE_SVG);
                        case 7 -> sharePng();
                    }
                })
                .show();
    }

    private void showAddTextDialog() {
        if (pendingStickerCount() >= MAX_STICKERS) {
            toast("한 시트에는 최대 " + MAX_STICKERS + "개까지 넣을 수 있어요.");
            return;
        }
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        int p = dp(16);
        box.setPadding(p, dp(6), p, 0);
        EditText text = new EditText(this);
        text.setHint("예: 오늘도 최고!");
        text.setSingleLine(true);
        box.addView(text, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        Spinner colorSpinner = new Spinner(this);
        String[] colorNames = {"검정", "진한 핑크", "파랑", "민트", "보라"};
        colorSpinner.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, colorNames));
        box.addView(colorSpinner, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        new AlertDialog.Builder(this)
                .setTitle("글자 스티커")
                .setView(box)
                .setNegativeButton("취소", null)
                .setPositiveButton("추가", (d, w) -> addTextSticker(text.getText().toString(), colorSpinner.getSelectedItemPosition()))
                .show();
    }

    private void addTextSticker(String rawText, int colorIndex) {
        if (pendingStickerCount() >= MAX_STICKERS) {
            toast("한 시트에는 최대 " + MAX_STICKERS + "개까지 넣을 수 있어요.");
            return;
        }
        final int[] colors = {
                Color.rgb(35, 35, 38), Color.rgb(226, 68, 131), Color.rgb(64, 104, 190),
                Color.rgb(47, 148, 128), Color.rgb(118, 79, 170)
        };
        int safeColor = colors[Math.max(0, Math.min(colors.length - 1, colorIndex))];
        int white = 6 + borderSeek.getProgress();
        int cut = 1 + lineSeek.getProgress();
        boolean line = cutLineCheck.isChecked();
        setBackgroundBusy(true, "글자 스티커 만드는 중…");

        imageExecutor.execute(() -> {
            Bitmap foreground = null;
            Bitmap sticker = null;
            try {
                foreground = TextStickerFactory.createForeground(rawText, safeColor);
                sticker = StickerOutlineProcessor.buildSticker(foreground, white, cut, line);
                Bitmap finalForeground = foreground;
                Bitmap finalSticker = sticker;
                runOnUiThread(() -> {
                    if (destroyed) {
                        safeRecycle(finalSticker);
                        safeRecycle(finalForeground);
                        return;
                    }
                    canvasView.addSticker(new StickerItem(finalForeground, finalSticker));
                    setBackgroundBusy(false, "글자 스티커를 추가했어요.");
                });
            } catch (Throwable e) {
                safeRecycle(sticker);
                safeRecycle(foreground);
                runOnUiThread(() -> {
                    if (destroyed) return;
                    setBackgroundBusy(false, "글자 스티커 생성 실패");
                    toast("글자 스티커 생성 실패: " + readableMessage(e));
                });
            }
        });
    }

    private void chooseBackgroundPattern() {
        BackgroundPattern[] values = BackgroundPattern.values();
        String[] labels = new String[values.length];
        for (int i = 0; i < values.length; i++) labels[i] = values[i].label;
        new AlertDialog.Builder(this)
                .setTitle("배경 패턴")
                .setSingleChoiceItems(labels, canvasView.getBackgroundPattern().ordinal(), (dialog, which) -> {
                    canvasView.setBackgroundPattern(values[which]);
                    statusText.setText("배경: " + values[which].label);
                    dialog.dismiss();
                })
                .show();
    }

    private void chooseDecorationTheme() {
        DecorationTheme[] values = DecorationTheme.values();
        String[] labels = new String[values.length];
        for (int i = 0; i < values.length; i++) labels[i] = values[i].label;
        new AlertDialog.Builder(this)
                .setTitle("데코 테마")
                .setSingleChoiceItems(labels, canvasView.getDecorationTheme().ordinal(), (dialog, which) -> {
                    canvasView.setDecorationTheme(values[which]);
                    decorationCheck.setChecked(true);
                    statusText.setText("데코: " + values[which].label);
                    dialog.dismiss();
                })
                .show();
    }

    private void applySmartLayout() {
        if (canvasView.getItems().isEmpty()) {
            toast("먼저 스티커를 넣어 주세요.");
            return;
        }
        StickerLayoutEngine.PatternType recommended = StickerLayoutEngine.recommendPattern(canvasView.getItems());
        patternSpinner.setSelection(recommended.ordinal());
        canvasView.setPatternType(recommended);
        canvasView.autoLayout(System.nanoTime());
        statusText.setText("스마트 추천: " + recommended.label + "로 배치했어요.");
    }

    private void chooseTemplateSlot(boolean save) {
        String[] labels = new String[3];
        for (int i = 0; i < 3; i++) {
            boolean exists = TemplateStore.exists(this, i + 1);
            labels[i] = "슬롯 " + (i + 1) + (exists ? " · 저장됨" : " · 비어 있음");
        }
        new AlertDialog.Builder(this)
                .setTitle(save ? "현재 설정 저장" : "설정 불러오기")
                .setItems(labels, (dialog, which) -> {
                    int slot = which + 1;
                    if (save) saveTemplate(slot); else loadTemplate(slot);
                })
                .show();
    }

    private void saveTemplate(int slot) {
        TemplateStore.Config config = new TemplateStore.Config();
        config.patternIndex = patternSpinner.getSelectedItemPosition();
        config.pageIndex = pageSpinner.getSelectedItemPosition();
        config.borderProgress = borderSeek.getProgress();
        config.lineProgress = lineSeek.getProgress();
        config.cutLine = cutLineCheck.isChecked();
        config.decorations = decorationCheck.isChecked();
        config.backgroundPattern = canvasView.getBackgroundPattern();
        config.decorationTheme = canvasView.getDecorationTheme();
        config.layoutData = TemplateStore.encodeLayout(canvasView.getItems());
        TemplateStore.save(this, slot, config);
        statusText.setText("템플릿 슬롯 " + slot + "에 설정을 저장했어요.");
    }

    private void loadTemplate(int slot) {
        TemplateStore.Config config = TemplateStore.load(this, slot);
        if (config == null) {
            toast("이 슬롯은 아직 비어 있어요.");
            return;
        }
        int patternMax = StickerLayoutEngine.PatternType.values().length - 1;
        int pageMax = PageSpec.values().length - 1;
        patternSpinner.setSelection(Math.max(0, Math.min(patternMax, config.patternIndex)));
        pageSpinner.setSelection(Math.max(0, Math.min(pageMax, config.pageIndex)));
        borderSeek.setProgress(Math.max(0, Math.min(borderSeek.getMax(), config.borderProgress)));
        lineSeek.setProgress(Math.max(0, Math.min(lineSeek.getMax(), config.lineProgress)));
        cutLineCheck.setChecked(config.cutLine);
        decorationCheck.setChecked(config.decorations);
        canvasView.setBackgroundPattern(config.backgroundPattern);
        canvasView.setDecorationTheme(config.decorationTheme);
        syncPattern();
        int restored = TemplateStore.applyLayout(config.layoutData, canvasView.getItems());
        canvasView.invalidate();
        statusText.setText("템플릿 슬롯 " + slot + "을 불러왔어요" + (restored > 0 ? " · 배치 " + restored + "개 복원" : "") + ". 테두리 변경은 '테두리 적용'을 눌러 반영해 주세요.");
    }

    private boolean rejectWhenBusy() {
        if (backgroundBusy || processing) {
            toast(processing ? "사진을 처리 중이에요. 완료된 뒤 다시 눌러 주세요."
                    : "지금 처리 중이에요. 완료된 뒤 다시 눌러 주세요.");
            return true;
        }
        return false;
    }

    private int pendingStickerCount() {
        return canvasView.getItems().size() + processingQueue.size() + (processing ? 1 : 0);
    }

    private void pickImages() {
        if (pendingStickerCount() >= MAX_STICKERS) {
            toast("한 시트에는 최대 " + MAX_STICKERS + "장까지 넣을 수 있어요.");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.setType("image/*");
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        startActivityForResult(intent, REQ_PICK_IMAGES);
    }

    private void createDocument(String mime, String fileName, int requestCode) {
        if (canvasView.getItems().isEmpty()) {
            toast("먼저 스티커를 넣어 주세요.");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.setType(mime);
        intent.putExtra(Intent.EXTRA_TITLE, fileName);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        startActivityForResult(intent, requestCode);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (resultCode != RESULT_OK || data == null || destroyed) return;
        if (requestCode == REQ_PICK_IMAGES) {
            enqueueSelectedImages(data);
        } else if (requestCode == REQ_SAVE_PNG && data.getData() != null) {
            savePng(data.getData());
        } else if (requestCode == REQ_SAVE_PDF && data.getData() != null) {
            savePdf(data.getData());
        } else if (requestCode == REQ_SAVE_SVG && data.getData() != null) {
            saveSvg(data.getData());
        }
    }

    private void enqueueSelectedImages(Intent data) {
        int capacity = MAX_STICKERS - pendingStickerCount();
        int added = 0;
        ClipData clip = data.getClipData();
        if (clip != null) {
            for (int i = 0; i < clip.getItemCount() && added < capacity; i++) {
                Uri uri = clip.getItemAt(i).getUri();
                takeReadPermissionIfPossible(uri);
                processingQueue.add(uri);
                added++;
            }
            if (clip.getItemCount() > added) toast("한 시트 최대 " + MAX_STICKERS + "장이라 초과 사진은 제외했어요.");
        } else if (data.getData() != null && capacity > 0) {
            Uri uri = data.getData();
            takeReadPermissionIfPossible(uri);
            processingQueue.add(uri);
            added = 1;
        }

        if (added == 0) {
            toast("추가할 수 있는 사진 수를 모두 사용했어요.");
            return;
        }
        statusText.setText("사진 " + processingQueue.size() + "장 처리 대기 중…");
        processNext();
    }

    private void processNext() {
        if (processing || destroyed) return;
        Uri uri = processingQueue.poll();
        if (uri == null) {
            statusText.setText("완료: " + canvasView.getItems().size() + "개 스티커");
            syncPattern();
            canvasView.autoLayout(System.nanoTime());
            return;
        }

        processing = true;
        statusText.setText("자동 누끼 처리 중… 남은 사진 " + processingQueue.size() + "장");
        cutoutService.process(uri, new SubjectCutoutService.Callback() {
            @Override
            public void onSuccess(Bitmap foreground) {
                if (destroyed) {
                    safeRecycle(foreground);
                    return;
                }
                createStickerFromForeground(foreground, false);
            }

            @Override
            public void onFailure(Exception error, Bitmap fallbackOriginal) {
                if (destroyed) {
                    safeRecycle(fallbackOriginal);
                    return;
                }
                if (fallbackOriginal != null) {
                    toast("누끼가 실패한 사진 1장은 사각형 사진 스티커로 넣었어요.");
                    createStickerFromForeground(fallbackOriginal, true);
                } else {
                    processing = false;
                    toast("이미지를 읽지 못했어요: " + readableMessage(error));
                    processNext();
                }
            }
        });
    }

    private void createStickerFromForeground(Bitmap foreground, boolean fallback) {
        int white = 6 + borderSeek.getProgress();
        int cut = 1 + lineSeek.getProgress();
        boolean line = cutLineCheck.isChecked();

        imageExecutor.execute(() -> {
            Bitmap sticker = null;
            try {
                sticker = StickerOutlineProcessor.buildSticker(foreground, white, cut, line);
                Bitmap finalSticker = sticker;
                runOnUiThread(() -> {
                    if (destroyed) {
                        safeRecycle(finalSticker);
                        safeRecycle(foreground);
                        return;
                    }
                    canvasView.addSticker(new StickerItem(foreground, finalSticker));
                    processing = false;
                    if (fallback) statusText.setText("일부 사진은 사각형 사진 스티커로 처리됐어요.");
                    processNext();
                });
            } catch (Throwable e) {
                safeRecycle(sticker);
                runOnUiThread(() -> {
                    safeRecycle(foreground);
                    if (destroyed) return;
                    processing = false;
                    toast("스티커 외곽선 생성 실패: " + readableMessage(e));
                    processNext();
                });
            }
        });
    }

    private void rebuildOutlines() {
        if (canvasView.getItems().isEmpty()) {
            toast("먼저 스티커를 넣어 주세요.");
            return;
        }
        int white = 6 + borderSeek.getProgress();
        int cut = 1 + lineSeek.getProgress();
        boolean line = cutLineCheck.isChecked();
        List<StickerItem> snapshot = new ArrayList<>(canvasView.getItems());

        setBackgroundBusy(true, "테두리/칼선 다시 만드는 중…");
        imageExecutor.execute(() -> {
            try {
                for (int i = 0; i < snapshot.size(); i++) {
                    if (destroyed || Thread.currentThread().isInterrupted()) return;
                    StickerItem item = snapshot.get(i);
                    Bitmap foreground = item.getForegroundBitmap();
                    if (foreground == null || foreground.isRecycled()) throw new IllegalStateException("원본 스티커 이미지가 없어졌습니다.");

                    Bitmap replacement = StickerOutlineProcessor.buildSticker(foreground, white, cut, line);
                    CountDownLatch swapped = new CountDownLatch(1);
                    int progress = i + 1;
                    runOnUiThread(() -> {
                        try {
                            if (destroyed) {
                                safeRecycle(replacement);
                                return;
                            }
                            Bitmap old = item.getStickerBitmap();
                            item.setStickerBitmap(replacement);
                            if (old != null && old != item.getForegroundBitmap()) safeRecycle(old);
                            canvasView.invalidate();
                            statusText.setText("테두리/칼선 적용 중… " + progress + "/" + snapshot.size());
                        } finally {
                            swapped.countDown();
                        }
                    });
                    swapped.await();
                }

                runOnUiThread(() -> {
                    if (!destroyed) setBackgroundBusy(false, "테두리/칼선 적용 완료");
                });
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            } catch (Throwable e) {
                runOnUiThread(() -> {
                    if (destroyed) return;
                    setBackgroundBusy(false, "테두리 적용 실패");
                    toast("테두리 적용 실패: " + readableMessage(e));
                });
            }
        });
    }

    private void syncPattern() {
        int index = patternSpinner.getSelectedItemPosition();
        StickerLayoutEngine.PatternType[] values = StickerLayoutEngine.PatternType.values();
        if (index < 0 || index >= values.length) index = 0;
        canvasView.setPatternType(values[index]);
        canvasView.setDecorationsEnabled(decorationCheck.isChecked());
    }

    private void savePng(Uri uri) {
        PageSpec spec = PageSpec.fromIndex(pageSpinner.getSelectedItemPosition());
        setBackgroundBusy(true, "PNG 렌더링 중…");

        final Bitmap rendered;
        try {
            rendered = canvasView.renderToBitmap(spec.pngWidth, spec.pngHeight);
        } catch (Throwable e) {
            setBackgroundBusy(false, "PNG 렌더링 실패");
            toast("PNG 렌더링 실패: " + readableMessage(e));
            return;
        }

        statusText.setText("PNG 저장 중…");
        imageExecutor.execute(() -> {
            try {
                StickerExporter.savePng(getContentResolver(), uri, rendered);
                runOnUiThread(() -> {
                    if (!destroyed) setBackgroundBusy(false, "PNG 저장 완료");
                });
            } catch (Throwable e) {
                runOnUiThread(() -> {
                    if (destroyed) return;
                    setBackgroundBusy(false, "PNG 저장 실패");
                    toast("PNG 저장 실패: " + readableMessage(e));
                });
            } finally {
                safeRecycle(rendered);
            }
        });
    }

    private void savePdf(Uri uri) {
        PageSpec spec = PageSpec.fromIndex(pageSpinner.getSelectedItemPosition());
        int renderW = Math.min(spec.pngWidth, 2000);
        int renderH = Math.max(1, Math.round(renderW / spec.aspect));

        setBackgroundBusy(true, "PDF 렌더링 중…");
        final Bitmap rendered;
        try {
            rendered = canvasView.renderToBitmap(renderW, renderH);
        } catch (Throwable e) {
            setBackgroundBusy(false, "PDF 렌더링 실패");
            toast("PDF 렌더링 실패: " + readableMessage(e));
            return;
        }

        statusText.setText("PDF 저장 중…");
        imageExecutor.execute(() -> {
            try {
                StickerExporter.savePdf(getContentResolver(), uri, rendered, spec.pdfWidthPoints, spec.pdfHeightPoints);
                runOnUiThread(() -> {
                    if (!destroyed) setBackgroundBusy(false, "PDF 저장 완료");
                });
            } catch (Throwable e) {
                runOnUiThread(() -> {
                    if (destroyed) return;
                    setBackgroundBusy(false, "PDF 저장 실패");
                    toast("PDF 저장 실패: " + readableMessage(e));
                });
            } finally {
                safeRecycle(rendered);
            }
        });
    }

    private void saveSvg(Uri uri) {
        PageSpec spec = PageSpec.fromIndex(pageSpinner.getSelectedItemPosition());
        List<StickerItem> snapshot = new ArrayList<>(canvasView.getItems());
        setBackgroundBusy(true, "벡터 칼선 만드는 중…");
        imageExecutor.execute(() -> {
            try {
                SvgCutlineExporter.save(getContentResolver(), uri, snapshot, spec);
                runOnUiThread(() -> {
                    if (!destroyed) setBackgroundBusy(false, "SVG CutContour 저장 완료");
                });
            } catch (Throwable e) {
                runOnUiThread(() -> {
                    if (destroyed) return;
                    setBackgroundBusy(false, "SVG 저장 실패");
                    toast("SVG 저장 실패: " + readableMessage(e));
                });
            }
        });
    }

    private void sharePng() {
        if (canvasView.getItems().isEmpty()) {
            toast("먼저 스티커를 넣어 주세요.");
            return;
        }
        PageSpec spec = PageSpec.fromIndex(pageSpinner.getSelectedItemPosition());
        int renderW = Math.min(spec.pngWidth, 1800);
        int renderH = Math.max(1, Math.round(renderW / spec.aspect));
        setBackgroundBusy(true, "공유 이미지 만드는 중…");
        final Bitmap rendered;
        try {
            rendered = canvasView.renderToBitmap(renderW, renderH);
        } catch (Throwable e) {
            setBackgroundBusy(false, "공유 이미지 생성 실패");
            toast("공유 이미지 생성 실패: " + readableMessage(e));
            return;
        }

        imageExecutor.execute(() -> {
            try {
                File dir = new File(getCacheDir(), "share");
                if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("공유 임시 폴더를 만들 수 없습니다.");
                cleanupShareCache(dir);
                File file = new File(dir, defaultSharedFileName());
                try (FileOutputStream out = new FileOutputStream(file, false)) {
                    if (!rendered.compress(Bitmap.CompressFormat.PNG, 100, out)) throw new IllegalStateException("공유 PNG 생성에 실패했습니다.");
                    out.flush();
                }
                Uri contentUri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", file);
                runOnUiThread(() -> {
                    if (destroyed) return;
                    setBackgroundBusy(false, "공유할 앱을 선택해 주세요.");
                    Intent send = new Intent(Intent.ACTION_SEND);
                    send.setType("image/png");
                    send.putExtra(Intent.EXTRA_STREAM, contentUri);
                    send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    startActivity(Intent.createChooser(send, "스티커 시트 공유"));
                });
            } catch (Throwable e) {
                runOnUiThread(() -> {
                    if (destroyed) return;
                    setBackgroundBusy(false, "공유 실패");
                    toast("공유 실패: " + readableMessage(e));
                });
            } finally {
                safeRecycle(rendered);
            }
        });
    }

    private void takeReadPermissionIfPossible(Uri uri) {
        if (uri == null) return;
        try {
            final int flags = Intent.FLAG_GRANT_READ_URI_PERMISSION;
            getContentResolver().takePersistableUriPermission(uri, flags);
        } catch (SecurityException ignored) {
            // Some providers do not offer persistable grants. Immediate processing still works.
        } catch (Throwable ignored) {
            // Avoid blocking sticker import when a provider behaves differently.
        }
    }

    private String defaultExportFileName(String extension) {
        String page = PageSpec.fromIndex(pageSpinner.getSelectedItemPosition()).name().toLowerCase(Locale.US);
        return EXPORT_PREFIX + "_" + page + "_" + System.currentTimeMillis() + "." + extension;
    }

    private String defaultCutlineFileName() {
        String page = PageSpec.fromIndex(pageSpinner.getSelectedItemPosition()).name().toLowerCase(Locale.US);
        return EXPORT_PREFIX + "_cutline_" + page + "_" + System.currentTimeMillis() + ".svg";
    }

    private String defaultSharedFileName() {
        return EXPORT_PREFIX + "_share_" + System.currentTimeMillis() + ".png";
    }

    private void cleanupShareCache(File dir) {
        File[] files = dir.listFiles();
        if (files == null) return;
        long now = System.currentTimeMillis();
        for (File file : files) {
            if (file == null || !file.isFile()) continue;
            if (!file.getName().startsWith(EXPORT_PREFIX + "_share_")) continue;
            long age = now - file.lastModified();
            if (age > 24L * 60L * 60L * 1000L) file.delete();
        }
    }

    private void setBackgroundBusy(boolean busy, String status) {
        backgroundBusy = busy;
        if (canvasView != null) canvasView.setEditingEnabled(!busy);
        if (statusText != null && status != null) statusText.setText(status);
    }

    private LinearLayout row() {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        return row;
    }

    private LinearLayout.LayoutParams weighted() {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        p.setMargins(dp(2), dp(2), dp(2), dp(2));
        return p;
    }

    private Button button(String text) {
        Button b = new Button(this);
        b.setText(text);
        b.setTextSize(12);
        b.setAllCaps(false);
        b.setMinWidth(0);
        return b;
    }

    private TextView smallLabel(String text) {
        TextView v = new TextView(this);
        v.setText(text);
        v.setTextSize(11);
        v.setPadding(dp(4), 0, dp(2), 0);
        return v;
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    private void toast(String s) {
        if (!destroyed) Toast.makeText(this, s, Toast.LENGTH_SHORT).show();
    }

    private static String readableMessage(Throwable error) {
        if (error == null) return "알 수 없는 오류";
        String message = error.getMessage();
        return (message == null || message.trim().isEmpty()) ? error.getClass().getSimpleName() : message;
    }

    private static void safeRecycle(Bitmap bitmap) {
        if (bitmap != null && !bitmap.isRecycled()) bitmap.recycle();
    }

    @Override
    protected void onDestroy() {
        destroyed = true;
        processingQueue.clear();
        if (cutoutService != null) cutoutService.close();
        imageExecutor.shutdownNow();
        super.onDestroy();
    }

    private static class SimpleItemSelectedListener implements android.widget.AdapterView.OnItemSelectedListener {
        interface Selection { void onSelected(int position); }
        private final Selection selection;
        SimpleItemSelectedListener(Selection selection) { this.selection = selection; }
        @Override
        public void onItemSelected(android.widget.AdapterView<?> parent, android.view.View view, int position, long id) {
            selection.onSelected(position);
        }
        @Override public void onNothingSelected(android.widget.AdapterView<?> parent) {}
    }
}
