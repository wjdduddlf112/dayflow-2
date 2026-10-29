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
```

설정은 [SETUP.md](SETUP.md), 구조는 [ARCHITECTURE.md](ARCHITECTURE.md), 검증 결과는 [TEST_REPORT.md](TEST_REPORT.md), 미완료 사항은 [NEXT_STEPS.md](NEXT_STEPS.md), 세부 제약은 [docs/DECISIONS.md](docs/DECISIONS.md)를 참고하세요.

실제 Gemini 연결, Cloudflare 배포 및 iPhone Push 수신은 아직 검증하지 않았습니다. 무료 플랜과 모델 제공 여부는 운영 전 직접 확인해야 하며 자동 결제/유료 전환/배포는 하지 않았습니다.
