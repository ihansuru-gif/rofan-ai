using System.Diagnostics;

namespace ApkPcTester;

internal sealed class MainForm : Form
{
    private readonly AndroidTools _android = new();
    private readonly AppSettings _settings = AppSettings.Load();
    private readonly CancellationTokenSource _lifetime = new();
    private Process? _logcatProcess;

    private readonly TextBox _sdkBox = new() { Dock = DockStyle.Fill };
    private readonly TextBox _apkBox = new() { Dock = DockStyle.Fill, AllowDrop = true };
    private readonly TextBox _packageBox = new() { Dock = DockStyle.Fill };
    private readonly ComboBox _avdBox = new() { Dock = DockStyle.Fill, DropDownStyle = ComboBoxStyle.DropDownList };
    private readonly ComboBox _deviceBox = new() { Dock = DockStyle.Fill, DropDownStyle = ComboBoxStyle.DropDownList };
    private readonly CheckBox _autoLaunchCheck = new() { Text = "설치 후 자동 실행", AutoSize = true };
    private readonly CheckBox _replaceCheck = new() { Text = "기존 앱 위에 재설치(-r)", AutoSize = true };
    private readonly Label _status = new() { Dock = DockStyle.Fill, AutoSize = false, TextAlign = ContentAlignment.MiddleLeft, Padding = new Padding(10, 0, 10, 0) };
    private readonly RichTextBox _console = new()
    {
        Dock = DockStyle.Fill,
        ReadOnly = true,
        Font = new Font("Consolas", 9F),
        BackColor = Color.FromArgb(24, 24, 27),
        ForeColor = Color.Gainsboro,
        BorderStyle = BorderStyle.FixedSingle,
        DetectUrls = false
    };
    private readonly Button _logButton = new() { Text = "Logcat 시작", AutoSize = true };
    private readonly System.Windows.Forms.Timer _deviceTimer = new() { Interval = 5000 };

    public MainForm()
    {
        Text = "APK PC Tester";
        MinimumSize = new Size(980, 680);
        Size = new Size(1180, 780);
        StartPosition = FormStartPosition.CenterScreen;
        AllowDrop = true;
        Font = new Font("Segoe UI", 9F);

        BuildUi();
        WireEvents();
        RestoreSettings();
    }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        _deviceTimer.Stop();
        _lifetime.Cancel();
        ProcessRunner.TryKill(_logcatProcess);
        SaveSettings();
        base.OnFormClosed(e);
    }

    private void BuildUi()
    {
        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 3,
            Padding = new Padding(12),
        };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 44));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        Controls.Add(root);

        _status.Text = "환경 확인 중...";
        _status.BackColor = Color.FromArgb(237, 242, 247);
        root.Controls.Add(_status, 0, 0);

        var setup = new TableLayoutPanel { Dock = DockStyle.Top, AutoSize = true, ColumnCount = 4, Padding = new Padding(0, 10, 0, 10) };
        setup.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 120));
        setup.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        setup.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        setup.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        root.Controls.Add(setup, 0, 1);

        AddRow(setup, 0, "Android SDK", _sdkBox,
            MakeButton("SDK 선택", ChooseSdk), MakeButton("환경 새로고침", async (_, _) => await RefreshEnvironmentAsync()));
        AddRow(setup, 1, "APK 파일", _apkBox,
            MakeButton("APK 선택", ChooseApk), MakeButton("패키지 자동감지", async (_, _) => await DetectPackageAsync()));
        AddRow(setup, 2, "Package ID", _packageBox, null, null);
        AddRow(setup, 3, "가상 기기(AVD)", _avdBox,
            MakeButton("에뮬레이터 실행", async (_, _) => await LaunchSelectedAvdAsync()),
            MakeButton("콜드부팅", async (_, _) => await LaunchSelectedAvdAsync(coldBoot: true)));
        AddRow(setup, 4, "연결 기기", _deviceBox,
            MakeButton("기기 새로고침", async (_, _) => await RefreshDevicesAsync()),
            MakeButton("기기 재부팅", async (_, _) => await RunDeviceActionAsync("기기 재부팅", (s, _) => _android.RebootAsync(s))));

        var options = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoSize = true, FlowDirection = FlowDirection.LeftToRight, Padding = new Padding(120, 5, 0, 8) };
        _autoLaunchCheck.Checked = true;
        _replaceCheck.Checked = true;
        options.Controls.Add(_autoLaunchCheck);
        options.Controls.Add(_replaceCheck);
        setup.Controls.Add(options, 0, 5);
        setup.SetColumnSpan(options, 4);

        var work = new SplitContainer { Dock = DockStyle.Fill, Orientation = Orientation.Vertical, SplitterDistance = 350, Panel1MinSize = 310 };
        root.Controls.Add(work, 0, 2);

        var actions = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            AutoScroll = true,
            Padding = new Padding(0, 0, 8, 0)
        };
        work.Panel1.Controls.Add(actions);

        var install = MakeBigButton("APK 설치 + 실행", async (_, _) => await InstallAndRunAsync());
        actions.Controls.Add(install);
        actions.Controls.Add(MakeBigButton("앱 실행", async (_, _) => await RunPackageActionAsync("앱 실행", _android.LaunchAppAsync)));
        actions.Controls.Add(MakeBigButton("앱 강제 종료", async (_, _) => await RunPackageActionAsync("앱 강제 종료", _android.ForceStopAsync)));
        actions.Controls.Add(MakeBigButton("앱 데이터 초기화", async (_, _) => await ConfirmAndRunPackageActionAsync(
            "앱 데이터 초기화", "앱의 저장 데이터가 모두 지워집니다. 계속할까요?", _android.ClearDataAsync)));
        actions.Controls.Add(MakeBigButton("앱 삭제", async (_, _) => await ConfirmAndRunPackageActionAsync(
            "앱 삭제", "선택한 기기에서 이 앱을 삭제합니다. 계속할까요?", _android.UninstallAsync)));
        actions.Controls.Add(MakeBigButton("스크린샷 저장", async (_, _) => await CaptureScreenshotAsync()));

        var hint = new Label
        {
            AutoSize = false,
            Width = 315,
            Height = 120,
            Padding = new Padding(8),
            Text = "사용 순서\r\n1) Android SDK 확인\r\n2) AVD 실행\r\n3) APK를 창에 끌어놓기\r\n4) ‘APK 설치 + 실행’\r\n\r\n실제 USB 폰도 adb에 잡히면 선택 가능"
        };
        actions.Controls.Add(hint);

        var right = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 2, ColumnCount = 1 };
        right.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        right.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        work.Panel2.Controls.Add(right);

        var logToolbar = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoSize = true, FlowDirection = FlowDirection.LeftToRight };
        _logButton.Click += async (_, _) => await ToggleLogcatAsync();
        logToolbar.Controls.Add(_logButton);
        logToolbar.Controls.Add(MakeButton("Logcat 비우기", async (_, _) => await ClearDeviceLogcatAsync()));
        logToolbar.Controls.Add(MakeButton("화면 지우기", (_, _) => _console.Clear()));
        logToolbar.Controls.Add(MakeButton("로그 저장", SaveConsole));
        right.Controls.Add(logToolbar, 0, 0);
        right.Controls.Add(_console, 0, 1);
    }

    private void WireEvents()
    {
        Shown += async (_, _) =>
        {
            await RefreshEnvironmentAsync();
            _deviceTimer.Start();
        };

        _deviceTimer.Tick += async (_, _) => await RefreshDevicesAsync(silent: true);

        DragEnter += OnDragEnter;
        DragDrop += OnDragDrop;
        _apkBox.DragEnter += OnDragEnter;
        _apkBox.DragDrop += OnDragDrop;
        _apkBox.TextChanged += (_, _) =>
        {
            _settings.LastApkPath = _apkBox.Text.Trim();
            SaveSettings();
        };
        _packageBox.TextChanged += (_, _) =>
        {
            _settings.LastPackageId = _packageBox.Text.Trim();
            SaveSettings();
        };
        _avdBox.SelectedIndexChanged += (_, _) =>
        {
            if (_avdBox.SelectedItem is string avd) _settings.LastAvd = avd;
            SaveSettings();
        };
        _deviceBox.SelectedIndexChanged += (_, _) =>
        {
            if (_deviceBox.SelectedItem is AndroidDevice d) _settings.LastSerial = d.Serial;
            SaveSettings();
        };
        _autoLaunchCheck.CheckedChanged += (_, _) => SaveSettings();
        _replaceCheck.CheckedChanged += (_, _) => SaveSettings();
    }

    private static Button MakeButton(string text, EventHandler handler)
    {
        var b = new Button { Text = text, AutoSize = true, Margin = new Padding(6, 2, 0, 2) };
        b.Click += handler;
        return b;
    }

    private static Button MakeBigButton(string text, EventHandler handler)
    {
        var b = new Button
        {
            Text = text,
            Width = 315,
            Height = 44,
            Margin = new Padding(0, 0, 0, 8),
            TextAlign = ContentAlignment.MiddleLeft,
            Padding = new Padding(12, 0, 0, 0)
        };
        b.Click += handler;
        return b;
    }

    private static void AddRow(TableLayoutPanel table, int row, string label, Control editor, Control? button1, Control? button2)
    {
        while (table.RowCount <= row) table.RowCount++;
        table.RowStyles.Add(new RowStyle(SizeType.Absolute, 35));
        table.Controls.Add(new Label { Text = label, Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft }, 0, row);
        table.Controls.Add(editor, 1, row);
        if (button1 is not null) table.Controls.Add(button1, 2, row);
        if (button2 is not null) table.Controls.Add(button2, 3, row);
    }

    private void RestoreSettings()
    {
        _sdkBox.Text = _settings.SdkRoot ?? string.Empty;
        _apkBox.Text = _settings.LastApkPath ?? string.Empty;
        _packageBox.Text = _settings.LastPackageId ?? string.Empty;
        _autoLaunchCheck.Checked = _settings.AutoLaunchAfterInstall;
        _replaceCheck.Checked = _settings.KeepDataOnInstall;
    }

    private void SaveSettings()
    {
        _settings.SdkRoot = string.IsNullOrWhiteSpace(_sdkBox.Text) ? null : _sdkBox.Text.Trim();
        _settings.LastApkPath = string.IsNullOrWhiteSpace(_apkBox.Text) ? null : _apkBox.Text.Trim();
        _settings.LastPackageId = string.IsNullOrWhiteSpace(_packageBox.Text) ? null : _packageBox.Text.Trim();
        _settings.AutoLaunchAfterInstall = _autoLaunchCheck.Checked;
        _settings.KeepDataOnInstall = _replaceCheck.Checked;
        _settings.Save();
    }

    private async Task RefreshEnvironmentAsync()
    {
        try
        {
            SetBusyStatus("Android SDK 확인 중...");
            _android.Detect(string.IsNullOrWhiteSpace(_sdkBox.Text) ? null : _sdkBox.Text.Trim());
            if (_android.SdkRoot is not null && string.IsNullOrWhiteSpace(_sdkBox.Text)) _sdkBox.Text = _android.SdkRoot;

            _avdBox.Items.Clear();
            if (_android.HasEmulator)
            {
                foreach (var avd in await _android.GetAvdsAsync()) _avdBox.Items.Add(avd);
                SelectComboItem(_avdBox, _settings.LastAvd);
            }

            await RefreshDevicesAsync(silent: true);
            if (_android.HasAdb && _android.HasEmulator)
                SetStatus($"준비됨 · SDK: {_android.SdkRoot} · AVD {_avdBox.Items.Count}개", true);
            else if (_android.HasAdb)
                SetStatus("adb는 찾았지만 Android Emulator가 없습니다. Android Studio의 SDK Tools에서 Emulator를 설치하세요.", false);
            else
                SetStatus("Android SDK/adb를 찾지 못했습니다. SDK 선택 버튼으로 Android SDK 폴더를 지정하세요.", false);
        }
        catch (Exception ex)
        {
            SetStatus("환경 확인 실패: " + ex.Message, false);
            AppendLog("[환경 오류] " + ex);
        }
    }

    private async Task RefreshDevicesAsync(bool silent = false)
    {
        try
        {
            if (!_android.HasAdb) return;
            var selected = (_deviceBox.SelectedItem as AndroidDevice)?.Serial ?? _settings.LastSerial;
            var devices = await _android.GetDevicesAsync();
            _deviceBox.BeginUpdate();
            _deviceBox.Items.Clear();
            foreach (var d in devices) _deviceBox.Items.Add(d);
            _deviceBox.EndUpdate();
            SelectDevice(selected);
            if (!silent) AppendLog($"[기기] {devices.Count}개 감지");
        }
        catch (Exception ex)
        {
            if (!silent) AppendLog("[기기 새로고침 오류] " + ex.Message);
        }
    }

    private async Task LaunchSelectedAvdAsync(bool coldBoot = false)
    {
        try
        {
            if (_avdBox.SelectedItem is not string avd)
                throw new InvalidOperationException("실행할 AVD를 선택하세요.");
            _android.StartEmulator(avd, coldBoot);
            AppendLog($"[에뮬레이터] {avd} 실행 요청 ({(coldBoot ? "콜드부팅" : "일반")})");
            SetBusyStatus("에뮬레이터가 뜨는 중입니다. 연결되면 자동으로 기기 목록에 나타납니다.");

            for (var i = 0; i < 60; i++)
            {
                await Task.Delay(1500, _lifetime.Token);
                await RefreshDevicesAsync(silent: true);
                var emulator = _deviceBox.Items.Cast<AndroidDevice>().FirstOrDefault(d => d.Serial.StartsWith("emulator-", StringComparison.OrdinalIgnoreCase));
                if (emulator is not null)
                {
                    _deviceBox.SelectedItem = emulator;
                    await _android.WaitForBootAsync(emulator.Serial, new Progress<string>(m => SetBusyStatus(m)), _lifetime.Token);
                    SetStatus($"에뮬레이터 준비 완료: {emulator.Serial}", true);
                    return;
                }
            }
            SetStatus("에뮬레이터 창은 실행했지만 adb 연결을 아직 확인하지 못했습니다.", false);
        }
        catch (OperationCanceledException) { }
        catch (Exception ex)
        {
            ShowError("에뮬레이터 실행 실패", ex);
        }
    }

    private async Task InstallAndRunAsync()
    {
        try
        {
            var apk = RequireApk();
            var serial = RequireSerial();
            SetBusyStatus("APK 분석 중...");

            var packageId = _packageBox.Text.Trim();
            if (string.IsNullOrWhiteSpace(packageId))
            {
                packageId = await _android.DetectPackageIdAsync(apk) ?? string.Empty;
                if (!string.IsNullOrWhiteSpace(packageId)) _packageBox.Text = packageId;
            }

            AppendLog($"[설치] {Path.GetFileName(apk)} -> {serial}");
            SetBusyStatus("APK 설치 중...");
            var install = await _android.InstallApkAsync(serial, apk, _replaceCheck.Checked);
            AppendResult("install", install);
            if (!install.Success)
                throw new InvalidOperationException("APK 설치 실패\r\n" + CombineResult(install));

            if (_autoLaunchCheck.Checked)
            {
                if (string.IsNullOrWhiteSpace(packageId))
                {
                    SetStatus("설치는 완료됐지만 Package ID를 자동 감지하지 못해 자동 실행은 건너뛰었습니다.", false);
                    return;
                }
                SetBusyStatus("앱 실행 중...");
                var run = await _android.LaunchAppAsync(serial, packageId);
                AppendResult("launch", run);
                if (!run.Success) throw new InvalidOperationException("앱 실행 실패\r\n" + CombineResult(run));
            }

            SetStatus("설치/실행 완료", true);
        }
        catch (Exception ex)
        {
            ShowError("APK 설치/실행 실패", ex);
        }
    }

    private async Task DetectPackageAsync()
    {
        try
        {
            var apk = RequireApk();
            var id = await _android.DetectPackageIdAsync(apk);
            if (string.IsNullOrWhiteSpace(id))
                throw new InvalidOperationException("Package ID를 읽지 못했습니다. Android SDK Build-Tools(aapt)가 설치되어 있는지 확인하세요.");
            _packageBox.Text = id;
            SetStatus("Package ID 감지: " + id, true);
        }
        catch (Exception ex) { ShowError("패키지 감지 실패", ex); }
    }

    private async Task RunPackageActionAsync(string name, Func<string, string, Task<ProcessResult>> action)
    {
        try
        {
            var serial = RequireSerial();
            var pkg = RequirePackageId();
            SetBusyStatus(name + " 중...");
            var r = await action(serial, pkg);
            AppendResult(name, r);
            if (!r.Success) throw new InvalidOperationException(CombineResult(r));
            SetStatus(name + " 완료", true);
        }
        catch (Exception ex) { ShowError(name + " 실패", ex); }
    }

    private async Task ConfirmAndRunPackageActionAsync(string name, string message, Func<string, string, Task<ProcessResult>> action)
    {
        if (MessageBox.Show(this, message, name, MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;
        await RunPackageActionAsync(name, action);
    }

    private async Task RunDeviceActionAsync(string name, Func<string, string?, Task<ProcessResult>> action)
    {
        try
        {
            var serial = RequireSerial();
            SetBusyStatus(name + " 중...");
            var r = await action(serial, null);
            AppendResult(name, r);
            if (!r.Success) throw new InvalidOperationException(CombineResult(r));
            SetStatus(name + " 명령 완료", true);
        }
        catch (Exception ex) { ShowError(name + " 실패", ex); }
    }

    private async Task CaptureScreenshotAsync()
    {
        try
        {
            var serial = RequireSerial();
            using var dialog = new SaveFileDialog
            {
                Filter = "PNG image|*.png",
                FileName = $"apk-test-{DateTime.Now:yyyyMMdd-HHmmss}.png"
            };
            if (dialog.ShowDialog(this) != DialogResult.OK) return;
            SetBusyStatus("스크린샷 저장 중...");
            var path = await _android.CaptureScreenshotAsync(serial, dialog.FileName);
            AppendLog("[스크린샷] " + path);
            SetStatus("스크린샷 저장 완료", true);
        }
        catch (Exception ex) { ShowError("스크린샷 실패", ex); }
    }

    private async Task ToggleLogcatAsync()
    {
        if (_logcatProcess is { HasExited: false })
        {
            ProcessRunner.TryKill(_logcatProcess);
            _logcatProcess = null;
            _logButton.Text = "Logcat 시작";
            SetStatus("Logcat 중지", true);
            return;
        }

        try
        {
            var serial = RequireSerial();
            int? pid = null;
            var pkg = _packageBox.Text.Trim();
            if (!string.IsNullOrWhiteSpace(pkg)) pid = await _android.GetPidAsync(serial, pkg);
            AppendLog(pid is null ? "[Logcat] 전체 로그 시작" : $"[Logcat] {pkg} PID {pid} 로그 시작");
            _logcatProcess = _android.StartLogcat(
                serial,
                pid,
                line => SafeUi(() => AppendLog(line)),
                line => SafeUi(() => AppendLog("[stderr] " + line)),
                _ => SafeUi(() => { _logButton.Text = "Logcat 시작"; }));
            _logButton.Text = "Logcat 중지";
            SetStatus("Logcat 실행 중", true);
        }
        catch (Exception ex) { ShowError("Logcat 시작 실패", ex); }
    }

    private async Task ClearDeviceLogcatAsync()
    {
        try
        {
            var serial = RequireSerial();
            var r = await _android.ClearLogcatAsync(serial);
            if (!r.Success) throw new InvalidOperationException(CombineResult(r));
            AppendLog("[Logcat] 기기 로그 버퍼 비움");
        }
        catch (Exception ex) { ShowError("Logcat 비우기 실패", ex); }
    }

    private void ChooseSdk(object? sender, EventArgs e)
    {
        using var dialog = new FolderBrowserDialog
        {
            Description = "Android SDK 폴더를 선택하세요 (platform-tools, emulator 폴더가 있는 위치)",
            UseDescriptionForTitle = true,
            SelectedPath = Directory.Exists(_sdkBox.Text) ? _sdkBox.Text : string.Empty
        };
        if (dialog.ShowDialog(this) == DialogResult.OK)
        {
            _sdkBox.Text = dialog.SelectedPath;
            _ = RefreshEnvironmentAsync();
        }
    }

    private void ChooseApk(object? sender, EventArgs e)
    {
        using var dialog = new OpenFileDialog { Filter = "Android APK|*.apk", Multiselect = false };
        if (File.Exists(_apkBox.Text)) dialog.InitialDirectory = Path.GetDirectoryName(_apkBox.Text);
        if (dialog.ShowDialog(this) == DialogResult.OK) SetApk(dialog.FileName);
    }

    private void OnDragEnter(object? sender, DragEventArgs e)
    {
        if (GetDroppedApk(e.Data) is not null) e.Effect = DragDropEffects.Copy;
    }

    private void OnDragDrop(object? sender, DragEventArgs e)
    {
        var apk = GetDroppedApk(e.Data);
        if (apk is not null) SetApk(apk);
    }

    private static string? GetDroppedApk(IDataObject? data)
    {
        if (data?.GetData(DataFormats.FileDrop) is not string[] files) return null;
        return files.FirstOrDefault(f => string.Equals(Path.GetExtension(f), ".apk", StringComparison.OrdinalIgnoreCase));
    }

    private void SetApk(string path)
    {
        _apkBox.Text = path;
        _packageBox.Clear();
        AppendLog("[APK] " + path);
        _ = DetectPackageAsync();
    }

    private void SaveConsole(object? sender, EventArgs e)
    {
        using var dialog = new SaveFileDialog { Filter = "Text file|*.txt", FileName = $"apk-test-log-{DateTime.Now:yyyyMMdd-HHmmss}.txt" };
        if (dialog.ShowDialog(this) != DialogResult.OK) return;
        File.WriteAllText(dialog.FileName, _console.Text);
        SetStatus("로그 저장 완료", true);
    }

    private string RequireApk()
    {
        var path = _apkBox.Text.Trim();
        if (!File.Exists(path) || !string.Equals(Path.GetExtension(path), ".apk", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("유효한 APK 파일을 선택하세요.");
        return path;
    }

    private string RequireSerial()
    {
        if (_deviceBox.SelectedItem is not AndroidDevice d)
            throw new InvalidOperationException("연결 기기를 선택하세요. 에뮬레이터가 없다면 먼저 AVD를 실행하세요.");
        if (!string.Equals(d.State, "device", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException($"기기 상태가 준비되지 않았습니다: {d.State}");
        return d.Serial;
    }

    private string RequirePackageId()
    {
        var pkg = _packageBox.Text.Trim();
        if (string.IsNullOrWhiteSpace(pkg)) throw new InvalidOperationException("Package ID가 비어 있습니다.");
        return pkg;
    }

    private void SelectDevice(string? serial)
    {
        if (_deviceBox.Items.Count == 0) return;
        var match = _deviceBox.Items.Cast<AndroidDevice>().FirstOrDefault(d => d.Serial == serial);
        _deviceBox.SelectedItem = match ?? _deviceBox.Items.Cast<AndroidDevice>().FirstOrDefault(d => d.State == "device") ?? _deviceBox.Items[0];
    }

    private static void SelectComboItem(ComboBox box, string? text)
    {
        if (box.Items.Count == 0) return;
        if (!string.IsNullOrWhiteSpace(text))
        {
            var match = box.Items.Cast<object>().FirstOrDefault(x => string.Equals(x.ToString(), text, StringComparison.Ordinal));
            if (match is not null) { box.SelectedItem = match; return; }
        }
        box.SelectedIndex = 0;
    }

    private void SetBusyStatus(string text) => SetStatus(text, null);

    private void SetStatus(string text, bool? ok)
    {
        _status.Text = text;
        _status.BackColor = ok switch
        {
            true => Color.FromArgb(230, 247, 238),
            false => Color.FromArgb(255, 240, 240),
            _ => Color.FromArgb(237, 242, 247)
        };
    }

    private void AppendResult(string name, ProcessResult r)
    {
        AppendLog($"[{name}] exit={r.ExitCode}");
        if (!string.IsNullOrWhiteSpace(r.StdOut)) AppendLog(r.StdOut);
        if (!string.IsNullOrWhiteSpace(r.StdErr)) AppendLog(r.StdErr);
    }

    private static string CombineResult(ProcessResult r)
        => string.Join(Environment.NewLine, new[] { r.StdOut, r.StdErr }.Where(x => !string.IsNullOrWhiteSpace(x)));

    private void AppendLog(string line)
    {
        if (_console.IsDisposed) return;
        _console.AppendText($"{DateTime.Now:HH:mm:ss} {line}{Environment.NewLine}");
        _console.SelectionStart = _console.TextLength;
        _console.ScrollToCaret();
    }

    private void SafeUi(Action action)
    {
        if (IsDisposed) return;
        try
        {
            if (InvokeRequired) BeginInvoke(action);
            else action();
        }
        catch { }
    }

    private void ShowError(string title, Exception ex)
    {
        AppendLog($"[{title}] {ex.Message}");
        SetStatus(title + ": " + ex.Message.Replace("\r", " ").Replace("\n", " "), false);
        MessageBox.Show(this, ex.Message, title, MessageBoxButtons.OK, MessageBoxIcon.Error);
    }
}
