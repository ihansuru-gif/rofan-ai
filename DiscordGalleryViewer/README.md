# Screen Share Gallery 1.0.0

Discord와 Jitsi에서 **공유화면만** 분할해서 보고, 작은 항상 위 PiP 창으로 빼는 Windows 앱입니다.

## 1.0.0 기능

- Discord / Jitsi 선택 실행
- Discord 기존 로그인 세션 유지
- Jitsi `meet.jit.si` 방 이름 입장 + 자체 Jitsi 서버 지원
- 카메라 영상은 PiP에서 제외하고 **화면공유로 판별된 영상만 표시**
- Jitsi는 `videoType: desktop` 트랙을 우선 판별
- Discord는 DOM/트랙 메타데이터의 screen/stream/share 표시를 사용해 판별
- PiP 자동 배치: 1×1 / 2×1 / 2×2 / 3×2 / 3×3
- PiP 항상 위, 자유 이동/크기 조절
- 타일 클릭: 한 화면 확대 / 다시 클릭: 분할 복귀
- F9: PiP 열기/닫기
- F10: 화면만 보기
- Esc: 화면만 보기 종료
- F11: 전체화면
- 화면공유 시작 시 모니터/창 선택창 제공
- 서비스 전환 시 남은 화면공유 요청과 PiP 정리

## 자동 품질 게이트

GitHub Actions는 EXE를 만들기 전에 다음을 모두 통과해야 합니다.

1. `package-lock.json` 생성/고정
2. `npm ci` exact install
3. 전체 JavaScript 문법 검사
4. 정적 불변조건 검사
   - display-capture 권한
   - IPC 발신 페이지 검증
   - Discord 웹캠 fallback 금지
   - Jitsi desktop track 판별
   - PiP IPC 용량 제한
5. production `main.js`를 실제 Electron으로 실행해 홈 화면과 preload 권한 분리 확인
6. PiP 전체 경로 Electron 스모크 테스트
   - synthetic 화면공유 4개 생성
   - 2×2 PiP 타일 4개 수신
   - PiP always-on-top 확인
   - PiP 크기 변경 확인
   - 타일 확대/분할 복귀 확인
   - 1.3초 동안 최소 4개 이상 프레임 배치 수신 확인
   - 화면만 보기 ON/OFF 확인
7. Windows portable EXE 빌드
8. EXE 존재/최소 크기 검사
9. SHA256 생성
10. 검증된 EXE + `SHA256SUMS.txt` Artifact 업로드

## 개발 검증

```bash
npm ci
npm test
npm run smoke:home
npm run smoke:ci
npm run dist
```

## 결과물

```text
Screen-Share-Gallery-1.0.0-Windows-x64.exe
SHA256SUMS.txt
```

## 사용자 PC에서 마지막으로 확인할 항목

자동 검수 이후 남는 것은 실제 계정/실제 통화 환경 검수뿐입니다.

- Discord 실제 로그인 및 음성채널
- Discord 실제 화면공유 1/2/4명
- Jitsi 실제 방 1/2/4명 화면공유
- 사용 중인 모니터 구성에서 화면/창 선택
- 실제 작업 프로그램 위에서 PiP 위치/크기/체감 프레임

이 항목들은 실제 계정과 통화 상대가 필요한 최종 실사용 확인입니다.
