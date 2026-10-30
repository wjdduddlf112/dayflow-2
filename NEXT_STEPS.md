# 남은 작업과 권장 순서

## 1. 네트워크 설정 적용 및 PR

최초 MVP 4개 커밋을 소유자 승인 후 `wjdduddlf112/dayflow-2`의 `feat/dayflow-mvp`에 push했고 원격 SHA 일치를 확인했다. 후속 수정도 이 브랜치로 보존한다. main에는 병합하지 않는다.

GitHub PR 생성은 `https://api.github.com/graphql`에서 환경 정책 403으로 차단됐다. **생성된 PR 링크는 없다.** 환경 설정에서 초안의 api.github.com 허용을 적용한 뒤 기존 인증으로 재시도해야 한다. 실패만으로 새 토큰이 필요하다고 단정하지 않는다.

준비된 PR 설명은 docs/PR_DESCRIPTION.md에 있다. 연결이 가능해지면 다음 명령을 실행한다.

```bash
gh pr create --repo wjdduddlf112/dayflow-2 --base main --head feat/dayflow-mvp \
  --title 'feat: Dayflow 2.0 개인 AI 일정 비서 MVP' --body-file docs/PR_DESCRIPTION.md
```

이미 PR이 만들어졌다면 같은 설명으로 `gh pr edit`하고 중복 생성하지 않는다. 병합/실서비스 배포는 별도 승인 대상이다.

## 2. 무료 Gemini 확인 후 키 등록

공식 현재 예제의 후보는 gemini-3.5-flash-lite이며 Interactions API JSON Schema 계약을 구현했다. **공식 가격 페이지는 현재 차단되어 무료 등급 제공 여부는 미확인**이다. ai.google.dev 허용을 적용한 뒤 무료 모델/지역·계정 조건을 확인하고 GEMINI_MODEL / GEMINI_API_STYLE를 확정한다. GEMINI_API_KEY는 무료 프로젝트의 서버 비밀값으로만 등록한다. docs/GEMINI_EVIDENCE.md에 확인 근거와 미확인 범위를 구분했다.

키 등록 후 비민감 문장으로 분석 → 미리보기 → 확정 → 실제 DB 변경, 수정/삭제 대상 선택, 잘못된 응답/429를 시험한다. Mock 통과는 실제 모델의 한국어 정확성 검증을 대신하지 않는다. 자동 유료 모델 fallback은 없다.

## 3. 배포 승인 전 준비

새 D1 생성 및 실제 UUID, AUTH_PASSWORD_HASH, SESSION_SECRET, VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT를 준비한다. SETUP.md의 프로덕션 표를 따른다. development 인증 생략 설정을 원격으로 복사하지 않는다. 현재 dry-run만 통과했으며 배포하지 않았다.

무료 Workers·D1·Cron의 현재 할당량/CPU 제한을 공식 문서에서 확인한다(developers.cloudflare.com 허용 필요). 항목 수에 비례한 매분 조회·발송 비용을 먼저 측정한다. 유료 플랜 변경 없이 한도에 맞춰 주기/쿼리를 조정한다.

## 4. 승인 후 배포 및 iPhone 실기기

새 Dayflow 2 DB에 마이그레이션 → HTTPS 배포 → 로그인/로그아웃/권한 검사 → iOS 16.4+ 홈 화면 설치 → 알림 허용과 테스트 알림 → 다음날 09시 KST 브리핑 / 30분 전 일정 / 루틴 시간 / 만료 구독·알림 해제 검사 순서다. 기존 Sites 및 DB에는 연결하지 않는다.

## 알려진 제한

- 반복은 매일/매주만 지원하며 월간/예외 반복은 없다.
- Mock은 제한된 규칙 파서이며 모든 한국어 이월/연쇄 명령을 해석하지 않는다. 애매하면 수동 대상·날짜 확인이 필요하다.
- 목록은 최대 2,000항목. 장기 사용 전 페이지네이션/보관/백업·복원 UI가 필요하다.
- 알림은 claim을 통한 at-most-once이며 실패/중단 시 자동 재시도하지 않는다. Cron 지연으로 누락될 수 있다.
- 푸시 설정은 계정 단위다. 한 기기에서 끄면 계정 알림이 중단되고 테스트 알림은 등록 기기에 전송된다.
- 실제 무료 운영비를 보증하지 않는다. 일일 AI 30회는 공급자의 무료 한도와 다르다.
- 실시간 다중 기기 동기화 대신 화면 전환과 작업 후 갱신한다.
- 로그인 세션은 7일, Idempotency-Key 보존도 7일. 비밀번호 교체 시 기존 세션을 모두 만료하려면 SESSION_SECRET도 교체한다.
- Safari 키보드·Safe Area·VoiceOver·splash·백그라운드 Push는 iPhone에서 별도로 확인해야 한다.
