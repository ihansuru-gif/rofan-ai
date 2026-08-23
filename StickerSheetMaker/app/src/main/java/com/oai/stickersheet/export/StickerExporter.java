package com.oai.stickersheet.export;

import android.content.ContentResolver;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.pdf.PdfDocument;
import android.net.Uri;

import java.io.IOException;
import java.io.OutputStream;

public final class StickerExporter {
    private StickerExporter() {}

    public static void savePng(ContentResolver resolver, Uri destination, Bitmap bitmap) throws IOException {
        try (OutputStream out = resolver.openOutputStream(destination, "w")) {
            if (out == null || !bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)) {
                throw new IOException("PNG 저장에 실패했습니다.");
            }
            out.flush();
        }
    }

    public static void savePdf(ContentResolver resolver, Uri destination,
                               Bitmap bitmap, int pageW, int pageH) throws IOException {
        if (pageW <= 0 || pageH <= 0) throw new IllegalArgumentException("잘못된 PDF 페이지 크기입니다.");
        PdfDocument document = new PdfDocument();
        try {
            PdfDocument.PageInfo info = new PdfDocument.PageInfo.Builder(pageW, pageH, 1).create();
            PdfDocument.Page page = document.startPage(info);
            Canvas canvas = page.getCanvas();
            canvas.drawBitmap(bitmap, null, new android.graphics.Rect(0, 0, pageW, pageH), null);
            document.finishPage(page);
            try (OutputStream out = resolver.openOutputStream(destination, "w")) {
                if (out == null) throw new IOException("PDF 출력 스트림을 열 수 없습니다.");
                document.writeTo(out);
                out.flush();
            }
        } finally {
            document.close();
        }
    }
}
