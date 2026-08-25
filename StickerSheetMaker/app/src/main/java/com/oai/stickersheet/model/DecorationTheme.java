package com.oai.stickersheet.model;

public enum DecorationTheme {
    PASTEL_MIX("파스텔 믹스"),
    HEARTS("하트"),
    STARS("별/반짝이"),
    FLOWERS("꽃");

    public final String label;

    DecorationTheme(String label) {
        this.label = label;
    }

    public static DecorationTheme fromOrdinal(int ordinal) {
        DecorationTheme[] values = values();
        if (ordinal < 0 || ordinal >= values.length) return PASTEL_MIX;
        return values[ordinal];
    }
}
