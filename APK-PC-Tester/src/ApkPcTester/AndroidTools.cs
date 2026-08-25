using System.Diagnostics;
using System.Text.RegularExpressions;

namespace ApkPcTester;

internal sealed record AndroidDevice(string Serial, string State, string Description)
{
    public override string ToString() => $"{Serial}  [{State}]  {Description}".Trim();
}

internal sealed class AndroidTools
{
    public string? SdkRoot { get; private set; }
    public string? AdbPath { get; private set; }
    public string? EmulatorPath { get; private set; }
    public string? AaptPath { get; private set; }

    public bool HasAdb => File.Exists(AdbPath);
    public bool HasEmulator => File.Exists(EmulatorPath);

    public void Detect(string? preferredSdkRoot)
    {
        SdkRoot = FindSdkRoot(preferredSdkRoot);
        if (SdkRoot is null)
        {
            AdbPath = EmulatorPath = AaptPath = null;
            return;
        }

        AdbPath = Existing(Path.Combine(SdkRoot, "platform-tools", "adb.exe"));
        EmulatorPath = Existing(Path.Combine(SdkRoot, "emulator", "emulator.exe"));
        AaptPath = FindLatestAapt(SdkRoot);
    }

    public async Task<IReadOnlyList<string>> GetAvdsAsync()
    {
        if (!HasEmulator) return Array.Empty<string>();
        var r = await ProcessRunner.RunAsync(EmulatorPath!, ["-list-avds"], timeoutMs: 30_000);
        return r.StdOut.Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
    }

    public async Task<IReadOnlyList<AndroidDevice>> GetDevicesAsync()
    {
        EnsureAdb();
        var r = await ProcessRunner.RunAsync(AdbPath!, ["devices", "-l"], timeoutMs: 30_000);
        var devices = new List<AndroidDevice>();
        foreach (var line in r.StdOut.Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Skip(1))
        {
            if (line.StartsWith("* daemon", StringComparison.OrdinalIgnoreCase)) continue;
            var m = Regex.Match(line, @"^(\S+)\s+(\S+)(?:\s+(.*))?$");
            if (!m.Success) continue;
            devices.Add(new AndroidDevice(m.Groups[1].Value, m.Groups[2].Value, m.Groups[3].Value));
        }
        return devices;
    }

    public Process StartEmulator(string avdName, bool coldBoot = false)
    {
        if (!HasEmulator) throw new InvalidOperationException("Android Emulator를 찾지 못했습니다.");
        var args = new List<string> { "-avd", avdName, "-netdelay", "none", "-netspeed", "full" };
        if (coldBoot) args.Add("-no-snapshot-load");
        return ProcessRunner.StartDetached(EmulatorPath!, args);
    }

    public async Task WaitForBootAsync(string serial, IProgress<string>? progress = null, CancellationToken ct = default)
    {
        EnsureAdb();
        progress?.Report("기기 연결 대기...");
        await ProcessRunner.RunAsync(AdbPath!, ["-s", serial, "wait-for-device"], ct, 180_000);
        var deadline = DateTime.UtcNow.AddMinutes(3);
        while (DateTime.UtcNow < deadline)
        {
            ct.ThrowIfCancellationRequested();
            var r = await ProcessRunner.RunAsync(AdbPath!, ["-s", serial, "shell", "getprop", "sys.boot_completed"], ct, 20_000);
            if (r.StdOut.Trim() == "1")
            {
                progress?.Report("부팅 완료");
                return;
            }
            progress?.Report("Android 부팅 중...");
            await Task.Delay(1500, ct);
        }
        throw new TimeoutException("에뮬레이터 부팅 완료를 확인하지 못했습니다.");
    }

    public async Task<ProcessResult> InstallApkAsync(string serial, string apkPath, bool replaceExisting)
    {
        EnsureAdb();
        var args = new List<string> { "-s", serial, "install" };
        if (replaceExisting) args.Add("-r");
        args.Add("-d");
        args.Add(apkPath);
        return await ProcessRunner.RunAsync(AdbPath!, args, timeoutMs: 300_000);
    }

    public async Task<string?> DetectPackageIdAsync(string apkPath)
    {
        if (!File.Exists(AaptPath)) return null;
        var r = await ProcessRunner.RunAsync(AaptPath!, ["dump", "badging", apkPath], timeoutMs: 60_000);
        if (!r.Success && string.IsNullOrWhiteSpace(r.StdOut)) return null;
        var m = Regex.Match(r.StdOut, @"package:\s+name='([^']+)'", RegexOptions.IgnoreCase);
        return m.Success ? m.Groups[1].Value : null;
    }

    public Task<ProcessResult> LaunchAppAsync(string serial, string packageId)
        => AdbAsync(serial, ["shell", "monkey", "-p", packageId, "-c", "android.intent.category.LAUNCHER", "1"], 60_000);

    public Task<ProcessResult> ForceStopAsync(string serial, string packageId)
        => AdbAsync(serial, ["shell", "am", "force-stop", packageId], 30_000);

    public Task<ProcessResult> ClearDataAsync(string serial, string packageId)
        => AdbAsync(serial, ["shell", "pm", "clear", packageId], 60_000);

    public Task<ProcessResult> UninstallAsync(string serial, string packageId)
        => AdbAsync(serial, ["uninstall", packageId], 60_000);

    public Task<ProcessResult> RebootAsync(string serial)
        => AdbAsync(serial, ["reboot"], 30_000);

    public async Task<int?> GetPidAsync(string serial, string packageId)
    {
        var r = await AdbAsync(serial, ["shell", "pidof", packageId], 20_000);
        var token = r.StdOut.Split([' ', '\r', '\n'], StringSplitOptions.RemoveEmptyEntries).FirstOrDefault();
        return int.TryParse(token, out var pid) ? pid : null;
    }

    public Process StartLogcat(string serial, int? pid, Action<string> onLine, Action<string> onError, Action<int>? onExit = null)
    {
        EnsureAdb();
        var args = new List<string> { "-s", serial, "logcat", "-v", "threadtime" };
        if (pid is not null) args.Add($"--pid={pid.Value}");
        return ProcessRunner.StartStreaming(AdbPath!, args, onLine, onError, onExit);
    }

    public async Task<string> CaptureScreenshotAsync(string serial, string destinationPng)
    {
        EnsureAdb();
        const string remote = "/sdcard/apk_pc_tester_capture.png";
        var shot = await AdbAsync(serial, ["shell", "screencap", "-p", remote], 60_000);
        if (!shot.Success) throw new InvalidOperationException(Combine(shot));
        var pull = await AdbAsync(serial, ["pull", remote, destinationPng], 120_000);
        await AdbAsync(serial, ["shell", "rm", remote], 20_000);
        if (!pull.Success) throw new InvalidOperationException(Combine(pull));
        return destinationPng;
    }

    public Task<ProcessResult> ClearLogcatAsync(string serial)
        => AdbAsync(serial, ["logcat", "-c"], 30_000);

    private Task<ProcessResult> AdbAsync(string serial, IEnumerable<string> args, int timeoutMs)
    {
        EnsureAdb();
        var all = new List<string> { "-s", serial };
        all.AddRange(args);
        return ProcessRunner.RunAsync(AdbPath!, all, timeoutMs: timeoutMs);
    }

    private void EnsureAdb()
    {
        if (!HasAdb) throw new InvalidOperationException("adb.exe를 찾지 못했습니다. Android SDK 경로를 확인해 주세요.");
    }

    private static string Combine(ProcessResult r)
        => string.Join(Environment.NewLine, new[] { r.StdOut, r.StdErr }.Where(s => !string.IsNullOrWhiteSpace(s)));

    private static string? Existing(string path) => File.Exists(path) ? path : null;

    private static string? FindSdkRoot(string? preferred)
    {
        var candidates = new List<string?>
        {
            preferred,
            Environment.GetEnvironmentVariable("ANDROID_SDK_ROOT"),
            Environment.GetEnvironmentVariable("ANDROID_HOME"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Android", "Sdk")
        };
        return candidates
            .Where(s => !string.IsNullOrWhiteSpace(s))
            .Select(s => Path.GetFullPath(s!))
            .FirstOrDefault(Directory.Exists);
    }

    private static string? FindLatestAapt(string sdkRoot)
    {
        var root = Path.Combine(sdkRoot, "build-tools");
        if (!Directory.Exists(root)) return null;
        var dirs = Directory.GetDirectories(root)
            .Select(d => new { Dir = d, Name = Path.GetFileName(d), Version = ParseVersion(Path.GetFileName(d)) })
            .OrderByDescending(x => x.Version)
            .ThenByDescending(x => x.Name, StringComparer.OrdinalIgnoreCase);
        foreach (var d in dirs)
        {
            var aapt = Path.Combine(d.Dir, "aapt.exe");
            if (File.Exists(aapt)) return aapt;
        }
        return null;
    }

    private static Version ParseVersion(string text)
    {
        var numeric = new string(text.TakeWhile(c => char.IsDigit(c) || c == '.').ToArray()).TrimEnd('.');
        return Version.TryParse(numeric, out var v) ? v : new Version(0, 0);
    }
}
