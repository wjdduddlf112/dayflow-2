# 구현 결정 및 제약

- 기존 Sites URL, DB 및 소스에 접근하거나 연결하지 않았다. 별도의 D1 스키마를 사용한다.
- React 19 / Vite 7 / Cloudflare Vite Plugin / Wrangler 4. 의존성은 package-lock.json으로 고정한다.
- Gemini 모델은 `gemini-2.5-flash-lite`를 **잠정 기본값**으로 두었다. 2026-10-30 KST 공식 가격 및 Structured Output 문서 접근이 환경 정책(HTTP 403)으로 차단되어 **현재 무료 등급 여부를 확인하지 못했다**. 운영자는 https://ai.google.dev/gemini-api/docs/pricing 과 https://ai.google.dev/gemini-api/docs/structured-output 를 확인하고, 무료 제공과 Structured Output 지원이 확인된 모델만 GEMINI_MODEL에 설정해야 한다. 유료 API나 대체 공급자 fallback은 없다.
- Google REST `generateContent` + JSON Schema + Zod 재검증. `GEMINI_API_KEY`는 서버에서만 읽는다. 테스트는 Mock 사용이며 실제 API 성공을 의미하지 않는다.
- Mock은 의도적으로 제한된 한국어 규칙 파서다. 복잡한 명령과 임의 날짜 추론을 실제 AI와 동등하게 보장하지 않는다. 개발 모드 표시와 production 차단으로 구별한다.
- 날짜만 있는 작업은 scheduledDate로 보관하고 startAt은 null로 둔다. 소요시간을 시작시간으로 해석하지 않는다.
- 반복은 daily / weekly와 요일 배열에 한정한다. 반복 해제는 task로 전환한다. 월간/예외 반복은 후속 기능이다.
- Top 3는 결정적인 규칙 기반이며 Gemini 호출이 없다. 중요도·마감·미완료 나이·소요시간·충돌을 사용한다. 일일 브리핑도 LLM을 호출하지 않는다.
- Push는 Web Crypto 기반 @block65/webcrypto-web-push를 사용하며 실제 workerd 암호화 테스트로 호환성을 확인한다. v2는 aes128gcm / VAPID 인증 형식을 사용한다. 실제 Push 서비스 수락과 iPhone 수신은 별도 검증한다.
- NotificationLogs의 UNIQUE 키를 먼저 claim한다. 중복 회피를 위해 at-most-once 정책이며, 발송 실패 또는 claim 후 프로세스 중단 시 자동 재시도하지 않는다. 실패 로그는 보존한다. 정확히 한 번 전달을 보장하지 않는다. 구독 만료 404/410은 제거한다.
- 계정 단위 알림 설정이며 장치별 구독을 저장한다. 한 기기에서 알림을 끄면 계정 알림이 중단된다. 테스트 알림은 등록 기기 모두로 발송한다.
- 세션은 랜덤 토큰을 해시해 D1에 저장하며 7일 만료. PBKDF2-SHA256 100,000회(Workers Web Crypto 제한 고려), 16바이트 이상 랜덤 salt를 키 생성 도구에서 사용한다. 로그인은 IP당 15분 5회 허용하며 실패 닫힘을 적용한다.
- 캐시에는 공개 앱 셸만 저장한다. 개인정보 API는 Cache-Control:no-store, Service Worker 캐시 제외. 읽은 일정은 sessionStorage에만 보관하고 로그아웃 시 지운다. 오프라인에서도 기기를 공유하지 않아야 한다.
- D1 변경은 SQL 바인딩을 사용한다. 항목 version / AI snapshot 검증 / batch 내 UNIQUE guard로 오래된 수정과 중복 적용을 방지한다.
- API 날짜별 조회는 최대 2,000 항목을 대상으로 한다. 대규모 장기 사용 전 페이지네이션/보관 정책이 필요하다.
- Cloudflare 무료 플랜은 사용자가 선택한다. 코드에서 계정 결제/플랜 변경을 수행하지 않는다. Gemini 호출 수는 앱 자체의 일일 제한으로 추가 보호하며 공급자 무료 한도를 보장하는 수단은 아니다.
