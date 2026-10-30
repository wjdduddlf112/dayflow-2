한국어 자연어를 확인 가능한 미리보기로 정리한 뒤 일정·할 일·루틴으로 저장하는 개인용 Dayflow 2.0을 추가합니다. React 모바일 PWA, 동일 오리진 Cloudflare Worker API/D1, 단일 사용자 세션 인증, Gemini/명시적 개발 Mock, Top 3와 Web Push/Cron을 포함합니다.

후속 검토에서는 AI 수정 시 기존 데이터 보존, 시간대별 날짜 비교, 반복 완료 경합, 알림과 무관한 만료 데이터 정리, 성공한 저장의 잘못된 롤백, 모바일 입력·대화상자 초점·테마 및 취약 의존성을 개선했습니다. 공식 Google Cookbook/SDK를 대조한 Interactions 어댑터를 추가했고 현재 후보 모델은 gemini-3.5-flash-lite입니다. 현재 무료 등급 여부는 공식 가격 페이지 접근 차단으로 확인하지 못했습니다.

검증: TypeScript / ESLint / 프로덕션 빌드 / 단위·통합 53개 / 모바일 브라우저 5개 / PWA 오프라인·보안 헤더 2개 통과. workerd에서 인증·D1 경합·aes128gcm/VAPID 암호화를 확인했고 npm audit는 개발 의존성 포함 0건입니다. Wrangler dry-run으로 production 변수와 바인딩을 확인했습니다.

실제 Gemini 호출, 현재 무료 플랜 자격, 원격 배포/Cron 및 iPhone 설치·푸시 수신은 미검증입니다. 배포·결제·PR 병합은 하지 않았으며 기존 Sites/DB와 독립된 앱입니다. SETUP.md, TEST_REPORT.md, NEXT_STEPS.md, docs/SECURITY_REVIEW.md와 docs/UI_REVIEW.md를 참고하세요.
