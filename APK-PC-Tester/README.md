# APK PC Tester · Virtual Phone

Windows에서 APK를 **프로그램 안의 가상 핸드폰 화면으로 직접 조작하면서** 테스트하는 도구입니다.

Android Emulator는 백그라운드(headless)에서 실제 Android를 실행하고, APK PC Tester가 ADB로 화면을 받아 오른쪽 폰 프레임 안에 표시합니다. 따라서 단순 이미지 미리보기가 아니라 실제 Android에 APK가 설치되어 실행됩니다.

## 핵심 기능

- 프로그램 안에 실제 Android 화면 미러링
- 가상폰 화면 클릭 → Android 탭
- 가상폰 화면 드래그 → Android 스와이프
- 뒤로 / 홈 / 최근 앱 / Enter / Backspace 전달
- 텍스트 입력 전달
- 세로 / 가로 전환
- APK 선택 + Windows 드래그앤드롭
- APK 설치 / 재설치 / 실행 / 강제 종료 / 데이터 초기화 / 삭제
- Package ID 자동 감지 (`aapt`)
- 실시간 Logcat 보기 / 지우기 / 저장
- 현재 Android 화면 PNG 저장
- 마지막 SDK / APK / AVD / Package ID / 화면 규격 기억

## 화면 폭 테스트

가상폰이 실행 중일 때 아래 프리셋 또는 사용자 지정 값을 실제 Android에 적용합니다.

- 좁은 폰 약 360dp
- 일반 폰 약 393dp
- 넓은 폰 약 411dp
- QHD 폰 약 411dp
- 저해상도 폰 약 360dp
- 태블릿 약 800dp
- 사용자 지정: `가로 px × 세로 px + DPI`

내부적으로 Android의 display size / density override를 사용하기 때문에 앱이 실제로 해당 논리 폭을 인식합니다. UI 잘림, 버튼 겹침, 반응형 레이아웃, 이미지 스케일 등을 확인하는 용도입니다.

> 프리셋은 **화면 크기·밀도 테스트 프로필**입니다. 특정 삼성/구글 기종의 노치, 제조사 One UI, 센서, 카메라 하드웨어까지 그대로 복제하는 기종 시뮬레이터는 아닙니다.

## 가상폰 만드는 방식

Android 운영체제 자체는 Google Android Emulator / Android SDK System Image를 사용합니다.

`가상폰 켜기`를 누르면 선택한 AVD가 창 없이 백그라운드에서 실행되고, 화면은 APK PC Tester 안에 나타납니다.

AVD가 없을 때 `자동 생성`을 누르면 설치되어 있는 Android System Image 중 하나를 이용해 `APK_PC_Tester_Base` AVD 생성을 시도합니다.

자동 생성을 위해서는 다음이 설치되어 있어야 합니다.

- Android SDK Platform-Tools (`adb.exe`)
- Android Emulator (`emulator.exe`)
- Android SDK Build-Tools (`aapt.exe`, Package ID 감지용)
- Android SDK Command-line Tools (`avdmanager`)
- Android System Image 1개 이상

System Image 자체가 하나도 없는 경우에는 Android Studio SDK Manager에서 한 번 설치해야 합니다. 수백 MB~수 GB의 Android 운영체제 이미지를 프로그램에 중복 포함하지 않기 위해 SDK의 이미지를 그대로 사용합니다.

## 가장 쉬운 사용 순서

1. `APK-PC-Tester.exe` 실행
2. Android SDK 자동 인식 확인
3. AVD가 없다면 `자동 생성`
4. `가상폰 켜기`
5. 원하는 화면 폭 프리셋 선택 → `이 규격 적용`
6. APK를 창에 끌어 놓기
7. `APK 설치 + 실행`
8. 오른쪽 가상폰을 마우스로 직접 조작
9. 다른 폭을 골라 다시 적용하면서 UI 확인

ADB에 연결된 실제 USB Android 폰이 있으면 그 화면도 같은 미러링/조작 구조로 사용할 수 있습니다.

## 빌드

```powershell
dotnet build .\src\ApkPcTester\ApkPcTester.csproj -c Release
```

단일 EXE 게시:

```powershell
dotnet publish .\src\ApkPcTester\ApkPcTester.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:DebugType=None -p:DebugSymbols=false
```

GitHub Actions가 Windows x64 단일 EXE를 만들고 artifact로 업로드합니다.

## 설정 저장

설정은 `%APPDATA%\\APK-PC-Tester\\settings.json`에 저장됩니다. APK, 화면, 로그를 외부 서버로 전송하는 기능은 없습니다.
