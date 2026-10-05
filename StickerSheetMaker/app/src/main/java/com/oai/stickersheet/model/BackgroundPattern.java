package com.oai.stickersheet.model;

public enum BackgroundPattern {
    PLAIN("기본 흰 배경"),
    DOTS("파스텔 도트"),
    CHECKER("연한 체크"),
    GRID("노트 그리드"),
    CONFETTI("파스텔 조각");

    public final String label;

    BackgroundPattern(String label) {
        this.label = label;
    }

    public static BackgroundPattern fromOrdinal(int ordinal) {
        BackgroundPattern[] values = values();
        if (ordinal < 0 || ordinal >= values.length) return PLAIN;
        return values[ordinal];
    }
}
