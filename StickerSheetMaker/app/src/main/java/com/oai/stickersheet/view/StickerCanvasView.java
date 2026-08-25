package com.oai.stickersheet.view;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.view.MotionEvent;
import android.view.View;

import com.oai.stickersheet.layout.StickerLayoutEngine;
import com.oai.stickersheet.model.BackgroundPattern;
import com.oai.stickersheet.model.DecorationTheme;
import com.oai.stickersheet.model.StickerItem;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class StickerCanvasView extends View {
    private final List<StickerItem> items = new ArrayList<>();
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
    private final Paint pagePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint selectionPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF pageRect = new RectF();
    private StickerItem selected;
    private float pageAspect = 210f / 297f;
    private boolean decorationsEnabled = true;
    private boolean editingEnabled = true;
    private StickerLayoutEngine.PatternType patternType = StickerLayoutEngine.PatternType.RANDOM_JOURNAL;
    private BackgroundPattern backgroundPattern = BackgroundPattern.PLAIN;
    private DecorationTheme decorationTheme = DecorationTheme.PASTEL_MIX;

    private float lastX;
    private float lastY;
    private float initialDistance;
    private float initialAngle;
    private float initialScale;
    private float initialRotation;

    public StickerCanvasView(Context context) {
        super(context);
        setLayerType(View.LAYER_TYPE_SOFTWARE, null);
        pagePaint.setColor(Color.WHITE);
        pagePaint.setShadowLayer(dp(12), 0, dp(3), 0x26000000);
        selectionPaint.setStyle(Paint.Style.STROKE);
        selectionPaint.setStrokeWidth(dp(2));
        selectionPaint.setColor(Color.rgb(111, 91, 211));
    }

    public List<StickerItem> getItems() {
        return items;
    }

    public void addSticker(StickerItem item) {
        items.add(item);
        selected = item;
        invalidate();
    }

    public void clearAll() {
        for (StickerItem item : items) recycleItem(item);
        items.clear();
        selected = null;
        invalidate();
    }

    public boolean deleteSelected() {
        if (selected == null) return false;
        items.remove(selected);
        recycleItem(selected);
        selected = null;
        invalidate();
        return true;
    }

    public boolean duplicateSelected() {
        if (selected == null) return false;
        Bitmap sourceForeground = selected.getForegroundBitmap();
        Bitmap sourceSticker = selected.getStickerBitmap();
        if (sourceForeground == null || sourceSticker == null
                || sourceForeground.isRecycled() || sourceSticker.isRecycled()) return false;

        Bitmap foregroundCopy = sourceForeground.copy(
                sourceForeground.getConfig() == null ? Bitmap.Config.ARGB_8888 : sourceForeground.getConfig(), false);
        Bitmap stickerCopy = sourceSticker == sourceForeground
                ? foregroundCopy
                : sourceSticker.copy(sourceSticker.getConfig() == null ? Bitmap.Config.ARGB_8888 : sourceSticker.getConfig(), false);
        if (foregroundCopy == null || stickerCopy == null) {
            if (foregroundCopy != null && !foregroundCopy.isRecycled()) foregroundCopy.recycle();
            if (stickerCopy != null && stickerCopy != foregroundCopy && !stickerCopy.isRecycled()) stickerCopy.recycle();
            return false;
        }

        StickerItem copy = new StickerItem(foregroundCopy, stickerCopy);
        copy.centerX = clamp(selected.centerX + .045f, .06f, .94f);
        copy.centerY = clamp(selected.centerY + .045f, .06f, .94f);
        copy.widthFraction = selected.widthFraction;
        copy.rotationDegrees = selected.rotationDegrees;
        items.add(copy);
        selected = copy;
        invalidate();
        return true;
    }

    public boolean rotateSelected(float degrees) {
        if (selected == null) return false;
        selected.rotationDegrees = normalizeDegrees(selected.rotationDegrees + degrees);
        invalidate();
        return true;
    }

    public boolean resetSelectedTransform() {
        if (selected == null) return false;
        selected.centerX = .5f;
        selected.centerY = .5f;
        selected.rotationDegrees = 0f;
        selected.widthFraction = .22f;
        invalidate();
        return true;
    }

    public boolean bringSelectedToFront() {
        if (selected == null || items.isEmpty()) return false;
        items.remove(selected);
        items.add(selected);
        invalidate();
        return true;
    }

    public boolean sendSelectedToBack() {
        if (selected == null || items.isEmpty()) return false;
        items.remove(selected);
        items.add(0, selected);
        invalidate();
        return true;
    }

    private float normalizeDegrees(float degrees) {
        float normalized = degrees % 360f;
        if (normalized > 180f) normalized -= 360f;
        if (normalized < -180f) normalized += 360f;
        return normalized;
    }

    private void recycleItem(StickerItem item) {
        Bitmap sticker = item.getStickerBitmap();
        Bitmap foreground = item.getForegroundBitmap();
        if (sticker != null && sticker != foreground && !sticker.isRecycled()) sticker.recycle();
        if (foreground != null && !foreground.isRecycled()) foreground.recycle();
    }

    public void setPatternType(StickerLayoutEngine.PatternType patternType) {
        this.patternType = patternType == null ? StickerLayoutEngine.PatternType.RANDOM_JOURNAL : patternType;
        invalidate();
    }

    public StickerLayoutEngine.PatternType getPatternType() {
        return patternType;
    }

    public void setBackgroundPattern(BackgroundPattern backgroundPattern) {
        this.backgroundPattern = backgroundPattern == null ? BackgroundPattern.PLAIN : backgroundPattern;
        invalidate();
    }

    public BackgroundPattern getBackgroundPattern() {
        return backgroundPattern;
    }

    public void setDecorationTheme(DecorationTheme decorationTheme) {
        this.decorationTheme = decorationTheme == null ? DecorationTheme.PASTEL_MIX : decorationTheme;
        invalidate();
    }

    public DecorationTheme getDecorationTheme() {
        return decorationTheme;
    }

    public void setDecorationsEnabled(boolean enabled) {
        decorationsEnabled = enabled;
        invalidate();
    }

    public boolean isDecorationsEnabled() {
        return decorationsEnabled;
    }

    public void setEditingEnabled(boolean enabled) {
        editingEnabled = enabled;
        if (!enabled) selected = null;
        invalidate();
    }

    public boolean isEditingEnabled() {
        return editingEnabled;
    }

    public void setPageAspect(float widthOverHeight) {
        pageAspect = widthOverHeight > 0f ? widthOverHeight : 210f / 297f;
        requestLayout();
        invalidate();
    }

    public void autoLayout(long seed) {
        StickerLayoutEngine.apply(items, patternType, seed, pageAspect);
        selected = null;
        invalidate();
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        canvas.drawColor(Color.rgb(238, 234, 245));
        computePageRect();
        canvas.drawRoundRect(pageRect, dp(12), dp(12), pagePaint);
        canvas.save();
        canvas.clipRect(pageRect);
        drawContent(canvas, pageRect.left, pageRect.top, pageRect.width(), pageRect.height(), true);
        canvas.restore();
    }

    private void drawContent(Canvas canvas, float left, float top, float width, float height, boolean showSelection) {
        drawBackground(canvas, left, top, width, height);
        if (decorationsEnabled) drawDecorations(canvas, left, top, width, height);
        for (StickerItem item : items) {
            drawItem(canvas, item, left, top, width, height, showSelection && item == selected);
        }
    }

    private void drawBackground(Canvas canvas, float l, float t, float w, float h) {
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setStyle(Paint.Style.FILL);
        p.setColor(Color.WHITE);
        canvas.drawRect(l, t, l + w, t + h, p);

        switch (backgroundPattern) {
            case PLAIN -> { }
            case DOTS -> {
                p.setColor(Color.rgb(232, 224, 244));
                float gap = Math.max(18f, w * 0.055f);
                float r = Math.max(1.2f, w * 0.0045f);
                for (float y = t + gap * .5f; y < t + h; y += gap) {
                    for (float x = l + gap * .5f; x < l + w; x += gap) canvas.drawCircle(x, y, r, p);
                }
            }
            case CHECKER -> {
                int c1 = Color.rgb(255, 247, 250);
                int c2 = Color.rgb(241, 247, 255);
                float cell = Math.max(26f, w * 0.09f);
                int row = 0;
                for (float y = t; y < t + h; y += cell, row++) {
                    int col = 0;
                    for (float x = l; x < l + w; x += cell, col++) {
                        p.setColor(((row + col) & 1) == 0 ? c1 : c2);
                        canvas.drawRect(x, y, Math.min(l + w, x + cell), Math.min(t + h, y + cell), p);
                    }
                }
            }
            case GRID -> {
                p.setStyle(Paint.Style.STROKE);
                p.setStrokeWidth(Math.max(1f, w * 0.0014f));
                p.setColor(Color.rgb(229, 233, 240));
                float gap = Math.max(22f, w * 0.065f);
                for (float x = l; x <= l + w; x += gap) canvas.drawLine(x, t, x, t + h, p);
                for (float y = t; y <= t + h; y += gap) canvas.drawLine(l, y, l + w, y, p);
                p.setStyle(Paint.Style.FILL);
            }
            case CONFETTI -> {
                int[] colors = {
                        Color.rgb(255, 214, 226), Color.rgb(216, 228, 255),
                        Color.rgb(214, 242, 232), Color.rgb(244, 224, 255)
                };
                float unit = w * 0.018f;
                for (int i = 0; i < 28; i++) {
                    float nx = ((i * 37) % 97) / 97f;
                    float ny = ((i * 61 + 17) % 101) / 101f;
                    float x = l + w * (.04f + nx * .92f);
                    float y = t + h * (.04f + ny * .92f);
                    p.setColor(colors[i % colors.length]);
                    canvas.save();
                    canvas.rotate((i * 29) % 90 - 45, x, y);
                    canvas.drawRoundRect(new RectF(x - unit, y - unit * .28f, x + unit, y + unit * .28f), unit * .3f, unit * .3f, p);
                    canvas.restore();
                }
            }
        }
    }

    private void drawItem(Canvas canvas, StickerItem item, float left, float top, float width, float height, boolean drawSelection) {
        Bitmap bmp = item.getStickerBitmap();
        if (bmp == null || bmp.isRecycled() || bmp.getWidth() <= 0) return;
        float targetW = item.widthFraction * width;
        float targetH = targetW * (bmp.getHeight() / (float) bmp.getWidth());
        float cx = left + item.centerX * width;
        float cy = top + item.centerY * height;

        Matrix matrix = new Matrix();
        matrix.postTranslate(-bmp.getWidth() / 2f, -bmp.getHeight() / 2f);
        matrix.postScale(targetW / bmp.getWidth(), targetH / bmp.getHeight());
        matrix.postRotate(item.rotationDegrees);
        matrix.postTranslate(cx, cy);
        canvas.drawBitmap(bmp, matrix, paint);

        if (drawSelection) {
            canvas.save();
            canvas.rotate(item.rotationDegrees, cx, cy);
            RectF r = new RectF(cx - targetW / 2f, cy - targetH / 2f, cx + targetW / 2f, cy + targetH / 2f);
            canvas.drawRoundRect(r, dp(5), dp(5), selectionPaint);
            canvas.restore();
        }
    }

    private void drawDecorations(Canvas c, float l, float t, float w, float h) {
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setStyle(Paint.Style.FILL);
        int pink = Color.rgb(255, 165, 198);
        int lavender = Color.rgb(191, 178, 255);
        int mint = Color.rgb(164, 226, 211);

        switch (patternType) {
            case RANDOM_JOURNAL -> {
                drawThemedDecoration(c, l, t, w, h, .12f, .16f, .022f, 0, pink, p);
                drawThemedDecoration(c, l, t, w, h, .83f, .14f, .018f, 1, lavender, p);
                drawThemedDecoration(c, l, t, w, h, .15f, .78f, .016f, 2, mint, p);
                drawThemedDecoration(c, l, t, w, h, .86f, .70f, .018f, 3, pink, p);
                drawThemedDecoration(c, l, t, w, h, .52f, .53f, .018f, 4, lavender, p);
                drawThemedDecoration(c, l, t, w, h, .48f, .90f, .014f, 5, mint, p);
            }
            case BALANCED_GRID -> {
                drawThemedDecoration(c, l, t, w, h, .07f, .07f, .012f, 0, lavender, p);
                drawThemedDecoration(c, l, t, w, h, .93f, .93f, .012f, 1, mint, p);
                drawThemedDecoration(c, l, t, w, h, .93f, .07f, .010f, 2, pink, p);
            }
            case MINI_DENSE -> {
                drawThemedDecoration(c, l, t, w, h, .06f, .50f, .012f, 0, pink, p);
                drawThemedDecoration(c, l, t, w, h, .94f, .50f, .012f, 1, lavender, p);
                drawThemedDecoration(c, l, t, w, h, .50f, .04f, .010f, 2, mint, p);
            }
            case HERO_FOCUS -> {
                drawThemedDecoration(c, l, t, w, h, .82f, .12f, .021f, 0, pink, p);
                drawThemedDecoration(c, l, t, w, h, .13f, .52f, .018f, 1, lavender, p);
                drawThemedDecoration(c, l, t, w, h, .84f, .47f, .018f, 2, mint, p);
                drawThemedDecoration(c, l, t, w, h, .48f, .92f, .014f, 3, pink, p);
            }
        }
    }

    private void drawThemedDecoration(Canvas c, float l, float t, float w, float h,
                                      float nx, float ny, float radiusFraction,
                                      int index, int color, Paint p) {
        int kind;
        switch (decorationTheme) {
            case HEARTS -> kind = 0;
            case STARS -> kind = (index % 2 == 0) ? 1 : 2;
            case FLOWERS -> kind = 3;
            default -> kind = index % 3;
        }
        drawDecorationIfFree(c, l, t, w, h, nx, ny, radiusFraction, kind, color, p);
    }

    private void drawDecorationIfFree(Canvas c, float l, float t, float w, float h,
                                      float nx, float ny, float radiusFraction,
                                      int kind, int color, Paint p) {
        if (!isDecorationAreaFree(nx, ny, radiusFraction, w / Math.max(1f, h))) return;
        float x = l + w * nx;
        float y = t + h * ny;
        float r = w * radiusFraction;
        if (kind == 0) drawHeart(c, x, y, r, color, p);
        else if (kind == 1) drawStar(c, x, y, r, color, p);
        else if (kind == 2) drawSpark(c, x, y, r, color, p);
        else drawFlower(c, x, y, r, color, p);
    }

    private boolean isDecorationAreaFree(float nx, float ny, float radiusFraction, float renderAspect) {
        float radiusY = radiusFraction * renderAspect;
        for (StickerItem item : items) {
            Bitmap bmp = item.getStickerBitmap();
            if (bmp == null || bmp.isRecycled() || bmp.getWidth() <= 0) continue;
            float halfW = item.widthFraction / 2f;
            float halfH = item.widthFraction * renderAspect * (bmp.getHeight() / (float) bmp.getWidth()) / 2f;
            double rad = Math.toRadians(item.rotationDegrees);
            float cos = Math.abs((float) Math.cos(rad));
            float sin = Math.abs((float) Math.sin(rad));
            float rw = halfW * cos + halfH * sin;
            float rh = halfW * sin + halfH * cos;
            float gapX = radiusFraction * 1.6f;
            float gapY = radiusY * 1.6f;
            if (nx + gapX >= item.centerX - rw && nx - gapX <= item.centerX + rw
                    && ny + gapY >= item.centerY - rh && ny - gapY <= item.centerY + rh) return false;
        }
        return nx - radiusFraction > 0.015f && nx + radiusFraction < 0.985f
                && ny - radiusY > 0.015f && ny + radiusY < 0.985f;
    }

    private void drawHeart(Canvas c, float x, float y, float s, int color, Paint p) {
        Path path = new Path();
        path.moveTo(x, y + s * 0.7f);
        path.cubicTo(x - s * 1.4f, y - s * 0.2f, x - s * 0.8f, y - s * 1.2f, x, y - s * 0.45f);
        path.cubicTo(x + s * 0.8f, y - s * 1.2f, x + s * 1.4f, y - s * 0.2f, x, y + s * 0.7f);
        p.setColor(color);
        c.drawPath(path, p);
    }

    private void drawStar(Canvas c, float x, float y, float r, int color, Paint p) {
        Path path = new Path();
        for (int i = 0; i < 10; i++) {
            double a = -Math.PI / 2 + i * Math.PI / 5;
            float rr = (i % 2 == 0) ? r : r * .45f;
            float px = x + (float) Math.cos(a) * rr;
            float py = y + (float) Math.sin(a) * rr;
            if (i == 0) path.moveTo(px, py); else path.lineTo(px, py);
        }
        path.close();
        p.setColor(color);
        c.drawPath(path, p);
    }

    private void drawSpark(Canvas c, float x, float y, float r, int color, Paint p) {
        Path path = new Path();
        path.moveTo(x, y - r);
        path.lineTo(x + r * .25f, y - r * .25f);
        path.lineTo(x + r, y);
        path.lineTo(x + r * .25f, y + r * .25f);
        path.lineTo(x, y + r);
        path.lineTo(x - r * .25f, y + r * .25f);
        path.lineTo(x - r, y);
        path.lineTo(x - r * .25f, y - r * .25f);
        path.close();
        p.setColor(color);
        c.drawPath(path, p);
    }

    private void drawFlower(Canvas c, float x, float y, float r, int color, Paint p) {
        p.setColor(color);
        for (int i = 0; i < 5; i++) {
            double a = -Math.PI / 2 + i * Math.PI * 2 / 5;
            float px = x + (float) Math.cos(a) * r * .58f;
            float py = y + (float) Math.sin(a) * r * .58f;
            c.drawCircle(px, py, r * .42f, p);
        }
        p.setColor(Color.WHITE);
        c.drawCircle(x, y, r * .29f, p);
    }

    public Bitmap renderToBitmap(int width, int height) {
        Bitmap result = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(result);
        drawContent(canvas, 0, 0, width, height, false);
        return result;
    }

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        if (!editingEnabled) return true;
        computePageRect();
        switch (event.getActionMasked()) {
            case MotionEvent.ACTION_DOWN -> {
                lastX = event.getX();
                lastY = event.getY();
                selected = findSticker(lastX, lastY);
                if (selected != null) {
                    items.remove(selected);
                    items.add(selected);
                }
                invalidate();
                return true;
            }
            case MotionEvent.ACTION_POINTER_DOWN -> {
                if (selected != null && event.getPointerCount() >= 2) {
                    initialDistance = distance(event);
                    initialAngle = angle(event);
                    initialScale = selected.widthFraction;
                    initialRotation = selected.rotationDegrees;
                }
                return true;
            }
            case MotionEvent.ACTION_MOVE -> {
                if (selected == null) return true;
                if (event.getPointerCount() >= 2) {
                    float d = distance(event);
                    if (initialDistance > 8f) selected.widthFraction = clamp(initialScale * d / initialDistance, 0.055f, 0.55f);
                    selected.rotationDegrees = initialRotation + (angle(event) - initialAngle);
                } else {
                    float dx = event.getX() - lastX;
                    float dy = event.getY() - lastY;
                    selected.centerX = clamp(selected.centerX + dx / Math.max(1f, pageRect.width()), -0.05f, 1.05f);
                    selected.centerY = clamp(selected.centerY + dy / Math.max(1f, pageRect.height()), -0.05f, 1.05f);
                    lastX = event.getX();
                    lastY = event.getY();
                }
                invalidate();
                return true;
            }
            case MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> { return true; }
        }
        return true;
    }

    private StickerItem findSticker(float x, float y) {
        if (!pageRect.contains(x, y)) return null;
        List<StickerItem> reversed = new ArrayList<>(items);
        Collections.reverse(reversed);
        for (StickerItem item : reversed) {
            Bitmap bmp = item.getStickerBitmap();
            if (bmp == null || bmp.isRecycled() || bmp.getWidth() <= 0) continue;
            float w = item.widthFraction * pageRect.width();
            float h = w * bmp.getHeight() / (float) bmp.getWidth();
            float cx = pageRect.left + item.centerX * pageRect.width();
            float cy = pageRect.top + item.centerY * pageRect.height();
            float dx = x - cx;
            float dy = y - cy;
            double rad = Math.toRadians(-item.rotationDegrees);
            float rx = (float) (dx * Math.cos(rad) - dy * Math.sin(rad));
            float ry = (float) (dx * Math.sin(rad) + dy * Math.cos(rad));
            if (Math.abs(rx) <= w / 2f && Math.abs(ry) <= h / 2f) return item;
        }
        return null;
    }

    private void computePageRect() {
        float margin = dp(14);
        float availableW = Math.max(1, getWidth() - margin * 2);
        float availableH = Math.max(1, getHeight() - margin * 2);
        float w = availableW;
        float h = w / pageAspect;
        if (h > availableH) {
            h = availableH;
            w = h * pageAspect;
        }
        float left = (getWidth() - w) / 2f;
        float top = (getHeight() - h) / 2f;
        pageRect.set(left, top, left + w, top + h);
    }

    private float distance(MotionEvent e) {
        float dx = e.getX(1) - e.getX(0);
        float dy = e.getY(1) - e.getY(0);
        return (float) Math.hypot(dx, dy);
    }

    private float angle(MotionEvent e) {
        return (float) Math.toDegrees(Math.atan2(e.getY(1) - e.getY(0), e.getX(1) - e.getX(0)));
    }

    private float clamp(float v, float min, float max) {
        return Math.max(min, Math.min(max, v));
    }

    private float dp(float v) {
        return v * getResources().getDisplayMetrics().density;
    }
}
