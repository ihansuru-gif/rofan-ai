package com.oai.stickersheet.model;

import android.graphics.Bitmap;

public class StickerItem {
    private Bitmap foregroundBitmap;
    private Bitmap stickerBitmap;
    public float centerX = 0.5f;
    public float centerY = 0.5f;
    public float widthFraction = 0.22f;
    public float rotationDegrees = 0f;

    public StickerItem(Bitmap foregroundBitmap, Bitmap stickerBitmap) {
        this.foregroundBitmap = foregroundBitmap;
        this.stickerBitmap = stickerBitmap;
    }

    public Bitmap getForegroundBitmap() {
        return foregroundBitmap;
    }

    public void setForegroundBitmap(Bitmap foregroundBitmap) {
        this.foregroundBitmap = foregroundBitmap;
    }

    public Bitmap getStickerBitmap() {
        return stickerBitmap;
    }

    public void setStickerBitmap(Bitmap stickerBitmap) {
        this.stickerBitmap = stickerBitmap;
    }

    public float aspectRatio() {
        if (stickerBitmap == null || stickerBitmap.getWidth() == 0) return 1f;
        return stickerBitmap.getHeight() / (float) stickerBitmap.getWidth();
    }
}
