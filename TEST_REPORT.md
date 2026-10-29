# 검증 결과

검증일: 2026-10-30 KST. Node 24.19 / Chromium / Cloudflare workerd / 로컬 D1.

| 검사 | 결과 | 근거 |
|---|---|---|
| TypeScript | 통과 | npm run typecheck |
| ESLint | 통과 | npm run lint |
| Vitest + RTL | 22개 통과 | domain 12, UI 1, security 4, runtime 5 |
| 모바일 E2E | 2개 통과 | 390×844 Chromium, 실제 Worker API와 로컬 D1 |
| 프로덕션 PWA 오프라인 | 1개 통과 | 빌드 앱 셸, 오프라인 재열기, API 캐시 제외, 쓰기/AI 제한 |
| 프로덕션 빌드 | 통과 | Vite client 및 Worker 번들, 배포 실행 아님 |
| D1 migrations | 통과 | 0001 및 0002 로컬 적용, 재실행 가능 |
| 데스크톱 UI | 수동 캡처 확인 | 1440px 화면 레이아웃 확인 |

## 실행한 동작

- 일정 생성 → 제목 수정 → 완료 → 완료 취소 → 삭제 확인 후 삭제.
- 자연어 예제에서 복수 3항목, 소요시간 120분, 금요일 마감, 매일 루틴을 추출. 미리보기 이전에는 저장되지 않고 확인 후 3항목 저장.
- 날짜만 주어지면 scheduledDate로 보존하고 시작시간을 만들지 않음. 상대 날짜는 UTC 경계에서도 서울 기준. 모호한 날짜는 null 경고.
- 같은 AI draft를 두 번 반영해도 1회만 저장. 잘못된 Origin 변경은 403.
- 주간 반복 요일 판정 및 루틴별 날짜 완료 이력의 유일성.
- 규칙 기반 우선순위에서 기한 초과가 중요도보다 우선, 완료 항목 제외.
- Light / Dark / System 선택 및 DOM 테마 반영.
- 프로덕션 미인증 개인정보 API 401, 인증 비밀값 없을 때 로그인 503.
- **실제 workerd**에서 PBKDF2 비밀번호 검증, HttpOnly/Secure/SameSite 쿠키, 로그인된 API, 로그아웃, 시도 제한 429.
- 프로덕션에 AI_MODE=mock을 넣어도 Gemini 키가 없으면 Mock으로 우회하지 않음.
- **실제 workerd**에서 임시 키로 Web Push payload 암호화, aes128gcm 인코딩 및 VAPID authorization 생성. 외부 Push 서비스에는 보내지 않음.
- 스케줄러에 같은 오전 9시를 두 번 전달해 구독별 브리핑 로그가 한 번만 생김. VAPID 누락 실패 상태 기록. D1 UNIQUE 제약도 별도 확인.
- Manifest standalone / 아이콘 2개, 모바일 가로 넘침 없음.
- 프로덕션 앱 셸을 읽은 뒤 네트워크를 끊고 재로딩 가능. Cache Storage에 `/api` 응답이 없음을 검사.

## 미검증 / 제한

- 실제 Gemini 응답·현재 무료 등급 모델·Google 429 수신은 미검증. 오류 처리 분기와 개발 Mock 장애는 검증.
- 원격 Cloudflare D1, HTTPS 배포, 원격 Cron 실행, 실제 Push 서비스 수락 및 iPhone 수신은 미검증.
- CI 파일은 작성했지만 GitHub Actions 실행 결과는 이 보고서의 로컬 결과와 구별해야 함.
- Mock의 모든 한국어 표현을 이해하는 것은 보장하지 않음. 실제 AI 성능 검증이 아님.
- 시각적 캡처는 실기기의 Safe Area, VoiceOver 및 키보드 검증을 대신하지 않음.
- 초기 의존성 버전 불일치 및 구형 Push 인코딩을 수정한 뒤 최종 검사를 통과함.

보안 설정 및 알려진 제약은 SETUP.md, NEXT_STEPS.md, docs/DECISIONS.md 참고.
