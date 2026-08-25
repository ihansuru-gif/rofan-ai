using System.Diagnostics;

namespace ApkPcTester;

internal sealed class MainForm : Form
{
    private const string CustomProfileText = "사용자 지정";

    private readonly AndroidTools _android = new();
    private readonly AppSettings _settings = AppSettings.Load();
    private readonly CancellationTokenSource _lifetime = new();
    private Process? _logcatProcess;
    private Process? _emulatorProcess;
    private bool _frameBusy;
    private Point? _gestureStart;
    private DateTime _gestureStartedAt;

    private readonly TextBox _sdkBox = new() { Dock = DockStyle.Fill };
    private readonly TextBox _apkBox = new() { Dock = DockStyle.Fill, AllowDrop = true };
    private readonly TextBox _packageBox = new() { Dock = DockStyle.Fill };
    private readonly ComboBox _avdBox = new() { Dock = DockStyle.Fill, DropDownStyle = ComboBoxStyle.DropDownList };
    private readonly ComboBox _deviceBox = new() { Dock = DockStyle.Fill, DropDownStyle = ComboBoxStyle.DropDownList };
    private readonly ComboBox _profileBox = new() { Dock = DockStyle.Fill, DropDownStyle = ComboBoxStyle.DropDownList };
    private readonly NumericUpDown _widthBox = new() { Minimum = 320, Maximum = 10000, Increment = 10, Value = 1080, Width = 90 };
    private readonly NumericUpDown _heightBox = new() { Minimum = 480, Maximum = 12000, Increment = 10, Value = 2340, Width = 90 };
    private readonly NumericUpDown _dpiBox = new() { Minimum = 120, Maximum = 1000, Increment = 10, Value = 440, Width = 80 };
    private readonly CheckBox _autoLaunchCheck = new() { Text = "설치 후 자동 실행", AutoSize = true, Checked = true };
    private readonly CheckBox _replaceCheck = new() { Text = "기존 데이터 유지 재설치", AutoSize = true, Checked = true };
    private readonly Label _status = new() { Dock = DockStyle.Fill, AutoSize = false, TextAlign = ContentAlignment.MiddleLeft, Padding = new Padding(10, 0, 10, 0) };
    private readonly Label _profileInfo = new() { AutoSize = true, ForeColor = Color.DimGray };
    private readonly Label _previewInfo = new() { AutoSize = true, Text = "가상폰이 꺼져 있음", Padding = new Padding(4, 5, 8, 0) };
    private readonly TextBox _inputTextBox = new() { Width = 210 };
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
    private readonly PictureBox _previewBox = new()
    {
        Dock = DockStyle.Fill,
        BackColor = Color.Black,
        SizeMode = PictureBoxSizeMode.Zoom,
        TabStop = true,
        Cursor = Cursors.Hand
    };
    private readonly Panel _phoneFrame = new() { BackColor = Color.FromArgb(8, 8, 10), Padding = new Padding(10) };
    private readonly Panel _previewStage = new() { Dock = DockStyle.Fill, BackColor = Color.FromArgb(44, 46, 51) };
    private readonly Button _logButton = new() { Text = "Logcat 시작", AutoSize = true };
    private readonly System.Windows.Forms.Timer _deviceTimer = new() { Interval = 3500 };
    private readonly System.Windows.Forms.Timer _previewTimer = new() { Interval = 350 };

    public MainForm()
    {
        Text = "APK PC Tester · Virtual Phone";
        MinimumSize = new Size(1250, 760);
        Size = new Size(1500, 920);
        StartPosition = FormStartPosition.CenterScreen;
        AllowDrop = true;
        Font = new Font("Segoe UI", 9F);

        foreach (var profile in DeviceProfile.Presets) _profileBox.Items.Add(profile);
        _profileBox.Items.Add(CustomProfileText);

        _phoneFrame.Controls.Add(_previewBox);
        _previewStage.Controls.Add(_phoneFrame);

        BuildUi();
        WireEvents();
        RestoreSettings();
        FitPhoneFrame();
    }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        _deviceTimer.Stop();
        _previewTimer.Stop();
        _lifetime.Cancel();
        ProcessRunner.TryKill(_logcatProcess);
        ProcessRunner.TryKill(_emulatorProcess);
        var old = _previewBox.Image;
        _previewBox.Image = null;
        old?.Dispose();
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
            Padding = new Padding(10)
        };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 42));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        Controls.Add(root);

        _status.Text = "환경 확인 중...";
        _status.BackColor = Color.FromArgb(237, 242, 247);
        root.Controls.Add(_status, 0, 0);

        var top = new TableLayoutPanel { Dock = DockStyle.Top, AutoSize = true, ColumnCount = 4, Padding = new Padding(0, 8, 0, 8) };
        top.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 92));
        top.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        top.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        top.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        AddRow(top, 0, "Android SDK", _sdkBox,
            MakeButton("SDK 선택", ChooseSdk), MakeButton("환경 새로고침", async (_, _) => await RefreshEnvironmentAsync()));
        AddRow(top, 1, "APK", _apkBox,
            MakeButton("APK 선택", ChooseApk), MakeButton("패키지 감지", async (_, _) => await DetectPackageAsync()));
        AddRow(top, 2, "Package ID", _packageBox, null, null);
        root.Controls.Add(top, 0, 1);

        var main = new SplitContainer
        {
            Dock = DockStyle.Fill,
            Orientation = Orientation.Vertical,
            SplitterDistance = 390,
            Panel1MinSize = 360,
            Panel2MinSize = 650
        };
        root.Controls.Add(main, 0, 2);

        BuildControlPanel(main.Panel1);
        BuildPreviewPanel(main.Panel2);
    }

    private void BuildControlPanel(Control parent)
    {
        var scroll = new Panel { Dock = DockStyle.Fill, AutoScroll = true, Padding = new Padding(0, 0, 10, 0) };
        parent.Controls.Add(scroll);

        var stack = new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            Padding = new Padding(0)
        };
        scroll.Controls.Add(stack);

        var virtualPhone = MakeGroup("가상폰", 360, 320);
        stack.Controls.Add(virtualPhone);
        var phoneLayout = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 8, Padding = new Padding(10) };
        phoneLayout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 92));
        phoneLayout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        virtualPhone.Controls.Add(phoneLayout);

        phoneLayout.Controls.Add(MakeFieldLabel("Android 기반"), 0, 0);
        phoneLayout.Controls.Add(_avdBox, 1, 0);

        var avdButtons = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoSize = true };
        avdButtons.Controls.Add(MakeButton("가상폰 켜기", async (_, _) => await LaunchVirtualPhoneAsync()));
        avdButtons.Controls.Add(MakeButton("자동 생성", async (_, _) => await AutoCreateBaseAvdAsync()));
        avdButtons.Controls.Add(MakeButton("끄기", async (_, _) => await StopVirtualPhoneAsync()));
        phoneLayout.Controls.Add(avdButtons, 0, 1);
        phoneLayout.SetColumnSpan(avdButtons, 2);

        phoneLayout.Controls.Add(MakeFieldLabel("화면 폭"), 0, 2);
        phoneLayout.Controls.Add(_profileBox, 1, 2);

        var dimensions = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoSize = true };
        dimensions.Controls.Add(_widthBox);
        dimensions.Controls.Add(new Label { Text = "×", AutoSize = true, Padding = new Padding(0, 5, 0, 0) });
        dimensions.Controls.Add(_heightBox);
        dimensions.Controls.Add(new Label { Text = "px", AutoSize = true, Padding = new Padding(0, 5, 4, 0) });
        dimensions.Controls.Add(_dpiBox);
        dimensions.Controls.Add(new Label { Text = "dpi", AutoSize = true, Padding = new Padding(0, 5, 0, 0) });
        phoneLayout.Controls.Add(MakeFieldLabel("직접 설정"), 0, 3);
        phoneLayout.Controls.Add(dimensions, 1, 3);

        phoneLayout.Controls.Add(new Label { Text = "", AutoSize = true }, 0, 4);
        phoneLayout.Controls.Add(_profileInfo, 1, 4);

        var profileButtons = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoSize = true };
        profileButtons.Controls.Add(MakeButton("이 규격 적용", async (_, _) => await ApplyCurrentProfileAsync()));
        profileButtons.Controls.Add(MakeButton("원본 규격", async (_, _) => await ResetDisplayProfileAsync()));
        phoneLayout.Controls.Add(profileButtons, 0, 5);
        phoneLayout.SetColumnSpan(profileButtons, 2);

        var rotateButtons = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoSize = true };
        rotateButtons.Controls.Add(MakeButton("세로", async (_, _) => await SetOrientationAsync(false)));
        rotateButtons.Controls.Add(MakeButton("가로", async (_, _) => await SetOrientationAsync(true)));
        phoneLayout.Controls.Add(MakeFieldLabel("방향"), 0, 6);
        phoneLayout.Controls.Add(rotateButtons, 1, 6);

        phoneLayout.Controls.Add(MakeFieldLabel("현재 Android"), 0, 7);
        phoneLayout.Controls.Add(_deviceBox, 1, 7);

        var apkGroup = MakeGroup("APK 테스트", 360, 325);
        stack.Controls.Add(apkGroup);
        var actions = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            Padding = new Padding(10)
        };
        apkGroup.Controls.Add(actions);

        actions.Controls.Add(MakeBigButton("APK 설치 + 실행", async (_, _) => await InstallAndRunAsync(), emphasize: true));
        actions.Controls.Add(MakeBigButton("앱 실행", async (_, _) => await RunPackageActionAsync("앱 실행", _android.LaunchAppAsync)));
        actions.Controls.Add(MakeBigButton("앱 강제 종료", async (_, _) => await RunPackageActionAsync("앱 강제 종료", _android.ForceStopAsync)));
        actions.Controls.Add(MakeBigButton("앱 데이터 초기화", async (_, _) => await ConfirmAndRunPackageActionAsync(
            "앱 데이터 초기화", "앱의 저장 데이터가 모두 지워집니다. 계속할까요?", _android.ClearDataAsync)));
        actions.Controls.Add(MakeBigButton("앱 삭제", async (_, _) => await ConfirmAndRunPackageActionAsync(
            "앱 삭제", "가상폰에서 이 앱을 삭제합니다. 계속할까요?", _android.UninstallAsync)));
        actions.Controls.Add(MakeBigButton("현재 화면 PNG 저장", async (_, _) => await CaptureScreenshotAsync()));
        actions.Controls.Add(_autoLaunchCheck);
        actions.Controls.Add(_replaceCheck);

        var inputGroup = MakeGroup("가상폰 조작", 360, 150);
        stack.Controls.Add(inputGroup);
        var inputFlow = new FlowLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(10), AutoScroll = true };
        inputGroup.Controls.Add(inputFlow);
        inputFlow.Controls.Add(_inputTextBox);
        inputFlow.Controls.Add(MakeButton("텍스트 보내기", async (_, _) => await SendTextAsync()));
        inputFlow.SetFlowBreak(inputFlow.Controls[^1], true);
        inputFlow.Controls.Add(MakeButton("뒤로", async (_, _) => await SendKeyAsync(4)));
        inputFlow.Controls.Add(MakeButton("홈", async (_, _) => await SendKeyAsync(3)));
        inputFlow.Controls.Add(MakeButton("최근 앱", async (_, _) => await SendKeyAsync(187)));
        inputFlow.Controls.Add(MakeButton("Enter", async (_, _) => await SendKeyAsync(66)));
        inputFlow.Controls.Add(MakeButton("Backspace", async (_, _) => await SendKeyAsync(67)));
    }

    private void BuildPreviewPanel(Control parent)
    {
        var right = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 2, ColumnCount = 1 };
        right.RowStyles.Add(new RowStyle(SizeType.Percent, 72));
        right.RowStyles.Add(new RowStyle(SizeType.Percent, 28));
        parent.Controls.Add(right);

        var previewArea = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 2, ColumnCount = 1, Margin = new Padding(0) };
        previewArea.RowStyles.Add(new RowStyle(SizeType.Absolute, 38));
        previewArea.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        right.Controls.Add(previewArea, 0, 0);

        var toolbar = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.LeftToRight };
        toolbar.Controls.Add(_previewInfo);
        toolbar.Controls.Add(MakeButton("화면 새로고침", async (_, _) => await RefreshPreviewFrameAsync(force: true)));
        toolbar.Controls.Add(MakeButton("Android 목록 새로고침", async (_, _) => await RefreshDevicesAsync()));
        previewArea.Controls.Add(toolbar, 0, 0);
        previewArea.Controls.Add(_previewStage, 0, 1);

        var tabs = new TabControl { Dock = DockStyle.Fill };
        var logTab = new TabPage("로그");
        var helpTab = new TabPage("사용법");
        tabs.TabPages.Add(logTab);
        tabs.TabPages.Add(helpTab);
        right.Controls.Add(tabs, 0, 1);

        var logRoot = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 2, ColumnCount = 1 };
        logRoot.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        logRoot.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        logTab.Controls.Add(logRoot);

        var logToolbar = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoSize = true };
        _logButton.Click += async (_, _) => await ToggleLogcatAsync();
        logToolbar.Controls.Add(_logButton);
        logToolbar.Controls.Add(MakeButton("Logcat 비우기", async (_, _) => await ClearDeviceLogcatAsync()));
        logToolbar.Controls.Add(MakeButton("화면 지우기", (_, _) => _console.Clear()));
        logToolbar.Controls.Add(MakeButton("로그 저장", SaveConsole));
        logRoot.Controls.Add(logToolbar, 0, 0);
        logRoot.Controls.Add(_console, 0, 1);

        helpTab.Controls.Add(new Label
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(16),
            Text = "오른쪽 가상폰 화면은 실제 Android 화면입니다.\r\n\r\n" +
                   "• 클릭 = 화면 탭\r\n• 드래그 = 스와이프\r\n• APK를 프로그램 창에 끌어다 놓을 수 있음\r\n" +
                   "• 화면 규격은 실제 Android의 해상도와 density를 바꿈\r\n• 360dp / 393dp / 411dp처럼 폭을 바꿔 UI 잘림을 확인\r\n" +
                   "• 사용자 지정에서 픽셀 폭·높이·DPI를 직접 입력 가능\r\n\r\n" +
                   "Android 운영체제 이미지는 Android SDK의 System Image를 사용합니다.",
            AutoSize = false
        });
    }

    private void WireEvents()
    {
        Shown += async (_, _) =>
        {
            await RefreshEnvironmentAsync();
            _deviceTimer.Start();
            _previewTimer.Start();
        };

        _deviceTimer.Tick += async (_, _) => await RefreshDevicesAsync(silent: true);
        _previewTimer.Tick += async (_, _) => await RefreshPreviewFrameAsync();
        _previewStage.Resize += (_, _) => FitPhoneFrame();

        DragEnter += OnDragEnter;
        DragDrop += OnDragDrop;
        _apkBox.DragEnter += OnDragEnter;
        _apkBox.DragDrop += OnDragDrop;

        _apkBox.TextChanged += (_, _) => { _settings.LastApkPath = _apkBox.Text.Trim(); SaveSettings(); };
        _packageBox.TextChanged += (_, _) => { _settings.LastPackageId = _packageBox.Text.Trim(); SaveSettings(); };
        _avdBox.SelectedIndexChanged += (_, _) =>
        {
            if (_avdBox.SelectedItem is string avd) _settings.LastAvd = avd;
            SaveSettings();
        };
        _deviceBox.SelectedIndexChanged += (_, _) =>
        {
            if (_deviceBox.SelectedItem is AndroidDevice d) _settings.LastSerial = d.Serial;
            UpdatePreviewInfo();
            SaveSettings();
        };
        _profileBox.SelectedIndexChanged += (_, _) => OnProfileSelected();
        _widthBox.ValueChanged += (_, _) => OnCustomDimensionChanged();
        _heightBox.ValueChanged += (_, _) => OnCustomDimensionChanged();
        _dpiBox.ValueChanged += (_, _) => OnCustomDimensionChanged();
        _autoLaunchCheck.CheckedChanged += (_, _) => SaveSettings();
        _replaceCheck.CheckedChanged += (_, _) => SaveSettings();

        _previewBox.MouseDown += (_, e) =>
        {
            if (e.Button != MouseButtons.Left) return;
            _gestureStart = e.Location;
            _gestureStartedAt = DateTime.UtcNow;
            _previewBox.Focus();
        };
        _previewBox.MouseUp += async (_, e) => await FinishGestureAsync(e.Location);
        _previewBox.KeyDown += async (_, e) => await PreviewKeyDownAsync(e);
        _previewBox.KeyPress += async (_, e) => await PreviewKeyPressAsync(e);
        _inputTextBox.KeyDown += async (_, e) =>
        {
            if (e.KeyCode != Keys.Enter) return;
            e.SuppressKeyPress = true;
            await SendTextAsync();
        };
    }

    private static GroupBox MakeGroup(string title, int width, int height)
        => new() { Text = title, Width = width, Height = height, Margin = new Padding(0, 0, 0, 10) };

    private static Label MakeFieldLabel(string text)
        => new() { Text = text, Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft, AutoSize = false };

    private static Button MakeButton(string text, EventHandler handler)
    {
        var b = new Button { Text = text, AutoSize = true, Margin = new Padding(4, 2, 0, 2) };
        b.Click += handler;
        return b;
    }

    private static Button MakeBigButton(string text, EventHandler handler, bool emphasize = false)
    {
        var b = new Button
        {
            Text = text,
            Width = 330,
            Height = emphasize ? 48 : 38,
            Margin = new Padding(0, 0, 0, 6),
            TextAlign = ContentAlignment.MiddleLeft,
            Padding = new Padding(12, 0, 0, 0),
            Font = emphasize ? new Font("Segoe UI", 9F, FontStyle.Bold) : new Font("Segoe UI", 9F)
        };
        b.Click += handler;
        return b;
    }

    private static void AddRow(TableLayoutPanel table, int row, string label, Control editor, Control? button1, Control? button2)
    {
        while (table.RowCount <= row) table.RowCount++;
        table.RowStyles.Add(new RowStyle(SizeType.Absolute, 34));
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
        _widthBox.Value = Math.Clamp(_settings.CustomWidthPx, (int)_widthBox.Minimum, (int)_widthBox.Maximum);
        _heightBox.Value = Math.Clamp(_settings.CustomHeightPx, (int)_heightBox.Minimum, (int)_heightBox.Maximum);
        _dpiBox.Value = Math.Clamp(_settings.CustomDensityDpi, (int)_dpiBox.Minimum, (int)_dpiBox.Maximum);

        var match = _profileBox.Items.Cast<object>()
            .OfType<DeviceProfile>()
            .FirstOrDefault(x => string.Equals(x.Name, _settings.LastProfileName, StringComparison.Ordinal));
        _profileBox.SelectedItem = match ?? _profileBox.Items.Cast<object>().First();
        OnProfileSelected();
    }

    private void SaveSettings()
    {
        _settings.SdkRoot = string.IsNullOrWhiteSpace(_sdkBox.Text) ? null : _sdkBox.Text.Trim();
        _settings.LastApkPath = string.IsNullOrWhiteSpace(_apkBox.Text) ? null : _apkBox.Text.Trim();
        _settings.LastPackageId = string.IsNullOrWhiteSpace(_packageBox.Text) ? null : _packageBox.Text.Trim();
        _settings.AutoLaunchAfterInstall = _autoLaunchCheck.Checked;
        _settings.KeepDataOnInstall = _replaceCheck.Checked;
        _settings.LastProfileName = _profileBox.SelectedItem is DeviceProfile p ? p.Name : CustomProfileText;
        _settings.CustomWidthPx = (int)_widthBox.Value;
        _settings.CustomHeightPx = (int)_heightBox.Value;
        _settings.CustomDensityDpi = (int)_dpiBox.Value;
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
            {
                var imageCount = _android.GetInstalledSystemImagePackages().Count;
                SetStatus($"준비됨 · AVD {_avdBox.Items.Count}개 · Android System Image {imageCount}개", true);
            }
            else if (_android.HasAdb)
                SetStatus("adb는 찾았지만 Android Emulator가 없습니다. SDK Tools에서 Android Emulator를 설치하세요.", false);
            else
                SetStatus("Android SDK/adb를 찾지 못했습니다. SDK 폴더를 지정하세요.", false);
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
            if (!silent) AppendLog($"[Android] {devices.Count}개 감지");
            UpdatePreviewInfo();
        }
        catch (Exception ex)
        {
            if (!silent) AppendLog("[Android 새로고침 오류] " + ex.Message);
        }
    }

    private async Task AutoCreateBaseAvdAsync()
    {
        try
        {
            SetBusyStatus("테스트용 Android 기반 자동 생성 중...");
            var r = await _android.CreateBaseAvdAsync();
            AppendResult("AVD 생성", r);
            if (!r.Success) throw new InvalidOperationException(CombineResult(r));
            await RefreshEnvironmentAsync();
            SelectComboItem(_avdBox, "APK_PC_Tester_Base");
            SetStatus("테스트용 Android 기반 생성 완료", true);
        }
        catch (Exception ex) { ShowError("가상폰 기반 생성 실패", ex); }
    }

    private async Task LaunchVirtualPhoneAsync(bool coldBoot = false)
    {
        try
        {
            if (!_android.HasEmulator) throw new InvalidOperationException("Android Emulator가 설치되어 있지 않습니다.");

            if (_deviceBox.SelectedItem is AndroidDevice already &&
                already.Serial.StartsWith("emulator-", StringComparison.OrdinalIgnoreCase) &&
                string.Equals(already.State, "device", StringComparison.OrdinalIgnoreCase))
            {
                await ApplyCurrentProfileAsync();
                SetStatus("이미 실행 중인 가상폰에 현재 규격을 적용했습니다.", true);
                return;
            }

            if (_avdBox.SelectedItem is not string avd)
            {
                AppendLog("[가상폰] AVD가 없어 자동 생성을 시도합니다.");
                var created = await _android.CreateBaseAvdAsync();
                AppendResult("AVD 생성", created);
                if (!created.Success) throw new InvalidOperationException(CombineResult(created));
                await RefreshEnvironmentAsync();
                SelectComboItem(_avdBox, "APK_PC_Tester_Base");
                avd = _avdBox.SelectedItem as string ?? throw new InvalidOperationException("생성된 AVD를 찾지 못했습니다.");
            }

            var before = (await _android.GetDevicesAsync())
                .Where(d => d.Serial.StartsWith("emulator-", StringComparison.OrdinalIgnoreCase))
                .Select(d => d.Serial)
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

            _emulatorProcess = _android.StartEmulator(avd, coldBoot, headless: true);
            AppendLog($"[가상폰] {avd} 백그라운드 실행");
            SetBusyStatus("가상폰 Android 부팅 중...");

            AndroidDevice? emulator = null;
            for (var i = 0; i < 100; i++)
            {
                await Task.Delay(1200, _lifetime.Token);
                var devices = await _android.GetDevicesAsync();
                emulator = devices.FirstOrDefault(d =>
                    d.Serial.StartsWith("emulator-", StringComparison.OrdinalIgnoreCase) && !before.Contains(d.Serial));
                if (emulator is not null) break;
                if (before.Count == 0)
                    emulator = devices.FirstOrDefault(d => d.Serial.StartsWith("emulator-", StringComparison.OrdinalIgnoreCase));
                if (emulator is not null) break;
            }

            if (emulator is null) throw new TimeoutException("가상폰 adb 연결을 확인하지 못했습니다.");

            await _android.WaitForBootAsync(emulator.Serial, new Progress<string>(SetBusyStatus), _lifetime.Token);
            await RefreshDevicesAsync(silent: true);
            SelectDevice(emulator.Serial);
            await ApplyCurrentProfileAsync();
            await SetOrientationAsync(_settings.Landscape);
            await RefreshPreviewFrameAsync(force: true);
            SetStatus("가상폰 준비 완료 · APK를 설치해서 바로 테스트할 수 있습니다.", true);
        }
        catch (OperationCanceledException) { }
        catch (Exception ex) { ShowError("가상폰 실행 실패", ex); }
    }

    private async Task StopVirtualPhoneAsync()
    {
        try
        {
            var serial = RequireSerial();
            if (!serial.StartsWith("emulator-", StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("선택된 항목은 가상폰이 아닙니다.");
            SetBusyStatus("가상폰 종료 중...");
            var r = await _android.StopEmulatorAsync(serial);
            AppendResult("가상폰 종료", r);
            ProcessRunner.TryKill(_emulatorProcess);
            _emulatorProcess = null;
            ClearPreview();
            await Task.Delay(500);
            await RefreshDevicesAsync(silent: true);
            SetStatus("가상폰 종료", true);
        }
        catch (Exception ex) { ShowError("가상폰 종료 실패", ex); }
    }

    private DeviceProfile GetCurrentProfile()
    {
        var name = _profileBox.SelectedItem is DeviceProfile p ? p.Name : "사용자 지정";
        return new DeviceProfile(name, (int)_widthBox.Value, (int)_heightBox.Value, (int)_dpiBox.Value, "");
    }

    private async Task ApplyCurrentProfileAsync()
    {
        try
        {
            var serial = RequireSerial();
            var profile = GetCurrentProfile();
            SetBusyStatus($"{profile.WidthPx}×{profile.HeightPx} / {profile.DensityDpi}dpi 적용 중...");
            var r = await _android.ApplyDisplayProfileAsync(serial, profile);
            AppendResult("화면 규격", r);
            if (!r.Success) throw new InvalidOperationException(CombineResult(r));
            SaveSettings();
            FitPhoneFrame();
            UpdatePreviewInfo();
            await Task.Delay(350);
            await RefreshPreviewFrameAsync(force: true);
            SetStatus($"화면 규격 적용 완료 · 약 {profile.WidthDp}dp 폭", true);
        }
        catch (Exception ex) { ShowError("화면 규격 적용 실패", ex); }
    }

    private async Task ResetDisplayProfileAsync()
    {
        try
        {
            var serial = RequireSerial();
            SetBusyStatus("Android 원본 화면 규격 복원 중...");
            var r = await _android.ResetDisplayProfileAsync(serial);
            AppendResult("화면 규격 원본", r);
            if (!r.Success) throw new InvalidOperationException(CombineResult(r));
            await Task.Delay(350);
            await RefreshPreviewFrameAsync(force: true);
            SetStatus("Android 기반의 원본 화면 규격으로 복원했습니다.", true);
        }
        catch (Exception ex) { ShowError("화면 규격 복원 실패", ex); }
    }

    private async Task SetOrientationAsync(bool landscape)
    {
        try
        {
            var serial = RequireSerial();
            var r = await _android.SetOrientationAsync(serial, landscape);
            AppendResult(landscape ? "가로 화면" : "세로 화면", r);
            if (!r.Success) throw new InvalidOperationException(CombineResult(r));
            _settings.Landscape = landscape;
            SaveSettings();
            FitPhoneFrame();
            await Task.Delay(450);
            await RefreshPreviewFrameAsync(force: true);
            UpdatePreviewInfo();
        }
        catch (Exception ex) { ShowError("화면 방향 변경 실패", ex); }
    }

    private async Task RefreshPreviewFrameAsync(bool force = false)
    {
        if (_frameBusy) return;
        if (!force && !Visible) return;
        if (_deviceBox.SelectedItem is not AndroidDevice d || !string.Equals(d.State, "device", StringComparison.OrdinalIgnoreCase)) return;

        _frameBusy = true;
        try
        {
            var bytes = await _android.CaptureFrameAsync(d.Serial, _lifetime.Token);
            using var stream = new MemoryStream(bytes);
            using var source = Image.FromStream(stream);
            var bitmap = new Bitmap(source);
            var old = _previewBox.Image;
            _previewBox.Image = bitmap;
            old?.Dispose();
            FitPhoneFrame(bitmap.Width, bitmap.Height);
            UpdatePreviewInfo(bitmap.Width, bitmap.Height);
        }
        catch (OperationCanceledException) { }
        catch (Exception ex)
        {
            if (force) AppendLog("[화면 미러링] " + ex.Message);
        }
        finally { _frameBusy = false; }
    }

    private async Task FinishGestureAsync(Point end)
    {
        var start = _gestureStart;
        _gestureStart = null;
        if (start is null) return;

        try
        {
            var serial = RequireSerial();
            var mappedStart = MapPreviewPoint(start.Value);
            var mappedEnd = MapPreviewPoint(end);
            if (mappedStart is null || mappedEnd is null) return;

            var dx = end.X - start.Value.X;
            var dy = end.Y - start.Value.Y;
            var distance = Math.Sqrt(dx * dx + dy * dy);
            if (distance < 10)
            {
                await _android.TapAsync(serial, mappedEnd.Value.X, mappedEnd.Value.Y);
            }
            else
            {
                var duration = (int)Math.Clamp((DateTime.UtcNow - _gestureStartedAt).TotalMilliseconds, 100, 1200);
                await _android.SwipeAsync(serial,
                    mappedStart.Value.X, mappedStart.Value.Y,
                    mappedEnd.Value.X, mappedEnd.Value.Y,
                    duration);
            }
            await Task.Delay(80);
            await RefreshPreviewFrameAsync(force: true);
        }
        catch (Exception ex) { AppendLog("[터치 입력] " + ex.Message); }
    }

    private Point? MapPreviewPoint(Point point)
    {
        if (_previewBox.Image is null) return null;
        var rect = GetZoomedImageRectangle(_previewBox, _previewBox.Image.Size);
        if (!rect.Contains(point)) return null;
        var x = (int)Math.Round((point.X - rect.X) * (_previewBox.Image.Width / (double)rect.Width));
        var y = (int)Math.Round((point.Y - rect.Y) * (_previewBox.Image.Height / (double)rect.Height));
        return new Point(
            Math.Clamp(x, 0, _previewBox.Image.Width - 1),
            Math.Clamp(y, 0, _previewBox.Image.Height - 1));
    }

    private static Rectangle GetZoomedImageRectangle(PictureBox box, Size image)
    {
        if (image.Width <= 0 || image.Height <= 0 || box.ClientSize.Width <= 0 || box.ClientSize.Height <= 0)
            return Rectangle.Empty;
        var scale = Math.Min(box.ClientSize.Width / (double)image.Width, box.ClientSize.Height / (double)image.Height);
        var width = Math.Max(1, (int)Math.Round(image.Width * scale));
        var height = Math.Max(1, (int)Math.Round(image.Height * scale));
        return new Rectangle((box.ClientSize.Width - width) / 2, (box.ClientSize.Height - height) / 2, width, height);
    }

    private async Task PreviewKeyDownAsync(KeyEventArgs e)
    {
        int? keyCode = e.KeyCode switch
        {
            Keys.Enter => 66,
            Keys.Back => 67,
            Keys.Escape => 4,
            Keys.Home => 3,
            Keys.Tab => 61,
            Keys.Left => 21,
            Keys.Right => 22,
            Keys.Up => 19,
            Keys.Down => 20,
            _ => null
        };
        if (keyCode is null) return;
        e.SuppressKeyPress = true;
        await SendKeyAsync(keyCode.Value);
    }

    private async Task PreviewKeyPressAsync(KeyPressEventArgs e)
    {
        if (char.IsControl(e.KeyChar)) return;
        try
        {
            var serial = RequireSerial();
            await _android.InputTextAsync(serial, e.KeyChar.ToString());
            e.Handled = true;
        }
        catch { }
    }

    private async Task SendTextAsync()
    {
        try
        {
            var serial = RequireSerial();
            if (string.IsNullOrEmpty(_inputTextBox.Text)) return;
            var r = await _android.InputTextAsync(serial, _inputTextBox.Text);
            if (!r.Success) throw new InvalidOperationException(CombineResult(r));
            await RefreshPreviewFrameAsync(force: true);
        }
        catch (Exception ex) { ShowError("텍스트 입력 실패", ex); }
    }

    private async Task SendKeyAsync(int keyCode)
    {
        try
        {
            var serial = RequireSerial();
            var r = await _android.KeyEventAsync(serial, keyCode);
            if (!r.Success) throw new InvalidOperationException(CombineResult(r));
            await Task.Delay(80);
            await RefreshPreviewFrameAsync(force: true);
        }
        catch (Exception ex) { AppendLog("[키 입력] " + ex.Message); }
    }

    private void OnProfileSelected()
    {
        if (_profileBox.SelectedItem is DeviceProfile p)
        {
            SetNumeric(_widthBox, p.WidthPx);
            SetNumeric(_heightBox, p.HeightPx);
            SetNumeric(_dpiBox, p.DensityDpi);
            _profileInfo.Text = $"약 {p.WidthDp}×{p.HeightDp}dp · {p.Note}";
        }
        else
        {
            var custom = GetCurrentProfile();
            _profileInfo.Text = $"약 {custom.WidthDp}×{custom.HeightDp}dp · 직접 입력";
        }
        FitPhoneFrame();
        SaveSettings();
    }

    private void OnCustomDimensionChanged()
    {
        if (_profileBox.SelectedItem is DeviceProfile p &&
            p.WidthPx == (int)_widthBox.Value && p.HeightPx == (int)_heightBox.Value && p.DensityDpi == (int)_dpiBox.Value)
            return;

        if (_profileBox.Items.Count > 0 && _profileBox.SelectedItem is not null && _profileBox.SelectedItem is not string)
            _profileBox.SelectedItem = CustomProfileText;

        var custom = GetCurrentProfile();
        _profileInfo.Text = $"약 {custom.WidthDp}×{custom.HeightDp}dp · 직접 입력";
        FitPhoneFrame();
        SaveSettings();
    }

    private static void SetNumeric(NumericUpDown box, int value)
        => box.Value = Math.Clamp(value, (int)box.Minimum, (int)box.Maximum);

    private void FitPhoneFrame(int? imageWidth = null, int? imageHeight = null)
    {
        if (_previewStage.ClientSize.Width <= 0 || _previewStage.ClientSize.Height <= 0) return;

        var width = imageWidth ?? GetCurrentProfile().WidthPx;
        var height = imageHeight ?? GetCurrentProfile().HeightPx;
        if (_settings.Landscape && imageWidth is null) (width, height) = (height, width);
        if (width <= 0 || height <= 0) return;

        var maxWidth = Math.Max(100, _previewStage.ClientSize.Width - 70);
        var maxHeight = Math.Max(100, _previewStage.ClientSize.Height - 40);
        var ratio = width / (double)height;
        var targetWidth = maxWidth;
        var targetHeight = (int)Math.Round(targetWidth / ratio);
        if (targetHeight > maxHeight)
        {
            targetHeight = maxHeight;
            targetWidth = (int)Math.Round(targetHeight * ratio);
        }

        _phoneFrame.Bounds = new Rectangle(
            (_previewStage.ClientSize.Width - targetWidth) / 2,
            (_previewStage.ClientSize.Height - targetHeight) / 2,
            Math.Max(80, targetWidth),
            Math.Max(80, targetHeight));
    }

    private void UpdatePreviewInfo(int? actualWidth = null, int? actualHeight = null)
    {
        if (_deviceBox.SelectedItem is not AndroidDevice d || !string.Equals(d.State, "device", StringComparison.OrdinalIgnoreCase))
        {
            _previewInfo.Text = "가상폰이 꺼져 있음";
            return;
        }
        var p = GetCurrentProfile();
        var size = actualWidth is not null && actualHeight is not null ? $"실제 화면 {actualWidth}×{actualHeight}" : $"설정 {p.WidthPx}×{p.HeightPx}";
        _previewInfo.Text = $"{d.Serial} · {size} · {p.DensityDpi}dpi · 약 {p.WidthDp}dp 폭 · {(_settings.Landscape ? "가로" : "세로")}";
    }

    private void ClearPreview()
    {
        var old = _previewBox.Image;
        _previewBox.Image = null;
        old?.Dispose();
        _previewInfo.Text = "가상폰이 꺼져 있음";
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
            if (!install.Success) throw new InvalidOperationException("APK 설치 실패\r\n" + CombineResult(install));

            if (_autoLaunchCheck.Checked)
            {
                if (string.IsNullOrWhiteSpace(packageId))
                {
                    SetStatus("설치는 완료됐지만 Package ID를 감지하지 못해 자동 실행은 건너뛰었습니다.", false);
                    return;
                }
                SetBusyStatus("앱 실행 중...");
                var run = await _android.LaunchAppAsync(serial, packageId);
                AppendResult("launch", run);
                if (!run.Success) throw new InvalidOperationException("앱 실행 실패\r\n" + CombineResult(run));
            }

            await Task.Delay(300);
            await RefreshPreviewFrameAsync(force: true);
            SetStatus("설치/실행 완료 · 오른쪽 가상폰에서 직접 조작하세요.", true);
        }
        catch (Exception ex) { ShowError("APK 설치/실행 실패", ex); }
    }

    private async Task DetectPackageAsync()
    {
        try
        {
            var apk = RequireApk();
            var id = await _android.DetectPackageIdAsync(apk);
            if (string.IsNullOrWhiteSpace(id))
                throw new InvalidOperationException("Package ID를 읽지 못했습니다. Android SDK Build-Tools(aapt)를 확인하세요.");
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
            await Task.Delay(150);
            await RefreshPreviewFrameAsync(force: true);
            SetStatus(name + " 완료", true);
        }
        catch (Exception ex) { ShowError(name + " 실패", ex); }
    }

    private async Task ConfirmAndRunPackageActionAsync(string name, string message, Func<string, string, Task<ProcessResult>> action)
    {
        if (MessageBox.Show(this, message, name, MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;
        await RunPackageActionAsync(name, action);
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
                _ => SafeUi(() => _logButton.Text = "Logcat 시작"));
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
            throw new InvalidOperationException("가상폰을 먼저 켜 주세요.");
        if (!string.Equals(d.State, "device", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException($"Android 상태가 준비되지 않았습니다: {d.State}");
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
        if (_deviceBox.Items.Count == 0)
        {
            ClearPreview();
            return;
        }
        var match = _deviceBox.Items.Cast<AndroidDevice>().FirstOrDefault(d => d.Serial == serial);
        _deviceBox.SelectedItem = match
            ?? _deviceBox.Items.Cast<AndroidDevice>().FirstOrDefault(d => d.Serial.StartsWith("emulator-", StringComparison.OrdinalIgnoreCase) && d.State == "device")
            ?? _deviceBox.Items.Cast<AndroidDevice>().FirstOrDefault(d => d.State == "device")
            ?? _deviceBox.Items[0];
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
