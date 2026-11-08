# D1 연결 설정 검증 (2026-11-09 KST)

기존 feat/dayflow-mvp의 원격 최신 커밋 2ed1677을 가져와 작업했다. 애플리케이션 재구현이나 마이그레이션 SQL 변경 없이 wrangler.jsonc의 임시 database_id를 a0433029-2987-4bb1-ae73-eb6303ec1e02로 교체했다. DB / dayflow / migrations / Worker dayflow-2 설정은 유지했다.

| 이번 실행한 검사 | 결과 |
|---|---|
| npm ci | 기존 lockfile로 설치 통과; lockfile 변경 없음 |
| TypeScript / ESLint | 각각 통과 |
| npm test | 5개 파일, 53개 테스트 통과 |
| npm run build | Worker + React 프로덕션 빌드 통과 |
| wrangler deploy --dry-run | 통과; 원격 배포/DB 쓰기 없음 |
| 생성된 배포 설정 검사 | 실제 UUID / DB 바인딩 / dayflow DB 이름 일치 |
| 격리된 빈 로컬 D1 | 0001~0004 최초 적용 성공 |
| 마이그레이션 재실행 | No migrations to apply; 기존 합성 fixture 1건 보존 |
| 스키마/이력 조회 | 앱 테이블 11개, 명시적 인덱스 6개, 마이그레이션 이력 4개 확인 |
| 로컬 SQLite 읽기 전용 검사 | foreign_key_check 위반 없음, integrity_check=ok |

호환성: @cloudflare/vite-plugin 1.66.0 / Wrangler 4.155.0 / Vite 7.3.7 / Node 24.19.0. 빌드가 생성한 dist/dayflow_2/wrangler.json에도 실제 UUID가 포함되며 Dry Run은 그 설정으로 DB와 Static Assets, production 변수를 인식했다.

마이그레이션은 기존 SQL 그대로 검토했다. ScheduleItems의 JSON 유효성, RoutineCompletions의 FK/cascade와 날짜별 복합 PK, 세션 만료/발송/요청/draft/일정 정렬 인덱스, 설정 단일행·MutationGuards CHECK 제약을 유지했다. SQL의 CREATE 문 자체는 재실행용이 아니며 Wrangler의 d1_migrations 이력이 중복 적용을 막는다. 기존 Sites DB나 URL에 대한 명령/접근은 수행하지 않았다.

추가 검사에서 D1 SQL API에 한꺼번에 보낸 PRAGMA 검사가 SQLITE_AUTH로 거절됐다. 지원되는 SELECT로 스키마/이력/보존을 다시 검증하고, Miniflare 내부 metadata DB를 제외한 합성 로컬 DB 파일에 읽기 전용 SQLite 무결성 검사를 수행해 통과했다. 이는 원격 D1 무결성 검증 결과가 아니다. 기존 Zod/Rollup annotation 경고는 빌드 실패를 일으키지 않았다.

Cloudflare 인증 변수/로컬 인증 설정이 없고 wrangler whoami도 미인증을 반환했다. 원격 D1 확인·원격 마이그레이션·Secret 등록·실제 배포는 실행하지 않았다. UUID 설정만으로 원격 접근/스키마 반영이 검증된 것은 아니다.

GitHub 기존 PR 조회는 api.github.com/graphql 정책 403으로 실패했다. 기존 PR 유무를 확인할 수 없어 중복 생성 요청은 보내지 않았다. 실제 Gemini/Push/iPhone 검증과 브라우저 테스트는 이번 D1 설정 변경 범위에서 재실행하지 않았으며, 아래 브라우저 결과는 명시된 이전 날짜의 기록이다.

---

# 이전 전체 검증 결과 (2026-10-30)

2026-10-30 KST · Node 24.19 · Vitest 5.0.5 · Chromium · workerd / 로컬 D1.

| 검사 | 결과 | 실행/범위 |
|---|---|---|
| TypeScript | 통과 | npm run typecheck |
| ESLint | 통과 | npm run lint |
| 단위·RTL·통합 | **53개 통과** | domain 16 / Gemini HTTP·Mock 20 / UI 4 / security 4 / workerd·D1 9 |
| 모바일 브라우저 | **5개 통과** | npm run test:e2e; 실제 로컬 Worker/D1 흐름 및 별도 UI 응답 fixture |
| 프로덕션 PWA | **2개 통과** | npm run test:offline; 오프라인 재실행, 개인정보 캐시 제외, 정적 자산 CSP |
| 프로덕션 빌드 | 통과 | React 자산과 Worker, 배포 실행 아님 |
| 배포 없는 검사 | 통과 | wrangler deploy --dry-run, production 변수·D1·자산 바인딩 확인 |
| 로컬 마이그레이션 | 통과 | 0001~0004 적용, 재실행 시 미적용 항목 없음 |
| 의존성 audit | **0건** | npm audit --json, 개발 의존성 포함 |
| UI 시각 검토 | 캡처 및 직접 확인 | 393px / 320px / Light·Dark·System, docs/UI_REVIEW.md |

## 동작 검증

- 실제 로컬 API/D1: 생성 → 수정 → 완료 → 완료 취소 → 확인 후 삭제. Mock 분석 전/후에는 미리보기만 보이고, 확정하면 여러 항목이 DB에 저장된다. draft 재반영은 중복 생성하지 않는다.
- 실제 workerd: PBKDF2 로그인, HttpOnly/Secure/SameSite 세션 쿠키, 개인정보 API의 미인증 401, 미설정 인증의 503, 로그아웃, 로그인 시도 제한 429, 다른 Origin의 403.
- 실제 workerd/D1: 동일 버전의 반복 완료를 동시에 요청하면 1건 성공/1건 409. 날짜별 완료 이력 분리, 완료 취소, 삭제 cascade, 오래된 AI snapshot 거절, batch 실패 시 claim 잔류 없음.
- 실제 workerd: Web Crypto로 aes128gcm 암호화와 VAPID authorization 생성. 외부 Push 서비스로는 발송하지 않았다.
- 스케줄러: 같은 오전 9시 재호출에 구독당 1회 claim, VAPID 누락 실패 기록, 알림 비활성화 시에도 만료 세션 정리.
- Gemini 어댑터: 공식 Interactions와 기존 generateContent 요청/응답 계약을 테스트용 HTTP 응답으로 확인. 키는 헤더에만 포함, URL/브라우저에 없음, 후보의 설명 메모 제외, Interactions store=false.
- Gemini 오류: 429·400·404·500·네트워크 실패·20초 timeout·잘못된 JSON/스키마·불완전 응답을 검사. 원래 공급자 오류 본문이나 키를 사용자 오류에 노출하지 않는다.
- Mock 한국어: 복수 3항목, 마감일, 120분 소요시간, 오늘/내일/모레/다음 주·명시 날짜, 시작시간 미정, 모호한 오전/오후, 매일·월수금 루틴, 완료/삭제, 토요일→일요일 이동, 여러 후보 선택. 수정하지 않은 제목/설명/중요도/소요시간 보존.
- 규칙: 실제 epoch에 의한 서로 다른 offset의 날짜 비교, 유효한 달력 날짜, 루틴 시작 경계, 미래 전용 항목의 Today Top 3 제외.
- UI: 실패한 완료는 복구, 저장 성공 후 조회만 실패하면 완료를 되돌리지 않음. Storage 제한이 서버 저장 결과를 실패로 바꾸지 않음. 완료 중 편집 차단, Tab 순환/ESC/초점 복원, 빠른 입력, 320px 미리보기 가로 넘침 없음.
- 테마: Light/Dark/System 선택과 OS light↔dark 추종. 미국 LA 시간대로 실행한 브라우저에서도 서울 캘린더 요일 정렬 검증.
- PWA: Manifest standalone, 아이콘, 앱 셸의 오프라인 재로딩, API의 Cache Storage 제외, 오프라인 쓰기/AI 차단. 정적 자산에 인라인 스크립트를 허용하지 않는 CSP와 no-cache Service Worker 헤더 확인.

## 검증 중 발견해 수정한 문제

기존 필드가 누락될 수 있는 AI 전체 대체, 문자열 offset 비교, 반복 완료 경합, 알림 꺼짐 시 정리 누락, 저장 후 조회 실패의 잘못된 롤백, 완료 중 편집의 stale version, 대화상자 초점 복원, 좁은 미리보기 입력 overflow, 장치 시간대에 따른 캘린더 요일 오류를 수정했다. Zod/Vitest/Tinypool의 취약점 보고는 보안 업데이트 후 0건으로 재검사했다.

초기 브라우저/테스트 하네스 실패는 위 수정 후 재실행해 모두 통과했다. Zod 패키지 주석의 Rollup annotation 제거 경고와 로컬 Request.cf 대체 경고는 남지만 검사 종료는 성공이다.

## 미검증 / 외부 작업

- 실제 키 기반 Gemini 분석·429 수신·현재 무료 등급 자격은 미검증. 공식 GitHub 자료의 모델 목록/구조화 출력과 SDK 계약만 확인했다. docs/GEMINI_EVIDENCE.md 참고.
- 원격 Cloudflare D1/배포/Cron과 실제 Push 서비스 수락 및 iPhone 설치/수신은 미검증. dry-run은 실제 배포 성공이 아니다.
- UI 로그인 브라우저 테스트는 HTTP 응답 fixture를 사용한다. 서버 인증은 별도 실제 workerd 통합 테스트로 확인했다.
- GitHub Actions 실행 결과는 로컬 검사와 별개이다. PR API는 환경 정책 403으로 차단되어 PR 생성/검사 상태는 확인하지 못했다.
- 비밀값 패턴 스캔과 수동 검토는 모든 형태의 민감 데이터 부재를 수학적으로 보장하지 않는다. 스크린샷은 합성 fixture만 사용했다.
