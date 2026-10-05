package com.oai.stickersheet.export;

import android.content.ContentResolver;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;

import com.oai.stickersheet.model.PageSpec;
import com.oai.stickersheet.model.StickerItem;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** Exports the visible sticker alpha boundaries as vector CutContour paths. */
public final class SvgCutlineExporter {
    private static final int MAX_SAMPLE_DIM = 220;

    private SvgCutlineExporter() {}

    public static void save(ContentResolver resolver, Uri destination,
                            List<StickerItem> items, PageSpec page) throws IOException {
        String svg = buildSvg(items, page);
        try (OutputStream out = resolver.openOutputStream(destination, "w")) {
            if (out == null) throw new IOException("SVG 출력 스트림을 열 수 없습니다.");
            out.write(svg.getBytes(StandardCharsets.UTF_8));
            out.flush();
        }
    }

    public static String buildSvg(List<StickerItem> items, PageSpec page) {
        StringBuilder sb = new StringBuilder(32_768);
        sb.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
        sb.append(String.format(Locale.US,
                "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"%.2fmm\" height=\"%.2fmm\" viewBox=\"0 0 %.3f %.3f\">\n",
                page.widthMm, page.heightMm, page.widthMm, page.heightMm));
        sb.append("  <g id=\"CutContour\" fill=\"none\" stroke=\"#FF00FF\" stroke-width=\"0.25\" stroke-linejoin=\"round\" stroke-linecap=\"round\">\n");

        if (items != null) {
            for (StickerItem item : items) {
                Bitmap bitmap = item.getStickerBitmap();
                if (bitmap == null || bitmap.isRecycled() || bitmap.getWidth() <= 0 || bitmap.getHeight() <= 0) continue;
                List<List<Point>> loops = traceAlphaLoops(bitmap);
                for (List<Point> loop : loops) {
                    if (loop.size() < 4) continue;
                    appendTransformedPath(sb, loop, bitmap, item, page);
                }
            }
        }

        sb.append("  </g>\n</svg>\n");
        return sb.toString();
    }

    private static List<List<Point>> traceAlphaLoops(Bitmap bitmap) {
        int srcW = bitmap.getWidth();
        int srcH = bitmap.getHeight();
        float scale = Math.min(1f, MAX_SAMPLE_DIM / (float) Math.max(srcW, srcH));
        int w = Math.max(1, Math.round(srcW * scale));
        int h = Math.max(1, Math.round(srcH * scale));
        boolean[] mask = sampleAlpha(bitmap, w, h);

        List<Edge> edges = new ArrayList<>();
        Map<Long, List<Edge>> byStart = new HashMap<>();
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                if (!mask[y * w + x]) continue;
                if (y == 0 || !mask[(y - 1) * w + x]) addEdge(edges, byStart, x, y, x + 1, y);
                if (x == w - 1 || !mask[y * w + x + 1]) addEdge(edges, byStart, x + 1, y, x + 1, y + 1);
                if (y == h - 1 || !mask[(y + 1) * w + x]) addEdge(edges, byStart, x + 1, y + 1, x, y + 1);
                if (x == 0 || !mask[y * w + x - 1]) addEdge(edges, byStart, x, y + 1, x, y);
            }
        }

        List<List<Point>> loops = new ArrayList<>();
        for (Edge start : edges) {
            if (start.used) continue;
            List<Point> loop = new ArrayList<>();
            Edge current = start;
            int guard = edges.size() + 8;
            while (current != null && !current.used && guard-- > 0) {
                current.used = true;
                loop.add(new Point(current.x1, current.y1, w, h));
                if (current.x2 == start.x1 && current.y2 == start.y1) {
                    loop.add(new Point(current.x2, current.y2, w, h));
                    break;
                }
                current = nextUnused(byStart.get(key(current.x2, current.y2)));
            }
            loop = simplify(loop);
            if (loop.size() >= 4 && area(loop) > 0.00002f) loops.add(loop);
        }
        return loops;
    }

    private static boolean[] sampleAlpha(Bitmap bitmap, int w, int h) {
        boolean[] mask = new boolean[w * h];
        int srcW = bitmap.getWidth();
        int srcH = bitmap.getHeight();
        int[] row = new int[srcW];
        for (int sy = 0; sy < srcH; sy++) {
            bitmap.getPixels(row, 0, srcW, 0, sy, srcW, 1);
            int y = Math.min(h - 1, (int) ((sy / (float) srcH) * h));
            for (int sx = 0; sx < srcW; sx++) {
                if (Color.alpha(row[sx]) <= 24) continue;
                int x = Math.min(w - 1, (int) ((sx / (float) srcW) * w));
                mask[y * w + x] = true;
            }
        }
        return mask;
    }

    private static void appendTransformedPath(StringBuilder sb, List<Point> loop,
                                               Bitmap bitmap, StickerItem item, PageSpec page) {
        double rad = Math.toRadians(item.rotationDegrees);
        double cos = Math.cos(rad);
        double sin = Math.sin(rad);
        float stickerW = item.widthFraction * page.widthMm;
        float stickerH = stickerW * (bitmap.getHeight() / (float) bitmap.getWidth());
        float cx = item.centerX * page.widthMm;
        float cy = item.centerY * page.heightMm;

        sb.append("    <path d=\"");
        for (int i = 0; i < loop.size(); i++) {
            Point p = loop.get(i);
            float lx = (p.u - 0.5f) * stickerW;
            float ly = (p.v - 0.5f) * stickerH;
            float x = cx + (float) (lx * cos - ly * sin);
            float y = cy + (float) (lx * sin + ly * cos);
            sb.append(i == 0 ? "M" : "L")
                    .append(fmt(x)).append(' ').append(fmt(y)).append(' ');
        }
        sb.append("Z\"/>\n");
    }

    private static List<Point> simplify(List<Point> points) {
        if (points.size() <= 4) return points;
        List<Point> out = new ArrayList<>();
        out.add(points.get(0));
        for (int i = 1; i < points.size() - 1; i++) {
            Point a = out.get(out.size() - 1);
            Point b = points.get(i);
            Point c = points.get(i + 1);
            float abx = b.u - a.u;
            float aby = b.v - a.v;
            float bcx = c.u - b.u;
            float bcy = c.v - b.v;
            if (Math.abs(abx * bcy - aby * bcx) > 0.000001f) out.add(b);
        }
        out.add(points.get(points.size() - 1));
        return out;
    }

    private static float area(List<Point> points) {
        float sum = 0f;
        for (int i = 0; i + 1 < points.size(); i++) {
            Point a = points.get(i);
            Point b = points.get(i + 1);
            sum += a.u * b.v - b.u * a.v;
        }
        return sum * 0.5f;
    }

    private static void addEdge(List<Edge> all, Map<Long, List<Edge>> byStart,
                                int x1, int y1, int x2, int y2) {
        Edge edge = new Edge(x1, y1, x2, y2);
        all.add(edge);
        byStart.computeIfAbsent(key(x1, y1), ignored -> new ArrayList<>()).add(edge);
    }

    private static Edge nextUnused(List<Edge> edges) {
        if (edges == null) return null;
        for (Edge edge : edges) if (!edge.used) return edge;
        return null;
    }

    private static long key(int x, int y) {
        return (((long) x) << 32) ^ (y & 0xffffffffL);
    }

    private static String fmt(float value) {
        return String.format(Locale.US, "%.3f", value);
    }

    private static final class Edge {
        final int x1, y1, x2, y2;
        boolean used;
        Edge(int x1, int y1, int x2, int y2) {
            this.x1 = x1; this.y1 = y1; this.x2 = x2; this.y2 = y2;
        }
    }

    private static final class Point {
        final float u, v;
        Point(int x, int y, int w, int h) {
            this.u = x / (float) w;
            this.v = y / (float) h;
        }
    }
}
