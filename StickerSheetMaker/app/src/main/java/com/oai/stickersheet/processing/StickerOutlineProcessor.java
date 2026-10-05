package com.oai.stickersheet.processing;

import android.graphics.Bitmap;
import android.graphics.Color;

import java.util.Arrays;

public final class StickerOutlineProcessor {
    private static final int INF = 1_000_000;

    private StickerOutlineProcessor() {}

    public static Bitmap buildSticker(Bitmap foreground, int whiteBorderPx, int cutLinePx, boolean showCutLine) {
        Bitmap cropped = cropTransparent(foreground, 8);
        int effectiveCut = showCutLine ? Math.max(1, cutLinePx) : 0;
        int pad = Math.max(4, whiteBorderPx + effectiveCut + 5);
        int w = cropped.getWidth();
        int h = cropped.getHeight();
        int outW = w + pad * 2;
        int outH = h + pad * 2;

        int[] source = new int[w * h];
        cropped.getPixels(source, 0, w, 0, 0, w, h);
        int[] dist = new int[outW * outH];
        Arrays.fill(dist, INF);

        for (int y = 0; y < h; y++) {
            int dstRow = (y + pad) * outW + pad;
            int srcRow = y * w;
            for (int x = 0; x < w; x++) {
                if (Color.alpha(source[srcRow + x]) > 18) {
                    dist[dstRow + x] = 0;
                }
            }
        }

        chamferDistance(dist, outW, outH);

        int[] out = new int[outW * outH];
        int whiteThreshold = whiteBorderPx * 3;
        int lineThreshold = (whiteBorderPx + effectiveCut) * 3;
        int cutColor = Color.rgb(72, 72, 72);

        for (int i = 0; i < out.length; i++) {
            int d = dist[i];
            if (d <= whiteThreshold) {
                out[i] = Color.WHITE;
            } else if (showCutLine && d <= lineThreshold) {
                out[i] = cutColor;
            } else {
                out[i] = Color.TRANSPARENT;
            }
        }

        for (int y = 0; y < h; y++) {
            int dstRow = (y + pad) * outW + pad;
            int srcRow = y * w;
            for (int x = 0; x < w; x++) {
                int px = source[srcRow + x];
                if (Color.alpha(px) > 0) {
                    out[dstRow + x] = blendOver(out[dstRow + x], px);
                }
            }
        }

        Bitmap result = Bitmap.createBitmap(out, outW, outH, Bitmap.Config.ARGB_8888);
        if (cropped != foreground) cropped.recycle();
        return result;
    }

    private static void chamferDistance(int[] d, int w, int h) {
        for (int y = 0; y < h; y++) {
            int row = y * w;
            for (int x = 0; x < w; x++) {
                int i = row + x;
                int v = d[i];
                if (x > 0) v = Math.min(v, d[i - 1] + 3);
                if (y > 0) v = Math.min(v, d[i - w] + 3);
                if (x > 0 && y > 0) v = Math.min(v, d[i - w - 1] + 4);
                if (x + 1 < w && y > 0) v = Math.min(v, d[i - w + 1] + 4);
                d[i] = v;
            }
        }
        for (int y = h - 1; y >= 0; y--) {
            int row = y * w;
            for (int x = w - 1; x >= 0; x--) {
                int i = row + x;
                int v = d[i];
                if (x + 1 < w) v = Math.min(v, d[i + 1] + 3);
                if (y + 1 < h) v = Math.min(v, d[i + w] + 3);
                if (x + 1 < w && y + 1 < h) v = Math.min(v, d[i + w + 1] + 4);
                if (x > 0 && y + 1 < h) v = Math.min(v, d[i + w - 1] + 4);
                d[i] = v;
            }
        }
    }

    private static Bitmap cropTransparent(Bitmap src, int margin) {
        int w = src.getWidth();
        int h = src.getHeight();
        int[] row = new int[w];
        int minX = w, minY = h, maxX = -1, maxY = -1;
        for (int y = 0; y < h; y++) {
            src.getPixels(row, 0, w, 0, y, w, 1);
            for (int x = 0; x < w; x++) {
                if (Color.alpha(row[x]) > 12) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
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

    private static int blendOver(int bottom, int top) {
        int at = Color.alpha(top);
        if (at >= 255) return top;
        if (at <= 0) return bottom;
        int ab = Color.alpha(bottom);
        float ft = at / 255f;
        float fb = (ab / 255f) * (1f - ft);
        float outA = ft + fb;
        if (outA <= 0f) return Color.TRANSPARENT;
        int r = Math.round((Color.red(top) * ft + Color.red(bottom) * fb) / outA);
        int g = Math.round((Color.green(top) * ft + Color.green(bottom) * fb) / outA);
        int b = Math.round((Color.blue(top) * ft + Color.blue(bottom) * fb) / outA);
        return Color.argb(Math.round(outA * 255f), r, g, b);
    }
}
