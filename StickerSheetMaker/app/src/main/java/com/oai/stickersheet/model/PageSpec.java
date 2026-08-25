package com.oai.stickersheet.model;

public enum PageSpec {
    A4("A4 세로", 210f / 297f, 2480, 3508, 595, 842, 210f, 297f),
    A5("A5 세로", 148f / 210f, 1748, 2480, 420, 595, 148f, 210f),
    SQUARE("정사각형", 1f, 2400, 2400, 720, 720, 254f, 254f);

    public final String label;
    public final float aspect;
    public final int pngWidth;
    public final int pngHeight;
    public final int pdfWidthPoints;
    public final int pdfHeightPoints;
    public final float widthMm;
    public final float heightMm;

    PageSpec(String label, float aspect,
             int pngWidth, int pngHeight,
             int pdfWidthPoints, int pdfHeightPoints,
             float widthMm, float heightMm) {
        this.label = label;
        this.aspect = aspect;
        this.pngWidth = pngWidth;
        this.pngHeight = pngHeight;
        this.pdfWidthPoints = pdfWidthPoints;
        this.pdfHeightPoints = pdfHeightPoints;
        this.widthMm = widthMm;
        this.heightMm = heightMm;
    }

    public static PageSpec fromIndex(int index) {
        PageSpec[] values = values();
        if (index < 0 || index >= values.length) return A4;
        return values[index];
    }
}
