# 구조

```text
src/                 React 네 화면, API 어댑터, 반응형 테마
shared/domain.ts     Zod 모델, 서울 날짜, 반복 발생, 결정적 Top 3
worker/index.ts      동일 오리진 API 라우팅, Origin 검사, CRUD, AI draft 반영
worker/auth.ts       PBKDF2 검증, 세션 해시, 보안 쿠키
worker/ai.ts         Gemini REST Structured Output / 개발 Mock
worker/store.ts      D1 항목 조회 및 설정
worker/push.ts       Web Crypto Push, Cron, 구독별 발송 claim
migrations/          SQLite 제약/인덱스 및 AI 사용량 제한
public/             Manifest, 아이콘, Service Worker
scripts/keys.mjs     인증 해시/세션 비밀값/VAPID 로컬 생성
```

브라우저 → 같은 오리진 `/api` → Worker → 바인딩된 D1. 브라우저에서 D1이나 Gemini에 직접 접속하지 않습니다. Worker는 Gemini 연결이 있을 때 입력과 관련된 일부 항목만 전송합니다.

AI 분석 결과는 30분 draft와 DB 버전 snapshot으로 저장합니다. 사용자가 제목/날짜/대상을 검토하고 확인한 후 서버에서 다시 Zod 검증합니다. D1 batch의 UNIQUE claim과 버전 guard가 중복·경합 시 전체 반영을 롤백합니다. 변경·삭제·완료는 기존 ID를 선택해야 하고, 임의 생성 ID에 적용되지 않습니다.

루틴 설정은 ScheduleItems, 날짜별 완료는 RoutineCompletions에 분리합니다. 일반 완료와 수정은 version으로 충돌을 확인합니다. UI는 완료를 먼저 반영하되 실패 시 복구하고 새 상태를 조회합니다.

Cron은 서울 시간으로 알림 후보를 만들고 각 구독별 NotificationLogs 키를 먼저 삽입합니다. aes128gcm 암호화 및 VAPID 서명은 workerd의 Web Crypto로 수행합니다. 반복 발송은 피하지만 전송 실패 자동 재시도나 정확히 한 번 전달은 보장하지 않습니다.

로그인 API를 제외한 모든 개인정보 API는 인증을 적용합니다. 모든 변경은 동일 Origin 헤더를 요구하고 쿠키는 HttpOnly/Secure/SameSite=Strict입니다. APP_ENV=development는 로컬 전용 인증 생략이므로 원격에 사용하면 안 됩니다.
