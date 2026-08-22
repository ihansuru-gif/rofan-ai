# Screen Share Gallery

Discord와 Jitsi의 **공유화면만** 분할해서 보거나, 작은 항상 위 PiP 창으로 빼서 보는 Windows 앱입니다.

기존 `Discord Gallery Viewer`를 확장한 통합판이며 GitHub 폴더명은 호환성을 위해 `DiscordGalleryViewer/`를 유지합니다.

## 0.3.1 검수 수정

4회 검수에서 아래 항목을 수정했습니다.

- Electron 화면공유 권한에 `display-capture` 추가
- 불필요한 웹 알림 권한 제거
- 홈 화면 전용 IPC와 원격 Discord/Jitsi용 IPC를 분리하고 Main Process에서도 발신 페이지 검증
- Discord에서 화면공유 판별 실패 시 웹캠까지 PiP에 섞던 fallback 제거
- Jitsi/Discord Grid/Tile 버튼은 상태가 명확히 OFF일 때만 자동 클릭
- MutationObserver가 같은 안내문을 반복 재작성하며 루프를 만들 수 있던 문제 수정
- 화면공유 선택 요청이 연속 발생할 때 오래된 callback이 살아남지 않도록 경쟁 상태 방지
- PiP 프레임 IPC 크기 제한과 전송 속도 제한 추가
- 서비스 전환/홈 복귀 시 미완료 화면공유 선택 요청 취소
- Electron 43.4.1로 패치 업데이트

## 지원 서비스

### Discord

- 기존 Discord 웹 로그인 상태 유지
- 평소처럼 음성채널에 입장해 화면공유 시청
- 화면공유로 판별된 영상만 PiP에 표시
- **화면공유로 확실히 판별되지 않은 카메라 영상은 PiP에 넣지 않음**

### Jitsi

- 기본 서버: `https://meet.jit.si`
- 시작 화면에서 방 이름 입력 후 입장
- 자체 Jitsi 서버 주소 입력 가능
- Jitsi 내부 track state의 `videoType: desktop`을 우선 사용해 화면공유 식별
- 내부 상태를 읽지 못하면 DOM의 desktop/screenshare/presentation 메타데이터로 보조 판별
- 화면공유를 확인하지 못하면 카메라를 PiP에 섞지 않음

## 공통 기능

- 채팅/서버/채널/멤버 목록을 PiP에 표시하지 않음
- `▦ 화면만 보기`: 통화/회의 영상 영역만 본체 전체창으로 확대
- `▣ PiP 분할`: 공유화면만 별도 always-on-top 창으로 분리
- PiP 크기 조절/이동
- PiP 타일 클릭: 한 화면 확대 / 다시 클릭: 분할 복귀
- 1×1, 2×1, 2×2, 3×2, 3×3 자동 배치
- 본체 최소화 중에도 PiP 캡처 루프 유지
- Discord/Jitsi 선택 화면으로 복귀 가능
- 화면공유 시작 시 앱 자체 화면/창 선택기 사용

## 사용법

1. `Screen Share Gallery` 실행
2. 시작 화면에서 **Discord** 또는 **Jitsi** 선택
3. Discord는 평소처럼 채널에 입장하고, Jitsi는 방 이름을 입력해 입장
4. 다른 사람이 화면공유를 시작하면 `▣ PiP 분할` 또는 `F9`
5. 작업 프로그램 위에 공유화면 분할창만 띄워 사용
6. PiP 타일 클릭 시 해당 화면만 확대, 다시 클릭 시 원래 분할
7. `⌂ 서비스 선택`으로 서비스 선택 화면 복귀

## 단축키

| 키 | 기능 |
|---|---|
| F9 | 분할 PiP 열기/닫기 |
| F10 | 화면만 보기 ON/OFF |
| Esc | 화면만 보기 종료 |
| F11 | 전체화면 ON/OFF |

## PiP 동작 방식

Electron의 frameless `BrowserWindow`를 always-on-top으로 만들어 PiP 창으로 사용합니다.

원본 회의 페이지에서 **화면공유로 판별된 `<video>`만** 작은 JPEG 프레임으로 캡처해 PiP 창으로 전달합니다. PiP 창 자체에는 Discord/Jitsi 웹 UI를 복제하지 않습니다.

기본값:

- 캡처 간격: 약 160ms (약 6fps)
- 타일당 최대 캡처 크기: 약 480×270
- JPEG 품질: 0.72
- 최대 12개 화면
- 프레임 배치 IPC 최대 약 4MB

## 화면공유 선택

Discord/Jitsi에서 화면공유 버튼을 누르면 현재 모니터와 창 목록을 앱 선택창으로 보여줍니다. 사용자가 명시적으로 고른 화면/창만 공유하며 임의로 첫 번째 모니터를 자동 공유하지 않습니다.

## 보안

- 영상 암호화를 해제하거나 네트워크 패킷을 가로채지 않음
- 각 서비스가 브라우저에서 이미 재생한 영상만 캡처
- `contextIsolation: true`
- `nodeIntegration: false`
- 원격 페이지의 IPC 요청은 현재 서비스 origin과 메인 창 발신 여부를 재검증
- 홈 화면에서만 Discord/Jitsi 서비스 변경 가능
- 미디어/화면공유 권한은 현재 선택된 서비스 origin에만 허용
- 불필요한 알림 권한은 허용하지 않음

## 개발 실행

```bash
npm install
npm run check
npm start
```

## Windows EXE 빌드

```bash
npm install
npm run check
npm run dist
```

결과물:

```text
DiscordGalleryViewer/dist/Screen-Share-Gallery-0.3.1-Windows-x64.exe
```

## 자동 빌드

GitHub Actions의 **Build Screen Share Gallery** 워크플로가 `DiscordGalleryViewer/**` 변경 시 JavaScript 문법 검사를 거친 뒤 Windows portable EXE를 빌드합니다.

## 현재 범위

- Windows x64
- Electron 43.4.1
- Discord 웹 클라이언트
- Jitsi Meet 웹 클라이언트 및 자체 Jitsi origin
- 커스텀 always-on-top PiP

Discord/Jitsi가 웹 UI 구조나 내부 track state 구조를 크게 바꾸면 영상 탐지 선택자를 업데이트해야 할 수 있습니다.
