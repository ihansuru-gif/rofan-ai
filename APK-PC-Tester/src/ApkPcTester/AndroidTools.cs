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
    public string? AvdManagerPath { get; private set; }

    public bool HasAdb => File.Exists(AdbPath);
    public bool HasEmulator => File.Exists(EmulatorPath);
    public bool HasAvdManager => File.Exists(AvdManagerPath);

    public void Detect(string? preferredSdkRoot)
    {
        SdkRoot = FindSdkRoot(preferredSdkRoot);
        if (SdkRoot is null)
        {
            AdbPath = EmulatorPath = AaptPath = AvdManagerPath = null;
            return;
        }

        AdbPath = Existing(Path.Combine(SdkRoot, "platform-tools", "adb.exe"));
        EmulatorPath = Existing(Path.Combine(SdkRoot, "emulator", "emulator.exe"));
        AaptPath = FindLatestAapt(SdkRoot);
        AvdManagerPath = FindAvdManager(SdkRoot);
    }

    public async Task<IReadOnlyList<string>> GetAvdsAsync()
    {
        if (!HasEmulator) return Array.Empty<string>();
        var r = await ProcessRunner.RunAsync(EmulatorPath!, ["-list-avds"], timeoutMs: 30_000);
        return r.StdOut.Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
    }

    public IReadOnlyList<string> GetInstalledSystemImagePackages()
    {
        if (SdkRoot is null) return Array.Empty<string>();
        var root = Path.Combine(SdkRoot, "system-images");
        if (!Directory.Exists(root)) return Array.Empty<string>();

        var packages = new List<string>();
        try
        {
            foreach (var apiDir in Directory.EnumerateDirectories(root))
            foreach (var tagDir in Directory.EnumerateDirectories(apiDir))
            foreach (var abiDir in Directory.EnumerateDirectories(tagDir))
            {
                if (!File.Exists(Path.Combine(abiDir, "package.xml")) && !File.Exists(Path.Combine(abiDir, "system.img")))
                    continue;

                var api = Path.GetFileName(apiDir);
                var tag = Path.GetFileName(tagDir);
                var abi = Path.GetFileName(abiDir);
                packages.Add($"system-images;{api};{tag};{abi}");
            }
        }
        catch { }

        return packages
            .OrderByDescending(ParseApiLevel)
            .ThenByDescending(x => x.EndsWith(";x86_64", StringComparison.OrdinalIgnoreCase))
            .ToArray();
    }

    public async Task<ProcessResult> CreateBaseAvdAsync(string avdName = "APK_PC_Tester_Base")
    {
        if (!HasAvdManager) throw new InvalidOperationException("avdmanager를 찾지 못했습니다. Android SDK Command-line Tools를 설치해 주세요.");

        var existing = await GetAvdsAsync();
        if (existing.Contains(avdName, StringComparer.OrdinalIgnoreCase))
            return new ProcessResult(0, $"{avdName} already exists", string.Empty);

        var package = GetInstalledSystemImagePackages()
            .FirstOrDefault(x => x.EndsWith(";x86_64", StringComparison.OrdinalIgnoreCase))
            ?? GetInstalledSystemImagePackages().FirstOrDefault();
        if (package is null)
            throw new InvalidOperationException("설치된 Android System Image가 없습니다. Android Studio SDK Manager에서 System Image를 하나 설치해 주세요.");

        var command = $"\"{AvdManagerPath}\" create avd --force --name \"{avdName}\" --package \"{package}\"";
        return await ProcessRunner.RunAsync(
            "cmd.exe",
            ["/d", "/s", "/c", command],
            timeoutMs: 180_000,
            standardInput: "no\r\n");
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

    public Process StartEmulator(string avdName, bool coldBoot = false, bool headless = true)
    {
        if (!HasEmulator) throw new InvalidOperationException("Android Emulator를 찾지 못했습니다.");
        var args = new List<string>
        {
            "-avd", avdName,
            "-netdelay", "none",
            "-netspeed", "full",
            "-no-boot-anim"
        };
        if (headless) args.Add("-no-window");
        if (coldBoot) args.Add("-no-snapshot-load");
        return ProcessRunner.StartDetached(EmulatorPath!, args);
    }

    public async Task WaitForBootAsync(string serial, IProgress<string>? progress = null, CancellationToken ct = default)
    {
        EnsureAdb();
        progress?.Report("가상폰 연결 대기...");
        await ProcessRunner.RunAsync(AdbPath!, ["-s", serial, "wait-for-device"], ct, 180_000);
        var deadline = DateTime.UtcNow.AddMinutes(3);
        while (DateTime.UtcNow < deadline)
        {
            ct.ThrowIfCancellationRequested();
            var r = await ProcessRunner.RunAsync(AdbPath!, ["-s", serial, "shell", "getprop", "sys.boot_completed"], ct, 20_000);
            if (r.StdOut.Trim() == "1")
            {
                progress?.Report("Android 부팅 완료");
                return;
            }
            progress?.Report("Android 부팅 중...");
            await Task.Delay(1200, ct);
        }
        throw new TimeoutException("가상폰 부팅 완료를 확인하지 못했습니다.");
    }

    public async Task<ProcessResult> ApplyDisplayProfileAsync(string serial, DeviceProfile profile)
    {
        var size = await AdbAsync(serial, ["shell", "wm", "size", $"{profile.WidthPx}x{profile.HeightPx}"], 30_000);
        if (!size.Success) return size;
        var density = await AdbAsync(serial, ["shell", "wm", "density", profile.DensityDpi.ToString()], 30_000);
        return Merge(size, density);
    }

    public async Task<ProcessResult> ResetDisplayProfileAsync(string serial)
    {
        var size = await AdbAsync(serial, ["shell", "wm", "size", "reset"], 30_000);
        var density = await AdbAsync(serial, ["shell", "wm", "density", "reset"], 30_000);
        return Merge(size, density);
    }

    public async Task<byte[]> CaptureFrameAsync(string serial, CancellationToken ct = default)
    {
        EnsureAdb();
        var r = await ProcessRunner.RunBytesAsync(AdbPath!, ["-s", serial, "exec-out", "screencap", "-p"], ct, 15_000);
        if (!r.Success || r.StdOut.Length < 8)
            throw new InvalidOperationException(string.IsNullOrWhiteSpace(r.StdErr) ? "가상폰 화면을 가져오지 못했습니다." : r.StdErr);
        return r.StdOut;
    }

    public Task<ProcessResult> TapAsync(string serial, int x, int y)
        => AdbAsync(serial, ["shell", "input", "tap", x.ToString(), y.ToString()], 15_000);

    public Task<ProcessResult> SwipeAsync(string serial, int x1, int y1, int x2, int y2, int durationMs)
        => AdbAsync(serial,
            ["shell", "input", "swipe", x1.ToString(), y1.ToString(), x2.ToString(), y2.ToString(), Math.Clamp(durationMs, 80, 2000).ToString()],
            15_000);

    public Task<ProcessResult> InputTextAsync(string serial, string text)
    {
        var safe = text.Replace(" ", "%s", StringComparison.Ordinal);
        return AdbAsync(serial, ["shell", "input", "text", safe], 30_000);
    }

    public Task<ProcessResult> KeyEventAsync(string serial, int keyCode)
        => AdbAsync(serial, ["shell", "input", "keyevent", keyCode.ToString()], 15_000);

    public async Task<ProcessResult> SetOrientationAsync(string serial, bool landscape)
    {
        var lockRotation = await AdbAsync(serial, ["shell", "settings", "put", "system", "accelerometer_rotation", "0"], 15_000);
        var rotate = await AdbAsync(serial,
            ["shell", "settings", "put", "system", "user_rotation", landscape ? "1" : "0"], 15_000);
        return Merge(lockRotation, rotate);
    }

    public Task<ProcessResult> StopEmulatorAsync(string serial)
        => AdbAsync(serial, ["emu", "kill"], 30_000);

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
        var bytes = await CaptureFrameAsync(serial);
        await File.WriteAllBytesAsync(destinationPng, bytes);
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

    private static ProcessResult Merge(ProcessResult first, ProcessResult second)
        => new(
            first.Success && second.Success ? 0 : (second.ExitCode != 0 ? second.ExitCode : first.ExitCode),
            string.Join(Environment.NewLine, new[] { first.StdOut, second.StdOut }.Where(s => !string.IsNullOrWhiteSpace(s))),
            string.Join(Environment.NewLine, new[] { first.StdErr, second.StdErr }.Where(s => !string.IsNullOrWhiteSpace(s))));

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

    private static string? FindAvdManager(string sdkRoot)
    {
        var latest = Path.Combine(sdkRoot, "cmdline-tools", "latest", "bin", "avdmanager.bat");
        if (File.Exists(latest)) return latest;

        var root = Path.Combine(sdkRoot, "cmdline-tools");
        if (!Directory.Exists(root)) return null;
        try
        {
            return Directory.EnumerateFiles(root, "avdmanager.bat", SearchOption.AllDirectories)
                .OrderByDescending(x => x, StringComparer.OrdinalIgnoreCase)
                .FirstOrDefault();
        }
        catch { return null; }
    }

    private static int ParseApiLevel(string package)
    {
        var m = Regex.Match(package, @"android-(\d+)", RegexOptions.IgnoreCase);
        return m.Success && int.TryParse(m.Groups[1].Value, out var api) ? api : 0;
    }

    private static Version ParseVersion(string text)
    {
        var numeric = new string(text.TakeWhile(c => char.IsDigit(c) || c == '.').ToArray()).TrimEnd('.');
        return Version.TryParse(numeric, out var v) ? v : new Version(0, 0);
    }
}
