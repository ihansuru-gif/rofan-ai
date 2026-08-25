package com.oai.stickersheet.processing;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;

import com.google.android.gms.tasks.Tasks;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.segmentation.subject.SubjectSegmentation;
import com.google.mlkit.vision.segmentation.subject.SubjectSegmentationResult;
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenter;
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenterOptions;

import java.io.IOException;
import java.io.InputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

public class SubjectCutoutService {
    public interface Callback {
        void onSuccess(Bitmap foreground);
        void onFailure(Exception error, Bitmap fallbackOriginal);
    }

    private final Context context;
    private final SubjectSegmenter segmenter;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private volatile boolean closed = false;

    public SubjectCutoutService(Context context) {
        this.context = context.getApplicationContext();
        SubjectSegmenterOptions options = new SubjectSegmenterOptions.Builder()
                .enableForegroundBitmap()
                .build();
        segmenter = SubjectSegmentation.getClient(options);
    }

    public void process(Uri uri, Callback callback) {
        if (closed) return;
        worker.execute(() -> {
            Bitmap source = null;
            try {
                source = loadScaledBitmap(uri, 800);
                if (closed) {
                    recycle(source);
                    return;
                }

                InputImage inputImage = InputImage.fromBitmap(source, 0);
                SubjectSegmentationResult result = Tasks.await(segmenter.process(inputImage), 120, TimeUnit.SECONDS);
                Bitmap foreground = result.getForegroundBitmap();
                if (foreground == null) {
                    Bitmap fallback = source;
                    source = null;
                    postFailure(callback, new IllegalStateException("피사체를 찾지 못했습니다."), fallback);
                    return;
                }

                Bitmap trimmed = trimTransparent(foreground, 12);
                if (trimmed != foreground) recycle(foreground);
                recycle(source);
                source = null;
                postSuccess(callback, trimmed);
            } catch (Exception e) {
                Bitmap fallback = source;
                source = null;
                postFailure(callback, e, fallback);
            } finally {
                recycle(source);
            }
        });
    }

    public void close() {
        closed = true;
        segmenter.close();
        worker.shutdownNow();
    }

    private void postSuccess(Callback callback, Bitmap foreground) {
        mainHandler.post(() -> {
            if (closed) {
                recycle(foreground);
                return;
            }
            callback.onSuccess(foreground);
        });
    }

    private void postFailure(Callback callback, Exception error, Bitmap fallbackOriginal) {
        mainHandler.post(() -> {
            if (closed) {
                recycle(fallbackOriginal);
                return;
            }
            callback.onFailure(error, fallbackOriginal);
        });
    }

    private Bitmap trimTransparent(Bitmap src, int margin) {
        int w = src.getWidth();
        int h = src.getHeight();
        int[] row = new int[w];
        int minX = w, minY = h, maxX = -1, maxY = -1;
        for (int y = 0; y < h; y++) {
            src.getPixels(row, 0, w, 0, y, w, 1);
            for (int x = 0; x < w; x++) {
                if (android.graphics.Color.alpha(row[x]) > 12) {
                    minX = Math.min(minX, x);
                    minY = Math.min(minY, y);
                    maxX = Math.max(maxX, x);
                    maxY = Math.max(maxY, y);
                }
            }
        }
        if (maxX < minX || maxY < minY) return src;
        minX = Math.max(0, minX - margin);
        minY = Math.max(0, minY - margin);
        maxX = Math.min(w - 1, maxX + margin);
        maxY = Math.min(h - 1, maxY + margin);
        if (minX == 0 && minY == 0 && maxX == w - 1 && maxY == h - 1) return src;
        return Bitmap.createBitmap(src, minX, minY, maxX - minX + 1, maxY - minY + 1);
    }

    private Bitmap loadScaledBitmap(Uri uri, int maxDimension) throws IOException {
        int orientation = readExifOrientation(uri);

        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        try (InputStream in = context.getContentResolver().openInputStream(uri)) {
            if (in == null) throw new IOException("이미지 파일을 열 수 없습니다.");
            BitmapFactory.decodeStream(in, null, bounds);
        }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
            throw new IOException("이미지를 읽을 수 없습니다.");
        }

        int sample = 1;
        while (Math.max(bounds.outWidth / sample, bounds.outHeight / sample) > maxDimension * 2) {
            sample *= 2;
        }

        BitmapFactory.Options opts = new BitmapFactory.Options();
        opts.inSampleSize = sample;
        opts.inPreferredConfig = Bitmap.Config.ARGB_8888;
        Bitmap decoded;
        try (InputStream in = context.getContentResolver().openInputStream(uri)) {
            if (in == null) throw new IOException("이미지 파일을 열 수 없습니다.");
            decoded = BitmapFactory.decodeStream(in, null, opts);
        }
        if (decoded == null) throw new IOException("이미지 디코딩에 실패했습니다.");

        Bitmap oriented = applyExifOrientation(decoded, orientation);
        if (oriented != decoded) recycle(decoded);

        int max = Math.max(oriented.getWidth(), oriented.getHeight());
        if (max <= maxDimension) return oriented;
        float scale = maxDimension / (float) max;
        int w = Math.max(1, Math.round(oriented.getWidth() * scale));
        int h = Math.max(1, Math.round(oriented.getHeight() * scale));
        Bitmap scaled = Bitmap.createScaledBitmap(oriented, w, h, true);
        if (scaled != oriented) recycle(oriented);
        return scaled;
    }

    private int readExifOrientation(Uri uri) {
        try (InputStream in = context.getContentResolver().openInputStream(uri)) {
            if (in == null) return ExifInterface.ORIENTATION_NORMAL;
            ExifInterface exif = new ExifInterface(in);
            return exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
        } catch (Exception ignored) {
            return ExifInterface.ORIENTATION_NORMAL;
        }
    }

    private Bitmap applyExifOrientation(Bitmap src, int orientation) {
        Matrix m = new Matrix();
        switch (orientation) {
            case ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> m.setScale(-1f, 1f);
            case ExifInterface.ORIENTATION_ROTATE_180 -> m.setRotate(180f);
            case ExifInterface.ORIENTATION_FLIP_VERTICAL -> m.setScale(1f, -1f);
            case ExifInterface.ORIENTATION_TRANSPOSE -> {
                m.setRotate(90f);
                m.postScale(-1f, 1f);
            }
            case ExifInterface.ORIENTATION_ROTATE_90 -> m.setRotate(90f);
            case ExifInterface.ORIENTATION_TRANSVERSE -> {
                m.setRotate(-90f);
                m.postScale(-1f, 1f);
            }
            case ExifInterface.ORIENTATION_ROTATE_270 -> m.setRotate(-90f);
            default -> {
                return src;
            }
        }
        try {
            return Bitmap.createBitmap(src, 0, 0, src.getWidth(), src.getHeight(), m, true);
        } catch (OutOfMemoryError error) {
            return src;
        }
    }

    private static void recycle(Bitmap bitmap) {
        if (bitmap != null && !bitmap.isRecycled()) bitmap.recycle();
    }
}
