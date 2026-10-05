package com.oai.stickersheet.processing;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;

public final class TextStickerFactory {
    private static final int MAX_CHARS = 32;

    private TextStickerFactory() {}

    public static Bitmap createForeground(String rawText, int color) {
        String text = sanitize(rawText);
        if (text.isEmpty()) throw new IllegalArgumentException("글자를 입력해 주세요.");

        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.SUBPIXEL_TEXT_FLAG);
        paint.setColor(color);
        paint.setTextSize(112f);
        paint.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
        paint.setTextAlign(Paint.Align.LEFT);

        int padding = 18;
        final float maxTextWidth = 1900f;
        float measured = paint.measureText(text);
        if (measured > maxTextWidth && measured > 0f) {
            paint.setTextSize(Math.max(44f, 112f * (maxTextWidth / measured)));
        }
        Paint.FontMetrics fm = paint.getFontMetrics();
        int width = Math.max(1, (int) Math.ceil(paint.measureText(text)) + padding * 2);
        int height = Math.max(1, (int) Math.ceil(fm.descent - fm.ascent) + padding * 2);
        Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        canvas.drawColor(Color.TRANSPARENT);
        float baseline = padding - fm.ascent;
        canvas.drawText(text, padding, baseline, paint);
        return bitmap;
    }

    static String sanitize(String rawText) {
        if (rawText == null) return "";
        String compact = rawText.replace('\n', ' ').replace('\r', ' ').trim();
        compact = compact.replaceAll("\\s+", " ");
        if (compact.length() > MAX_CHARS) compact = compact.substring(0, MAX_CHARS);
        return compact;
    }
}
