# Discord Gallery Viewer

Discord의 화면공유를 **채팅/서버목록 없이 화면만 크게 보거나, 분할된 화면만 작은 항상 위 창으로 빼는 Windows 앱**입니다.

> Discord의 영상 스트림을 비공식 API로 가로채지 않습니다. 앱 안에서 `discord.com/app`을 열고 Discord가 이미 재생 중인 화면공유 영상 프레임만 사용합니다.

## 핵심 기능

- 채팅 표시 안 함
- 서버/채널 목록 표시 안 함
- Discord의 화면공유 타일만 사용
- `▦ 화면만 보기`: 공유화면 영역만 본체 전체창으로 표시
- `▣ PiP 분할`: **공유화면 영상만 별도 항상 위 창으로 분리**
- PiP에는 채팅/서버목록/채널목록/멤버목록 없음
- PiP 창 크기 자유 조절
- PiP 창 드래그 이동
- PiP 타일 클릭: 한 화면 확대 / 다시 클릭: 분할 복귀
- 본체를 최소화해도 캡처 루프가 멈추지 않도록 background throttling 비활성화
- 별도 송출 프로그램 불필요
- Discord 계정 로그인 상태 유지

## 사용법

1. `Discord Gallery Viewer` 실행
2. 첫 실행 때 Discord 로그인
3. 평소처럼 음성 채널에 들어가 다른 사람의 화면공유를 시청
4. 본체 전체를 화면공유 전용으로 보고 싶으면 `▦ 화면만 보기` 또는 `F10`
5. 작업 화면 위에 작은 분할 창만 띄우고 싶으면 `▣ PiP 분할` 또는 `F9`
6. PiP 타일 하나를 클릭하면 그 화면만 확대되고, 다시 클릭하면 원래 분할로 돌아옴
7. PiP 오른쪽 위에 마우스를 올리면 닫기 버튼이 나타남

## PiP 동작 방식

Electron은 Chromium의 Document Picture-in-Picture API를 그대로 사용할 수 있다고 가정하지 않습니다. 대신 Electron이 공식 지원하는 `BrowserWindow`를 **frameless + resizable + always-on-top**으로 만들고 그 창을 PiP로 사용합니다.

원본 Discord 통화 화면의 재생 중 `<video>` 요소를 찾은 뒤 각 영상 프레임을 작은 JPEG로 캡처하여 PiP 창으로 전달합니다. PiP 창은 그 이미지들만 1×1, 2×1, 2×2, 3×2, 3×3 형태로 자동 배치합니다.

화면공유로 판별 가능한 영상이 있으면 그것들을 우선 사용하고, Discord UI 변경 때문에 판별 정보가 부족한 경우에는 현재 통화 영역의 재생 중 영상들을 fallback으로 사용합니다.

## 성능 기준

현재 PiP 프레임 캡처는 약 6fps(`160ms`)이며 각 영상은 최대 약 `480×270`, JPEG 품질 `0.72`로 전송합니다. 실시간 게임 관전보다는 여러 작업 화면을 동시에 모니터링하는 용도에 맞춘 기본값입니다.

## 중요한 점

이 앱은 Discord의 공식 화면공유 API로 영상을 추출하는 방식이 아닙니다. Discord 웹 화면의 통화 영역과 현재 재생 중인 영상 요소를 탐지하는 방식이므로 Discord가 웹 UI 구조를 크게 바꾸면 선택자/탐지 로직 업데이트가 필요할 수 있습니다.

앱은 화면공유 영상의 암호화를 해제하거나 패킷을 가로채지 않습니다. Discord가 직접 재생하는 영상을 화면 캡처해 보여줍니다.

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

결과물은 `dist/Discord-Gallery-Viewer-*-Windows-x64.exe`에 생성됩니다.

## 자동 빌드

저장소의 GitHub Actions에서 **Build Discord Gallery Viewer** 워크플로를 실행하면 Windows portable EXE가 Artifact로 생성됩니다.

## 현재 범위

- Windows x64
- Electron 43.4.0 / Chromium 150 기반
- Discord 웹 클라이언트 기반
- Discord 자체 Grid/Gallery 레이아웃 활용
- Electron `BrowserWindow` 기반 커스텀 PiP
- 채팅 기능을 새로 구현하지 않음
- 별도 메시지/채팅 UI 없음

## 단축키

| 키 | 기능 |
|---|---|
| F9 | 분할 PiP 열기/닫기 |
| F10 | 화면만 보기 ON/OFF |
| Esc | 화면만 보기 종료 |
| F11 | 전체화면 ON/OFF |
