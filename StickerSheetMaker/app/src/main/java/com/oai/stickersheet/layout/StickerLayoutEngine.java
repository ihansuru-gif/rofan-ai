package com.oai.stickersheet.layout;

import com.oai.stickersheet.model.StickerItem;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

public final class StickerLayoutEngine {
    public enum PatternType {
        RANDOM_JOURNAL("랜덤 폴꾸형"),
        BALANCED_GRID("균형 정렬형"),
        MINI_DENSE("미니 다량형"),
        HERO_FOCUS("메인 강조형");

        public final String label;
        PatternType(String label) { this.label = label; }
    }

    private StickerLayoutEngine() {}

    public static PatternType recommendPattern(List<StickerItem> items) {
        if (items == null || items.isEmpty()) return PatternType.RANDOM_JOURNAL;
        int n = items.size();
        if (n <= 3) return PatternType.HERO_FOCUS;
        if (n >= 14) return PatternType.MINI_DENSE;

        float sum = 0f;
        float sumSq = 0f;
        for (StickerItem item : items) {
            float a = normalizedAspect(item);
            sum += a;
            sumSq += a * a;
        }
        float mean = sum / n;
        float variance = Math.max(0f, sumSq / n - mean * mean);
        if (variance > 0.18f || (n >= 4 && n <= 8)) return PatternType.RANDOM_JOURNAL;
        return PatternType.BALANCED_GRID;
    }

    public static void apply(List<StickerItem> items, PatternType type, long seed, float pageAspect) {
        if (items == null || items.isEmpty()) return;
        float safeAspect = pageAspect > 0f ? pageAspect : 210f / 297f;
        switch (type) {
            case BALANCED_GRID -> balanced(items, safeAspect);
            case MINI_DENSE -> miniDense(items, safeAspect);
            case HERO_FOCUS -> hero(items, seed, safeAspect);
            default -> randomJournal(items, seed, safeAspect);
        }
        for (StickerItem item : items) constrainInside(item, safeAspect, 0.018f);
        resolveOverlaps(items, safeAspect, seed);
    }

    private static void balanced(List<StickerItem> items, float pageAspect) {
        int n = items.size();
        int cols = Math.max(2, (int) Math.ceil(Math.sqrt(n * 0.72f)));
        int rows = (int) Math.ceil(n / (float) cols);
        float marginX = 0.075f;
        float marginY = 0.065f;
        float usableW = 1f - marginX * 2f;
        float usableH = 1f - marginY * 2f;
        float cellW = usableW / cols;
        float cellH = usableH / rows;

        for (int i = 0; i < n; i++) {
            int row = i / cols;
            int col = i % cols;
            StickerItem item = items.get(i);
            float aspect = normalizedAspect(item);
            float byWidth = cellW * 0.76f;
            float byHeight = (cellH * 0.76f) / Math.max(0.2f, pageAspect * aspect);
            float size = Math.min(byWidth, byHeight);
            item.centerX = marginX + cellW * (col + 0.5f);
            item.centerY = marginY + cellH * (row + 0.5f);
            item.widthFraction = clamp(size * (i % 3 == 0 ? 1.04f : 0.96f), 0.065f, 0.25f);
            item.rotationDegrees = 0f;
        }
    }

    private static void miniDense(List<StickerItem> items, float pageAspect) {
        int n = items.size();
        int cols = n <= 8 ? 3 : n <= 16 ? 4 : n <= 30 ? 5 : 6;
        int rows = (int) Math.ceil(n / (float) cols);
        float marginX = 0.055f;
        float marginY = 0.05f;
        float cellW = (1f - marginX * 2f) / cols;
        float cellH = (1f - marginY * 2f) / rows;

        for (int i = 0; i < n; i++) {
            int row = i / cols;
            int col = i % cols;
            StickerItem item = items.get(i);
            float aspect = normalizedAspect(item);
            float byWidth = cellW * 0.78f;
            float byHeight = (cellH * 0.78f) / Math.max(0.2f, pageAspect * aspect);
            float size = Math.min(byWidth, byHeight);
            item.centerX = marginX + cellW * (col + 0.5f);
            item.centerY = marginY + cellH * (row + 0.5f);
            item.widthFraction = clamp(size * (i % 4 == 0 ? 1.05f : 0.95f), 0.045f, 0.18f);
            item.rotationDegrees = (i % 2 == 0 ? -2.2f : 2.2f);
        }
    }

    private static void hero(List<StickerItem> items, long seed, float pageAspect) {
        Random random = new Random(seed);
        int n = items.size();

        StickerItem hero = items.get(0);
        hero.centerX = 0.38f;
        hero.centerY = 0.28f;
        hero.widthFraction = fitWidth(hero, 0.34f, 0.42f, pageAspect);
        hero.rotationDegrees = -3f;

        List<Box> boxes = new ArrayList<>();
        boxes.add(boxFor(hero, pageAspect));

        if (n > 1) {
            StickerItem second = items.get(1);
            second.centerX = 0.72f;
            second.centerY = 0.27f;
            second.widthFraction = fitWidth(second, 0.24f, 0.34f, pageAspect);
            second.rotationDegrees = 5f;
            Box secondBox = boxFor(second, pageAspect);
            if (inside(secondBox, 0.035f) && !intersectsAny(secondBox, boxes, 0.012f)) {
                boxes.add(secondBox);
            } else {
                placeRandomWithShrink(second, boxes, random, pageAspect,
                        0.55f, 0.92f, 0.07f, 0.46f, 0.20f, 0.11f, 220);
            }
        }

        for (int i = 2; i < n; i++) {
            StickerItem item = items.get(i);
            item.rotationDegrees = -9f + random.nextFloat() * 18f;
            float preferred = 0.14f + random.nextFloat() * 0.055f;
            placeRandomWithShrink(item, boxes, random, pageAspect,
                    0.06f, 0.94f, 0.46f, 0.94f,
                    preferred, 0.065f, 260);
        }
    }

    private static void randomJournal(List<StickerItem> items, long seed, float pageAspect) {
        Random random = new Random(seed);
        List<Box> boxes = new ArrayList<>();

        for (int i = 0; i < items.size(); i++) {
            StickerItem item = items.get(i);
            float base;
            if (i % 7 == 0) base = 0.27f;
            else if (i % 3 == 0) base = 0.20f;
            else base = 0.145f;
            float preferred = clamp(base * (0.88f + random.nextFloat() * 0.28f), 0.09f, 0.30f);
            item.rotationDegrees = -12f + random.nextFloat() * 24f;
            placeRandomWithShrink(item, boxes, random, pageAspect,
                    0.055f, 0.945f, 0.055f, 0.945f,
                    preferred, 0.055f, 340);
        }
    }

    private static void placeRandomWithShrink(StickerItem item,
                                              List<Box> boxes,
                                              Random random,
                                              float pageAspect,
                                              float minX, float maxX,
                                              float minY, float maxY,
                                              float preferredWidth,
                                              float minWidth,
                                              int attemptsPerSize) {
        float width = fitWidth(item, preferredWidth, 0.90f, pageAspect);
        float floor = Math.min(width, minWidth);

        while (width >= floor - 0.0001f) {
            item.widthFraction = width;
            for (int i = 0; i < attemptsPerSize; i++) {
                item.centerX = minX + random.nextFloat() * (maxX - minX);
                item.centerY = minY + random.nextFloat() * (maxY - minY);
                Box candidate = boxFor(item, pageAspect);
                if (!inside(candidate, 0.025f)) continue;
                if (!intersectsAny(candidate, boxes, 0.008f)) {
                    boxes.add(candidate);
                    return;
                }
            }
            width *= 0.90f;
        }

        // 무작위 탐색이 실패하면 작은 크기로 전체 페이지를 규칙적으로 훑어 빈칸을 찾는다.
        item.widthFraction = Math.max(0.042f, floor);
        for (int gy = 0; gy < 20; gy++) {
            for (int gx = 0; gx < 16; gx++) {
                item.centerX = 0.04f + (gx + 0.5f) * (0.92f / 16f);
                item.centerY = 0.04f + (gy + 0.5f) * (0.92f / 20f);
                Box candidate = boxFor(item, pageAspect);
                if (inside(candidate, 0.018f) && !intersectsAny(candidate, boxes, 0.004f)) {
                    boxes.add(candidate);
                    return;
                }
            }
        }

        // 사진 수가 지나치게 많아 물리적으로 빈칸이 없는 경우 마지막 안전 위치를 사용한다.
        // 이 경우에도 페이지 바깥으로 잘리는 것만은 막는다.
        item.widthFraction = 0.042f;
        item.centerX = clamp(minX + random.nextFloat() * (maxX - minX), 0.06f, 0.94f);
        item.centerY = clamp(minY + random.nextFloat() * (maxY - minY), 0.06f, 0.94f);
        boxes.add(boxFor(item, pageAspect));
    }

    private static void resolveOverlaps(List<StickerItem> items, float pageAspect, long seed) {
        List<Box> placed = new ArrayList<>();
        Random random = new Random(seed ^ 0x5EED5EEDL);
        for (StickerItem item : items) {
            constrainInside(item, pageAspect, 0.018f);
            Box candidate = boxFor(item, pageAspect);

            int shrinkSteps = 0;
            while (intersectsAny(candidate, placed, 0.0035f) && item.widthFraction > 0.010f && shrinkSteps++ < 32) {
                item.widthFraction *= 0.90f;
                constrainInside(item, pageAspect, 0.018f);
                candidate = boxFor(item, pageAspect);
            }

            if (intersectsAny(candidate, placed, 0.0025f)) {
                boolean found = relocateToFreeSpot(item, placed, pageAspect, random);
                candidate = boxFor(item, pageAspect);
                if (!found && intersectsAny(candidate, placed, 0.001f)) {
                    item.rotationDegrees = 0f;
                    item.widthFraction = Math.min(item.widthFraction, 0.008f);
                    relocateToFreeSpot(item, placed, pageAspect, random);
                    candidate = boxFor(item, pageAspect);
                }
            }
            placed.add(candidate);
        }
    }

    private static boolean relocateToFreeSpot(StickerItem item, List<Box> placed, float pageAspect, Random random) {
        float startWidth = Math.max(0.006f, item.widthFraction);
        for (float width = startWidth; width >= 0.006f; width *= 0.86f) {
            item.widthFraction = width;
            for (int pass = 0; pass < 2; pass++) {
                int cols = pass == 0 ? 28 : 44;
                int rows = pass == 0 ? 36 : 56;
                int offset = random.nextInt(Math.max(1, cols));
                for (int gy = 0; gy < rows; gy++) {
                    for (int gx0 = 0; gx0 < cols; gx0++) {
                        int gx = (gx0 + offset + gy * 3) % cols;
                        item.centerX = 0.022f + (gx + 0.5f) * (0.956f / cols);
                        item.centerY = 0.022f + (gy + 0.5f) * (0.956f / rows);
                        Box b = boxFor(item, pageAspect);
                        if (inside(b, 0.012f) && !intersectsAny(b, placed, 0.0015f)) return true;
                    }
                }
            }
        }
        return false;
    }

    private static void constrainInside(StickerItem item, float pageAspect, float margin) {
        float aspect = normalizedAspect(item);
        double rad = Math.toRadians(item.rotationDegrees);
        float cos = Math.abs((float) Math.cos(rad));
        float sin = Math.abs((float) Math.sin(rad));
        float coeffX = (cos + pageAspect * aspect * sin) / 2f;
        float coeffY = (sin + pageAspect * aspect * cos) / 2f;
        float roomX = Math.max(0.001f, Math.min(item.centerX - margin, 1f - margin - item.centerX));
        float roomY = Math.max(0.001f, Math.min(item.centerY - margin, 1f - margin - item.centerY));
        float maxW = Math.min(roomX / Math.max(0.0001f, coeffX), roomY / Math.max(0.0001f, coeffY));
        if (item.widthFraction > maxW) item.widthFraction = Math.max(0.008f, maxW);

        Box b = boxFor(item, pageAspect);
        if (!inside(b, margin)) {
            float dx = 0f, dy = 0f;
            if (b.left < margin) dx = margin - b.left;
            else if (b.right > 1f - margin) dx = (1f - margin) - b.right;
            if (b.top < margin) dy = margin - b.top;
            else if (b.bottom > 1f - margin) dy = (1f - margin) - b.bottom;
            item.centerX = clamp(item.centerX + dx, margin, 1f - margin);
            item.centerY = clamp(item.centerY + dy, margin, 1f - margin);
        }
    }

    private static boolean intersectsAny(Box candidate, List<Box> boxes, float gap) {
        for (Box b : boxes) {
            if (candidate.intersects(b, gap)) return true;
        }
        return false;
    }

    private static float fitWidth(StickerItem item, float requested, float maxHeightFraction, float pageAspect) {
        float aspect = normalizedAspect(item);
        float byHeight = maxHeightFraction / Math.max(0.2f, pageAspect * aspect);
        return clamp(Math.min(requested, byHeight), 0.045f, requested);
    }

    private static float normalizedAspect(StickerItem item) {
        float aspect = item.aspectRatio();
        if (Float.isNaN(aspect) || Float.isInfinite(aspect) || aspect <= 0f) return 1f;
        return aspect;
    }

    private static Box boxFor(StickerItem item, float pageAspect) {
        float halfW = item.widthFraction / 2f;
        float halfH = item.widthFraction * pageAspect * normalizedAspect(item) / 2f;

        // 회전된 축정렬 바운딩 박스(AABB)를 사용해 겹침 검사를 보수적으로 수행한다.
        double rad = Math.toRadians(item.rotationDegrees);
        float cos = Math.abs((float) Math.cos(rad));
        float sin = Math.abs((float) Math.sin(rad));
        float rotatedHalfW = halfW * cos + halfH * sin;
        float rotatedHalfH = halfW * sin + halfH * cos;
        return new Box(item.centerX - rotatedHalfW, item.centerY - rotatedHalfH,
                item.centerX + rotatedHalfW, item.centerY + rotatedHalfH);
    }

    private static boolean inside(Box b, float m) {
        return b.left >= m && b.top >= m && b.right <= 1f - m && b.bottom <= 1f - m;
    }

    private static float clamp(float v, float min, float max) {
        return Math.max(min, Math.min(max, v));
    }

    private static final class Box {
        final float left;
        final float top;
        final float right;
        final float bottom;

        Box(float left, float top, float right, float bottom) {
            this.left = left;
            this.top = top;
            this.right = right;
            this.bottom = bottom;
        }

        boolean intersects(Box b, float gap) {
            return !(right + gap < b.left || left - gap > b.right || bottom + gap < b.top || top - gap > b.bottom);
        }
    }
}
