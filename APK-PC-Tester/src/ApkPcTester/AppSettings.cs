using System.Text.Json;

namespace ApkPcTester;

internal sealed class AppSettings
{
    public string? SdkRoot { get; set; }
    public string? LastApkPath { get; set; }
    public string? LastAvd { get; set; }
    public string? LastSerial { get; set; }
    public string? LastPackageId { get; set; }
    public bool AutoLaunchAfterInstall { get; set; } = true;
    public bool KeepDataOnInstall { get; set; } = true;

    public static string SettingsPath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "APK-PC-Tester",
        "settings.json");

    public static AppSettings Load()
    {
        try
        {
            if (!File.Exists(SettingsPath)) return new AppSettings();
            return JsonSerializer.Deserialize<AppSettings>(File.ReadAllText(SettingsPath)) ?? new AppSettings();
        }
        catch
        {
            return new AppSettings();
        }
    }

    public void Save()
    {
        var dir = Path.GetDirectoryName(SettingsPath)!;
        Directory.CreateDirectory(dir);
        var json = JsonSerializer.Serialize(this, new JsonSerializerOptions { WriteIndented = true });
        File.WriteAllText(SettingsPath, json);
    }
}
