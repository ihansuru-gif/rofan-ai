# Discord Gallery Viewer

Discord의 화면공유를 **채팅/서버목록 없이 화면만 크게 분할해서 보는 Windows 앱**입니다.

> 현재 버전은 Discord의 영상 스트림을 비공식 API로 가로채지 않습니다. 앱 안에서 `discord.com/app`을 열고 Discord가 이미 렌더링한 통화/화면공유 영역만 전체 창으로 확대합니다.

## 목표

- 채팅 표시 안 함
- 서버/채널 목록 표시 안 함
- Discord의 화면공유 타일만 최대한 크게 표시
- Discord 자체 Grid/Gallery 레이아웃 사용
- F10 한 번으로 `일반 Discord 화면 ↔ 화면만 보기` 전환
- Esc로 화면만 보기 종료
- F11 전체화면
- 별도 송출 프로그램 불필요
- Discord 계정 로그인 상태 유지

## 사용법

1. `Discord Gallery Viewer` 실행
2. 첫 실행 때 Discord 로그인
3. 평소처럼 음성 채널에 들어가 다른 사람의 화면공유를 시청
4. 오른쪽 아래 `▦ 화면만 보기` 버튼 또는 `F10`
5. Discord의 공유화면 영역만 창 전체에 표시
6. `F10` 또는 `Esc`로 원래 Discord 화면으로 복귀

## 중요한 점

이 앱은 Discord의 공식 화면공유 API가 따로 있어서 영상을 추출하는 방식이 아닙니다. Discord 웹 화면의 통화 영역을 찾아 확대하는 방식입니다. 따라서 Discord가 웹 UI 구조를 크게 바꾸면 선택자/탐지 로직 업데이트가 필요할 수 있습니다.

앱은 화면공유 영상의 암호화를 해제하거나 패킷을 가로채지 않습니다. Discord가 직접 재생하는 영상을 그대로 보여줍니다.

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
- Discord 웹 클라이언트 기반
- Discord 자체 Grid/Gallery 레이아웃 활용
- 채팅 기능을 새로 구현하지 않음
- 별도 메시지/채팅 UI 없음

## 단축키

| 키 | 기능 |
|---|---|
| F10 | 화면만 보기 ON/OFF |
| Esc | 화면만 보기 종료 |
| F11 | 전체화면 ON/OFF |
