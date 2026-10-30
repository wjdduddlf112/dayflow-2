# 개발 및 운영 설정

## 로컬 / Codex Cloud

Node.js 22.12 이상 권장(이 환경은 24). 기존 `/workspace/dayflow-2` 체크아웃을 사용합니다. 별도 worktree가 필요하지 않습니다.

1. `npm ci`
2. `.dev.vars`가 없다면 `cp .env.example .dev.vars`. 예제는 APP_ENV=development, AI_MODE=mock이며 키가 필요 없습니다.
3. `npm run db:migrate` (로컬 D1만, 재실행 가능)
4. `npm run dev`
5. `npm run typecheck && npm run lint && npm test && npm run build`
6. `npm run test:e2e` — Chromium 사용. 기본 `/usr/bin/chromium`, 다른 경로는 CHROMIUM_PATH 지정. 다른 환경에서는 `npx playwright install chromium` 후 설치 위치를 지정합니다.

원격 API 접속이 필요하면 환경 설정에서 ai.google.dev(공식 문서), generativelanguage.googleapis.com(Gemini REST)을 허용합니다. 이 작업에서는 위 도메인과 api.github.com(PR API), developers.cloudflare.com(공식 한도 문서)을 환경 초안에 저장했습니다. 현재 실행 환경에는 아직 적용되지 않아 PR API와 공식 가격/제한 페이지 접근이 차단됩니다. 저장만으로 현재 실행 환경의 정책이 적용되지는 않습니다. 로컬 Wrangler의 Request.cf 조회가 실패해도 로컬 D1과 Worker는 정상 동작합니다.

## Gemini (실제 연결 전 필수 확인)

1. Google AI Studio에서 **무료 등급** 사용 가능한 프로젝트/모델을 확인하고 API 키를 발급합니다. 결제나 유료 플랜을 자동 활성화하지 않습니다.
2. 공식 [가격](https://ai.google.dev/gemini-api/docs/pricing), [Structured Output](https://ai.google.dev/gemini-api/docs/structured-output), [약관](https://ai.google.dev/gemini-api/terms)을 확인합니다.
3. `GEMINI_MODEL`의 잠정 기본값은 `gemini-3.5-flash-lite`입니다. 공식 Cookbook의 현재 모델/JSON 선택 목록에서 이 ID를 확인했습니다. `GEMINI_API_STYLE=interactions`는 공식 예제 및 SDK 형식에 맞춘 서버 REST 어댑터입니다. 무료 제공 확인은 완료되지 않았으므로 무료 프로젝트/모델 확인 후 키를 등록하세요. 기존 계약이 필요한 모델은 GEMINI_API_STYLE=generate-content로 선택할 수 있습니다. [자료 근거](docs/GEMINI_EVIDENCE.md)를 참고하세요.
4. 서버 비밀값으로 `GEMINI_API_KEY`를 설정합니다. 로컬에서 실제 호출을 시험하려면 .dev.vars에 키를 넣고 AI_MODE=gemini로 바꿉니다. VITE_ 접두사를 사용하지 않습니다.
5. 개인정보를 제외한 테스트 문장으로 여러 항목, 마감일, 상대 날짜, 오류/429를 확인합니다. 기본 앱 일일 안전 한도는 서울 날짜당 30회이고 실패 요청도 포함합니다. 이는 공급자 무료 보장이나 청구 차단 수단이 아닙니다. 무료 한도 내 운영을 직접 관리해야 합니다.

Google 무료 API 정책에 따라 전송 내용이 활용될 수 있습니다. 앱의 AI 설정을 끄면 전송하지 않습니다. 전체 DB를 보내지 않고 입력과 제목이 관련된 최대 40개 항목의 ID·제목·시간만 보냅니다.

## Cloudflare D1 및 배포 준비 (사용자 승인 후에만)

이 작업은 Cloudflare 계정/DB/배포를 생성하지 않았습니다. 다음은 사용자가 실행할 절차입니다.

1. 무료 Workers 계정으로 인증합니다. 유료 플랜은 선택하지 않습니다.
2. `npx wrangler d1 create dayflow` 후 반환된 database_id를 wrangler.jsonc에 설정합니다. 현재 UUID는 로컬 개발용 자리표시자입니다.
3. `npx wrangler d1 migrations apply dayflow --remote` (새 Dayflow 2 DB에만 적용).
4. 아래 인증/Push 비밀값을 `npx wrangler secret put NAME`으로 각각 등록합니다. 키를 저장소나 대화에 붙여넣지 않습니다.
5. wrangler.jsonc는 APP_ENV=production, AI_MODE=gemini를 기본으로 유지합니다. .dev.vars의 개발 모드를 원격 환경변수에 복사하지 않습니다.
6. `npm run build` 후 명시적 배포 승인 하에 `npx wrangler deploy`를 실행합니다. Cloudflare Vite Plugin이 생성한 `.wrangler/deploy/config.json`을 통해 dist Worker와 Static Assets를 동일 오리진에 배포합니다.
7. HTTPS에서 비로그인 API 401 → 로그인 → CRUD → 로그아웃을 확인합니다. 배포 전 실제 값으로 생성되는 dist도 업로드/커밋하지 않습니다.

## 인증 및 VAPID 생성

키는 `npm run keys -- /보안/외부경로/dayflow-secrets.txt`로 생성합니다. DAYFLOW_PASSWORD를 환경변수로 공급하며 비밀번호는 12자 이상입니다. 예: 로컬 터미널에서 `read -rs DAYFLOW_PASSWORD; export DAYFLOW_PASSWORD` 후 실행하고 `unset DAYFLOW_PASSWORD`로 지웁니다. 명령 이력에 실제 비밀번호를 쓰지 마세요.

생성 파일은 저장소 밖에 권한 0600 및 배타적 생성으로 저장됩니다. 기존 파일을 덮어쓰지 않습니다. 구성:

- AUTH_PASSWORD_HASH: PBKDF2 iterations:saltBase64:hashBase64
- SESSION_SECRET: 랜덤 세션 토큰 해시용 비밀값
- VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY: P-256 공개키/개인 스칼라 base64url
- VAPID_SUBJECT: 별도로 설정할 운영자 mailto: 주소

필요한 서버 비밀값을 등록한 후 임시 키 파일을 안전하게 보관하거나 삭제합니다. 실제 비밀값은 `.env.example`에 기록하지 않습니다. 서버 인증 비밀값이 없으면 프로덕션 개인정보 API는 열리지 않습니다.

## 알림 / Cron / iPhone

- Cron `* * * * *`는 UTC 매분 실행하며 함수 내 Asia/Seoul로 환산합니다. 09:00 KST = 00:00 UTC.
- 일일 브리핑은 오전 9시, 일정은 30분 전, 루틴은 설정 시간에 발송합니다. 앱을 열어 둘 필요는 없으며 원격 Cron과 Push 설정이 필요합니다.
- NotificationLogs는 구독+항목/발생시각별 중복을 막습니다. 404/410 구독은 제거합니다. 실패/중단은 자동 재발송하지 않으므로 운영자는 로그를 확인해야 합니다.
- Safari에서 배포 HTTPS 열기 → 공유 → 홈 화면에 추가 → 추가된 아이콘에서 실행.
- iOS 16.4 이상 홈 화면 웹앱의 설정에서 ‘이 기기 알림 허용’을 탭합니다. 사용자 조작 이전에는 권한 요청을 하지 않습니다.
- ‘테스트 알림 보내기’ 후 잠금 화면에서 수신 확인, 다음날 09:00 브리핑, 30분 전 일정, 선택한 루틴 시간, 중복 방지 및 구독 해제를 실제 기기에서 검사합니다.
- 서버의 발송 수락은 실제 기기 전달 보장이 아닙니다. 인증 세션 만료와 무관하게 구독 알림은 활성화 상태에서 계속 전송됩니다. 공용 기기에서 구독하지 마세요.
- 서비스 워커는 공개 앱 셸만 저장합니다. API 개인정보는 sessionStorage에서 현재 세션에 읽은 것만 오프라인 표시하며 쓰기는 금지합니다. 로그아웃 시 지웁니다.

## 무료 운영

코드나 CI에 자동 배포/결제/플랜 변경은 없습니다. 무료 Workers/D1/Cron/Gemini 각 한도는 시점·지역·계정별로 확인하세요. 매분 Cron은 하루 1,440회 실행됩니다. 30일 이후 발송 로그를 정리하지만 장기 항목 보관 및 페이지네이션은 후속 개선 대상입니다. 모든 제한 초과는 무료 한도를 늘리는 대신 오류로 처리해야 합니다.

## 프로덕션 구성 체크표

| 이름 | 종류 | 준비 방법 |
|---|---|---|
| DB / database_id | Cloudflare D1 바인딩 | 별도 새 Dayflow 2 DB 생성 후 실제 UUID 입력 |
| APP_ENV | 비밀 아님 | production 유지 |
| AI_MODE | 비밀 아님 | gemini 유지; 원격에서 mock 사용 금지 |
| GEMINI_MODEL | 비밀 아님 | 후보 gemini-3.5-flash-lite; 현재 무료 제공 확인 후 결정 |
| GEMINI_API_STYLE | 비밀 아님 | interactions 기본, 필요한 경우 generate-content |
| GEMINI_API_KEY | 서버 비밀값 | 무료 프로젝트 확인 후 wrangler secret put |
| AUTH_PASSWORD_HASH | 서버 비밀값 | 키 생성 스크립트의 PBKDF2 해시 |
| SESSION_SECRET | 서버 비밀값 | 키 생성 스크립트의 랜덤 값 |
| VAPID_PUBLIC_KEY | 서버 설정, 공개 가능 | P-256 공개키, Worker가 인증된 앱에 제공 |
| VAPID_PRIVATE_KEY | 서버 비밀값 | P-256 개인키 |
| VAPID_SUBJECT | 서버 설정 | 운영자의 mailto: 주소 |

`npx wrangler deploy --dry-run --outdir /tmp/dayflow-worker-dry-run`으로 업로드 없이 번들/바인딩을 확인했습니다. 출력에서 APP_ENV=production과 동일 오리진 자산/D1 바인딩을 확인했습니다. 실제 배포는 실행하지 않았습니다.

Cron의 매분 조회는 항목 수에 비례합니다. 예를 들어 2,000항목을 매분 읽으면 항목 행만 대략 하루 288만 번 읽습니다(다른 설정/구독/완료 조회 제외). 개인의 일반적 데이터 규모를 전제로 하며, 이 수치를 현재 무료 할당량으로 보증하지 않습니다. 무료 한도에 근접하면 예약 후보만 조회하는 SQL과 Cron 주기 조정을 먼저 적용해야 합니다. 일별 일괄조회 규모가 커지면 요청/CPU/D1 한도를 실측하세요.
