# APK PC Tester

Windows에서 APK를 실제 Android Emulator/ADB에 설치해 빠르게 시험하기 위한 데스크톱 도구입니다.

## 들어있는 기능

- APK 파일 선택 + Windows 드래그앤드롭
- Android SDK 자동 탐지 (`ANDROID_SDK_ROOT`, `ANDROID_HOME`, `%LOCALAPPDATA%\\Android\\Sdk`)
- Android Virtual Device(AVD) 목록 표시
- 에뮬레이터 일반 실행 / 콜드부팅
- adb에 연결된 에뮬레이터와 실제 USB Android 기기 선택
- APK 설치 / 기존 앱 위 재설치
- `aapt` 기반 Package ID 자동 감지
- 설치 후 앱 자동 실행
- 앱 실행 / 강제 종료 / 데이터 초기화 / 삭제
- 기기 재부팅
- 실시간 Logcat 보기, 지우기, 파일 저장
- 스크린샷 PNG 저장
- 마지막 SDK/APK/AVD/기기/Package ID 기억
- 관리자 권한 불필요

## 필요한 것

이 프로그램 자체는 Android를 에뮬레이션하지 않습니다. Google Android Emulator와 adb를 안전하게 제어하는 프론트엔드입니다.

PC에 **Android Studio의 Android SDK**가 준비되어 있어야 합니다.

Android Studio > SDK Manager > SDK Tools에서 최소한 아래 항목이 필요합니다.

- Android SDK Platform-Tools (`adb.exe`)
- Android Emulator (`emulator.exe`)
- Android SDK Build-Tools (`aapt.exe`, Package ID 자동 감지용)

그리고 Android Studio Device Manager에서 테스트할 가상 기기(AVD)를 1개 이상 만들어 두면 됩니다.

## 가장 쉬운 사용 순서

1. `APK-PC-Tester.exe` 실행
2. Android SDK가 자동 인식되는지 상단 상태 확인
3. `가상 기기(AVD)`에서 원하는 기기 선택
4. `에뮬레이터 실행`
5. APK 파일을 창에 끌어 놓기
6. `APK 설치 + 실행`
7. 오른쪽에서 Logcat 확인

실제 Android 폰도 USB 디버깅 상태로 adb에 연결되어 있으면 `연결 기기` 목록에서 선택해 같은 방식으로 테스트할 수 있습니다.

## 빌드

```powershell
dotnet build .\src\ApkPcTester\ApkPcTester.csproj -c Release
```

단일 EXE 게시:

```powershell
dotnet publish .\src\ApkPcTester\ApkPcTester.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:DebugType=None -p:DebugSymbols=false
```

GitHub Actions도 같은 방식으로 Windows x64 단일 EXE를 만들고 artifact로 올립니다.

## 저장 위치

설정은 `%APPDATA%\\APK-PC-Tester\\settings.json`에 저장됩니다. APK나 앱 데이터 자체를 외부 서버로 전송하지 않습니다.
