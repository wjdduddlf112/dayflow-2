# Gemini 연결 근거와 미확인 범위

확인일: 2026-10-30 KST.

## 직접 읽은 Google 공식 자료

- [Google Gemini Cookbook README](https://github.com/google-gemini/cookbook/blob/main/README.md): Gemini 3.8 Flash와 Gemini 3.5 Flash-Lite 소개를 확인했다.
- [Get Started](https://github.com/google-gemini/cookbook/blob/main/quickstarts/Get_started.ipynb): MODEL_ID 선택 목록에 `gemini-3.5-flash-lite`가 포함되어 있다. 이 자료의 다른 모델 설명에서 Gemini 4 Argon과 3.1 Pro Preview에는 free tier가 없다고 명시한다. **이 설명의 반대 해석으로 Flash-Lite 무료 제공을 확정하지 않는다.**
- [Structured JSON 예제](https://github.com/google-gemini/cookbook/blob/main/quickstarts/JSON_mode.ipynb): Interactions API `response_format={type:'text',mime_type:'application/json',schema:...}`와 JSON 결과 재검증 절차를 확인했다. 모델 선택 목록에 같은 Flash-Lite ID가 있다.
- Google 공식 npm 패키지 `@google/genai@2.32.0`의 타입/웹 소스를 읽어 `POST /{api_version}/interactions`, `system_instruction`, `response_format`, `store`, `steps[].type='model_output'` 계약을 확인했다. SDK의 `output_text`는 SDK가 합성한 속성이므로 REST 응답에서는 마지막 model_output 단계의 text를 읽는다. 패키지는 앱 의존성으로 설치하지 않고 문서 대조용으로만 읽었다.

## 설정 결정

후보 기본값은 `GEMINI_MODEL=gemini-3.5-flash-lite`, `GEMINI_API_STYLE=interactions`이다. 두 값은 서버 환경변수로 교체한다. 기존 generateContent 계약이 필요한 확인된 모델에는 `GEMINI_API_STYLE=generate-content`를 사용할 수 있다. 자동으로 다른 모델이나 공급자로 재시도하지 않는다.

Interactions 요청은 store=false, stream=false로 보내며 연속 대화 ID를 보관하지 않는다. 이는 Google의 무료 API 데이터 이용 정책을 배제하는 설정은 아니다. 사용량 제한 오류에서 자동 재시도하지 않으며 앱의 서울 날짜당 30회 한도와 4,096 output token 상한을 사용한다.

## 현재 확인하지 못한 것

[공식 가격 페이지](https://ai.google.dev/gemini-api/docs/pricing), [모델 문서](https://ai.google.dev/gemini-api/docs/models)와 공식 Cloudflare 제한 문서는 현재 실행 환경의 네트워크 정책으로 접근이 거부되었다. 따라서 **2026-10-30의 Flash-Lite 무료 등급 제공 여부, RPM/RPD, 지역/계정 제한, 현재 SLA 및 실제 호출 성공을 확인하지 못했다.** 모델 이름을 확인한 것과 무료 제공을 확인한 것은 다르다.

현재 설정은 무료 운영을 보증하지 않는다. 사용자는 무료 프로젝트/무료 제공 모델인지 확인한 뒤에만 서버 키를 등록해야 한다. 결제 설정·유료 가입·실제 API 호출·배포는 이 작업에서 수행하지 않았다.

## 검증 수준

REST 요청/응답 계약, 429, 4xx/5xx, 네트워크 장애, 타임아웃, 중단/잘못된 JSON/스키마 응답을 테스트용 HTTP 응답으로 검증했다. 한국어 파서는 명시적 개발 Mock으로 검증했다. 실제 키 기반 Gemini 결과의 품질·정확성은 미검증이다.
