namespace ApkPcTester;

internal sealed record DeviceProfile(string Name, int WidthPx, int HeightPx, int DensityDpi, string Note)
{
    public int WidthDp => (int)Math.Round(WidthPx * 160d / DensityDpi);
    public int HeightDp => (int)Math.Round(HeightPx * 160d / DensityDpi);

    public override string ToString()
        => $"{Name} · {WidthPx}×{HeightPx} · {DensityDpi}dpi · 약 {WidthDp}dp 폭";

    public static IReadOnlyList<DeviceProfile> Presets { get; } =
    [
        new("좁은 폰 360dp", 1080, 2400, 480, "폭이 좁은 일반 안드로이드폰 UI 점검용"),
        new("일반 폰 393dp", 1080, 2340, 440, "중간 폭 스마트폰 UI 점검용"),
        new("넓은 폰 411dp", 1080, 2400, 420, "폭이 조금 넓은 스마트폰 UI 점검용"),
        new("QHD 폰 411dp", 1440, 3120, 560, "고해상도 스마트폰에서 같은 논리 폭 확인용"),
        new("저해상도 폰 360dp", 720, 1600, 320, "낮은 픽셀 해상도에서 레이아웃/이미지 점검용"),
        new("태블릿 800dp", 1600, 2560, 320, "태블릿 폭 레이아웃 점검용")
    ];
}
