# Dayflow 2.0

한국어 자연어를 일정·할 일·루틴으로 정리하는 단일 사용자 AI 비서. iPhone 중심 PWA이며 React / TypeScript / Vite / Tailwind / Cloudflare Workers / D1으로 구성합니다. 기존 Dayflow Sites와 연결하지 않는 독립 프로젝트입니다.

```bash
npm ci
cp .env.example .dev.vars  # 기존 파일이 없을 때만
npm run db:migrate
npm run dev
```

로컬 기본값은 **개발용 Mock + 인증 생략**입니다. 외부에 개발 서버를 공개하거나 실제 개인정보를 넣지 마세요. 프로덕션은 인증 비밀값 없이 API 접근을 거부하고, Gemini 키 없이 Mock을 AI처럼 제공하지 않습니다.

- Today: 규칙 기반 브리핑, Top 3, 일정/할 일, 낙관적 완료 및 실패 복구
- Calendar: 월간 및 선택 날짜 일간 보기, 수동 CRUD
- Inbox: 자연어 분석 → 편집 가능한 미리보기 → 확인 → D1 반영, 날짜 미확정 항목
- Settings: Light/Dark/System, AI 사용 제어, Push 구독/해제/시험, 설치 및 개인정보 안내
- 서버: Gemini Structured Output + Zod, 세션 인증, 로그인 제한, Origin 검사, 멱등 AI draft, 루틴별 일일 완료, Cron과 중복 발송 방지
- PWA: 앱 아이콘, standalone, 앱 셸 캐시, 세션 내 오프라인 읽기

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
npm run test:offline
npm audit
npm run audit:history
```

설정은 [SETUP.md](SETUP.md), 구조는 [ARCHITECTURE.md](ARCHITECTURE.md), 검증 결과는 [TEST_REPORT.md](TEST_REPORT.md), 미완료 사항은 [NEXT_STEPS.md](NEXT_STEPS.md), 세부 제약은 [docs/DECISIONS.md](docs/DECISIONS.md)를 참고하세요.

실제 Gemini 연결, Cloudflare 배포 및 iPhone Push 수신은 아직 검증하지 않았습니다. 무료 플랜과 모델 제공 여부는 운영 전 직접 확인해야 하며 자동 결제/유료 전환/배포는 하지 않았습니다.

후속 검토에서 AI 수정 필드 보존, 시간대 비교, 반복 완료 경합, Cron 데이터 정리, 모바일 초점/입력 및 취약 의존성을 개선했습니다. [UI 캡처](docs/UI_REVIEW.md)와 [공식 Gemini 자료 확인 범위](docs/GEMINI_EVIDENCE.md)를 참고하세요. 현재 후보 모델은 `gemini-3.5-flash-lite`와 Interactions API이며, 무료 등급 자격과 실제 호출은 아직 확인하지 않았습니다.

원격 작업 브랜치: [feat/dayflow-mvp](https://github.com/wjdduddlf112/dayflow-2/tree/feat/dayflow-mvp). 최초 4개 커밋은 업로드했고 후속 검토도 같은 브랜치에 보존합니다. PR API는 환경 네트워크 정책으로 차단되어 PR 생성 완료로 보고하지 않습니다.
