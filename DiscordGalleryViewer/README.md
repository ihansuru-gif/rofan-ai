# Screen Share Gallery

Discord와 Jitsi의 화면공유를 **채팅/서버목록 없이 화면만 분할해서 보거나, 작은 항상 위 PiP 창으로 빼서 보는 Windows 앱**입니다.

기존 `Discord Gallery Viewer`를 확장한 통합판이며 GitHub 폴더명은 호환성을 위해 `DiscordGalleryViewer/`를 유지합니다.

## 지원 서비스

### Discord
- 기존 Discord 웹 로그인 상태 유지
- 평소처럼 음성채널에 입장해 화면공유 시청
- Discord 통화 영역에서 공유화면을 찾아 분할 PiP로 전송
- Discord DOM에서 화면공유 메타데이터를 찾지 못하면 현재 통화 영상으로 fallback

### Jitsi
- 기본 서버: `https://meet.jit.si`
- 시작 화면에서 방 이름 입력 후 바로 입장
- 자체 Jitsi 서버 주소도 입력 가능
- Jitsi 내부 Redux track state의 `videoType: desktop`을 우선 확인해 **화면공유 트랙만** 식별
- 내부 상태를 읽지 못하는 버전에서는 DOM의 desktop/screenshare/presentation 메타데이터로 보조 판별
- 화면공유를 확인하지 못하면 카메라를 임의로 PiP에 섞지 않음

## 공통 기능

- 채팅을 PiP에 표시하지 않음
- 서버/채널/멤버 목록을 PiP에 표시하지 않음
- `▦ 화면만 보기`: 회의/통화 영상 영역만 본체 전체창으로 확대
- `▣ PiP 분할`: 공유화면만 별도 always-on-top 창으로 분리
- PiP 크기 조절/이동
- PiP 타일 클릭: 한 화면 확대 / 다시 클릭: 분할 복귀
- 1×1, 2×1, 2×2, 3×2, 3×3 자동 배치
- 본체 최소화 중에도 PiP 캡처 루프 유지
- 서비스 선택 화면으로 언제든 복귀 가능
- Discord와 Jitsi가 화면공유를 요청할 때 자체 화면/창 선택기를 제공

## 사용법

1. `Screen Share Gallery` 실행
2. 시작 화면에서 **Discord** 또는 **Jitsi** 선택
3. Discord는 평소처럼 채널에 입장하고, Jitsi는 방 이름을 입력해 입장
4. 다른 사람이 화면공유를 시작하면 `▣ PiP 분할` 또는 `F9`
5. 작업 프로그램 위에 공유화면 분할창만 계속 띄워서 사용
6. PiP 타일 클릭 시 해당 화면만 확대, 다시 클릭 시 원래 분할
7. 왼쪽 위 `⌂ 서비스 선택`으로 Discord/Jitsi 선택 화면 복귀

## 단축키

| 키 | 기능 |
|---|---|
| F9 | 분할 PiP 열기/닫기 |
| F10 | 화면만 보기 ON/OFF |
| Esc | 화면만 보기 종료 |
| F11 | 전체화면 ON/OFF |

## PiP 동작 방식

Electron의 frameless `BrowserWindow`를 always-on-top으로 만들어 PiP 창으로 사용합니다.

원본 회의 페이지의 화면공유 `<video>` 프레임을 작은 JPEG 이미지로 캡처해 PiP 창으로 전달합니다. PiP 창 자체에는 Discord/Jitsi 웹 UI를 복제하지 않기 때문에 채팅이나 채널 목록이 따라오지 않습니다.

현재 기본값:
- 캡처 간격: 약 160ms (약 6fps)
- 타일당 최대 캡처 크기: 약 480×270
- JPEG 품질: 0.72
- 최대 12개 영상

실시간 게임 관전보다 **여러 작업 화면을 동시에 모니터링하는 용도**에 맞춘 값입니다.

## 화면공유 선택

Electron에서는 Windows용 네이티브 시스템 화면 선택기가 자동 제공되지 않는 경우가 있어 앱 자체 선택창을 제공합니다.

Jitsi/Discord에서 화면공유 버튼을 누르면 현재 모니터와 창 목록을 가져와 썸네일로 보여주고, 사용자가 명시적으로 선택한 화면/창만 공유합니다. 임의로 첫 번째 모니터를 자동 공유하지 않습니다.

## 보안/구조

- 영상 암호화를 해제하거나 네트워크 패킷을 가로채지 않음
- 각 서비스가 브라우저에서 이미 재생한 영상만 캡처
- `contextIsolation: true`
- `nodeIntegration: false`
- 원격 페이지에서 임의 Node.js 접근 불가
- 미디어 권한은 현재 선택된 Discord/Jitsi origin에만 허용

## 개발 실행

```bash
npm install
npm start
```

## Windows EXE 빌드

```bash
npm install
npm run dist
```

결과물:

```text
DiscordGalleryViewer/dist/Screen-Share-Gallery-0.3.0-Windows-x64.exe
```

## 자동 빌드

저장소의 GitHub Actions에서 **Build Screen Share Gallery** 워크플로가 `DiscordGalleryViewer/**` 변경 시 Windows portable EXE를 빌드합니다.

## 현재 범위

- Windows x64
- Electron 43.4.0 / Chromium 150 기반
- Discord 웹 클라이언트
- Jitsi Meet 웹 클라이언트 및 자체 Jitsi origin
- 커스텀 always-on-top PiP

Discord/Jitsi가 웹 UI 구조나 내부 상태 구조를 크게 바꾸면 영상 탐지 선택자를 업데이트해야 할 수 있습니다.
