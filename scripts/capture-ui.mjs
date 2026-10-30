import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
const day = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const base = {
  description: "",
  scheduledDate: null,
  startAt: null,
  endAt: null,
  dueAt: null,
  estimatedMinutes: null,
  priority: "medium",
  recurrence: null,
  completed: false,
  version: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};
const items = [
  {
    ...base,
    id: "demo-task",
    type: "task",
    title: "지원서 최종 검토",
    dueAt: `${day}T23:59:00+09:00`,
    priority: "high",
    estimatedMinutes: 30,
  },
  {
    ...base,
    id: "demo-event",
    type: "event",
    title: "모의 면접 연습",
    startAt: `${day}T15:00:00+09:00`,
    endAt: `${day}T16:00:00+09:00`,
    estimatedMinutes: 60,
  },
  {
    ...base,
    id: "demo-routine",
    type: "routine",
    title: "가볍게 걷기",
    recurrence: { frequency: "daily", weekdays: [], time: "18:00" },
  },
  { ...base, id: "demo-inbox", type: "task", title: "다음에 읽을 책 고르기" },
];
const state = {
  items,
  settings: {
    aiEnabled: true,
    notificationsEnabled: false,
    routineNotifications: false,
    timezone: "Asia/Seoul",
  },
  aiMode: "mock",
  development: true,
  vapidPublicKey: null,
};
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
mkdirSync("docs/screenshots", { recursive: true });
const context = await browser.newContext({
  viewport: { width: 393, height: 852 },
  locale: "ko-KR",
  deviceScaleFactor: 1,
});
await context.route("**/api/session", (r) =>
  r.fulfill({ json: { authenticated: true } }),
);
await context.route("**/api/state*", (r) => r.fulfill({ json: state }));
await context.route("**/api/ai/analyze", (r) =>
  r.fulfill({
    json: {
      id: "demo-only",
      message: "개발용 Mock 미리보기 · 예시 데이터입니다.",
      candidates: [],
      actions: [
        {
          operation: "create",
          targetId: null,
          changedFields: [],
          item: {
            ...base,
            type: "task",
            title: "GSAT 공부",
            scheduledDate: day,
            estimatedMinutes: 120,
          },
          confidence: 0.7,
          requiresConfirmation: true,
          warning: "시작시간이 정해지지 않았어요. 날짜만 저장합니다.",
        },
      ],
    },
  }),
);
const page = await context.newPage();
await page.goto("http://localhost:5173");
await page.getByRole("heading", { name: "좋은 하루의 시작." }).waitFor();
await page
  .getByRole("button", { name: "지원서 최종 검토 완료", exact: true })
  .waitFor();
const capture = async (name) =>
  page.screenshot({ path: `docs/screenshots/${name}.png`, fullPage: false });
await capture("today-light");
await page
  .getByRole("navigation", { name: "주요 화면" })
  .getByRole("button", { name: "캘린더", exact: true })
  .click();
await capture("calendar-light");
await page.getByRole("button", { name: "인박스", exact: true }).click();
await capture("inbox-light");
await page.getByLabel("자연어 일정 입력").fill("내일 GSAT 두 시간 공부");
await page.getByRole("button", { name: "AI 분석", exact: true }).click();
await page.getByRole("dialog").waitFor();
await capture("ai-preview");
await page.getByRole("button", { name: "미리보기 닫기" }).click();
await page
  .getByRole("navigation", { name: "주요 화면" })
  .getByRole("button", { name: "오늘", exact: true })
  .click();
await page.getByRole("button", { name: "새 일정", exact: true }).click();
await page.getByLabel("제목", { exact: true }).fill("가벼운 하루 계획");
await capture("editor-light");
await page.keyboard.press("Escape");
await page.getByRole("button", { name: "설정", exact: true }).click();
await capture("settings-light");
await page.getByRole("button", { name: "다크", exact: true }).click();
await page
  .getByRole("navigation", { name: "주요 화면" })
  .getByRole("button", { name: "오늘", exact: true })
  .click();
await capture("today-dark");
await page.getByRole("button", { name: "설정", exact: true }).click();
await page.getByRole("button", { name: "시스템", exact: true }).click();
await page.emulateMedia({ colorScheme: "dark" });
await capture("settings-system-dark");
await page.setViewportSize({ width: 320, height: 700 });
await page
  .getByRole("navigation", { name: "주요 화면" })
  .getByRole("button", { name: "오늘", exact: true })
  .click();
await capture("today-small");
const login = await browser.newContext({
  viewport: { width: 393, height: 852 },
  locale: "ko-KR",
});
await login.route("**/api/session", (r) =>
  r.fulfill({ json: { authenticated: false } }),
);
const loginPage = await login.newPage();
await loginPage.goto("http://localhost:5173");
await loginPage.getByRole("button", { name: "로그인", exact: true }).waitFor();
await loginPage.screenshot({
  path: "docs/screenshots/login.png",
  fullPage: false,
});
await browser.close();
console.log(
  "Captured synthetic UI fixtures; no production or local personal schedule data was read.",
);
