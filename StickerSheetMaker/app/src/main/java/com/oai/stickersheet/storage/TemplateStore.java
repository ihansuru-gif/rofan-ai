package com.oai.stickersheet.storage;

import android.content.Context;
import android.content.SharedPreferences;

import com.oai.stickersheet.model.BackgroundPattern;
import com.oai.stickersheet.model.DecorationTheme;
import com.oai.stickersheet.model.StickerItem;

import java.util.List;
import java.util.Locale;

public final class TemplateStore {
    private static final String PREFS = "sticker_sheet_templates_v2";

    private TemplateStore() {}

    public static final class Config {
        public int patternIndex;
        public int pageIndex;
        public int borderProgress;
        public int lineProgress;
        public boolean cutLine;
        public boolean decorations;
        public BackgroundPattern backgroundPattern = BackgroundPattern.PLAIN;
        public DecorationTheme decorationTheme = DecorationTheme.PASTEL_MIX;
        public String layoutData = "";
    }

    public static void save(Context context, int slot, Config config) {
        validateSlot(slot);
        String p = "s" + slot + "_";
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putBoolean(p + "exists", true)
                .putInt(p + "pattern", config.patternIndex)
                .putInt(p + "page", config.pageIndex)
                .putInt(p + "border", config.borderProgress)
                .putInt(p + "line", config.lineProgress)
                .putBoolean(p + "cut", config.cutLine)
                .putBoolean(p + "deco", config.decorations)
                .putInt(p + "background", config.backgroundPattern.ordinal())
                .putInt(p + "deco_theme", config.decorationTheme.ordinal())
                .putString(p + "layout", config.layoutData == null ? "" : config.layoutData)
                .apply();
    }

    public static Config load(Context context, int slot) {
        validateSlot(slot);
        String p = "s" + slot + "_";
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (!prefs.getBoolean(p + "exists", false)) return null;
        Config config = new Config();
        config.patternIndex = prefs.getInt(p + "pattern", 0);
        config.pageIndex = prefs.getInt(p + "page", 0);
        config.borderProgress = prefs.getInt(p + "border", 14);
        config.lineProgress = prefs.getInt(p + "line", 3);
        config.cutLine = prefs.getBoolean(p + "cut", true);
        config.decorations = prefs.getBoolean(p + "deco", true);
        config.backgroundPattern = BackgroundPattern.fromOrdinal(prefs.getInt(p + "background", 0));
        config.decorationTheme = DecorationTheme.fromOrdinal(prefs.getInt(p + "deco_theme", 0));
        config.layoutData = prefs.getString(p + "layout", "");
        return config;
    }

    public static boolean exists(Context context, int slot) {
        validateSlot(slot);
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getBoolean("s" + slot + "_exists", false);
    }

    public static String encodeLayout(List<StickerItem> items) {
        if (items == null || items.isEmpty()) return "";
        StringBuilder sb = new StringBuilder(items.size() * 32);
        for (int i = 0; i < items.size(); i++) {
            StickerItem item = items.get(i);
            if (i > 0) sb.append(';');
            sb.append(String.format(Locale.US, "%.5f,%.5f,%.5f,%.3f",
                    item.centerX, item.centerY, item.widthFraction, item.rotationDegrees));
        }
        return sb.toString();
    }

    public static int applyLayout(String data, List<StickerItem> items) {
        if (data == null || data.trim().isEmpty() || items == null || items.isEmpty()) return 0;
        String[] entries = data.split(";");
        int applied = 0;
        int count = Math.min(entries.length, items.size());
        for (int i = 0; i < count; i++) {
            String[] parts = entries[i].split(",");
            if (parts.length != 4) continue;
            try {
                float x = Float.parseFloat(parts[0]);
                float y = Float.parseFloat(parts[1]);
                float w = Float.parseFloat(parts[2]);
                float r = Float.parseFloat(parts[3]);
                StickerItem item = items.get(i);
                item.centerX = clamp(x, -0.05f, 1.05f);
                item.centerY = clamp(y, -0.05f, 1.05f);
                item.widthFraction = clamp(w, 0.045f, 0.55f);
                item.rotationDegrees = isFinite(r) ? r : 0f;
                applied++;
            } catch (NumberFormatException ignored) {
                // Corrupt one entry without discarding the rest of the template.
            }
        }
        return applied;
    }

    private static float clamp(float value, float min, float max) {
        if (!isFinite(value)) return (min + max) * .5f;
        return Math.max(min, Math.min(max, value));
    }

    private static boolean isFinite(float value) {
        return !Float.isNaN(value) && !Float.isInfinite(value);
    }

    private static void validateSlot(int slot) {
        if (slot < 1 || slot > 3) throw new IllegalArgumentException("템플릿 슬롯은 1~3만 지원합니다.");
    }
}
