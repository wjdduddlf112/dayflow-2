# 모바일 UI 검토

393×852와 320×700 Chromium에서 Today, Calendar, Inbox, Settings, 미리보기, 편집, 로그인 및 Light/Dark/System을 확인했다. 아래 이미지는 **API 응답을 고정한 합성 예시 데이터**이며 개인 일정/비밀값을 캡처하지 않았다. 실제 로그인 인증과 데이터 변경은 별도 workerd/API/E2E 테스트에서 검증한다. iPhone 실기기 결과가 아니다.

| 화면 | 캡처 |
|---|---|
| Today / Light | [이미지](screenshots/today-light.png) |
| Today / Dark | [이미지](screenshots/today-dark.png) |
| Calendar | [이미지](screenshots/calendar-light.png) |
| Inbox | [이미지](screenshots/inbox-light.png) |
| Settings | [이미지](screenshots/settings-light.png) |
| System → Dark | [이미지](screenshots/settings-system-dark.png) |
| AI 확인 미리보기 | [이미지](screenshots/ai-preview.png) |
| 일정 편집 | [이미지](screenshots/editor-light.png) |
| 320px Today | [이미지](screenshots/today-small.png) |
| 로그인 | [이미지](screenshots/login.png) |

모바일 본문/일정 제목과 보조 정보의 크기·대비를 개선했고 입력 글자는 16px로 맞췄다. 날짜 전용 필드와 시작시간을 상호 배타적으로 처리하고 미리보기의 datetime 입력은 한 열로 구성한다. 설정 토글은 44px 높이의 클릭 영역을 유지한다. Today에서 할 일이 일정 흐름에 중복되는 표시를 제거했고, 모바일 완료 진행률과 빠른 입력 버튼을 추가했다.

대화상자에는 배경 inert, 스크롤 잠금, Tab 순환, Escape 닫기, 호출 버튼으로 초점 복원을 적용했다. 완료 요청 중에는 해당 항목 편집·삭제를 잠시 막아 오래된 버전 저장 충돌을 피한다. 화면 전환 시 맨 위로 이동하고 시스템 테마 변경을 CSS 미디어 조건으로 따라간다.

재생성: 로컬 개발 서버 실행 후 `npm run screenshots`. CHROMIUM_PATH로 브라우저 위치를 지정할 수 있다. 캡처는 실제 모바일 뷰포트 크기이며 긴 화면은 스크롤로 사용한다. 실기기 Safari 키보드·Safe Area·홈 화면 splash·VoiceOver는 후속 검증이 필요하다.
