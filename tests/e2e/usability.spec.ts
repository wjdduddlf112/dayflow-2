import { test, expect } from "@playwright/test";
const day = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const item = {
  id: "fixture-one",
  type: "task",
  title: "검토할 계획",
  description: "",
  scheduledDate: day,
  startAt: null,
  endAt: null,
  dueAt: null,
  estimatedMinutes: 30,
  priority: "high",
  recurrence: null,
  completed: false,
  version: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};
const state = {
  items: [item],
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
test("iPhone dialogs trap focus, escape restores focus, quick capture and preview fit 320px", async ({
  page,
}) => {
  await page.route("**/api/state*", (r) => r.fulfill({ json: state }));
  await page.route("**/api/ai/analyze", (r) =>
    r.fulfill({
      json: {
        id: "fixture",
        message: "예시 미리보기",
        actions: [
          {
            operation: "create",
            targetId: null,
            changedFields: [],
            item,
            confidence: 0.7,
            requiresConfirmation: true,
            warning: null,
          },
        ],
        candidates: [],
      },
    }),
  );
  await page.goto("/");
  await expect(
    page.locator(".item-main").filter({ hasText: item.title }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "새 일정", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "저장하기", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "편집 닫기" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "새 일정", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "빠른 입력" }).click();
  await expect(page.getByLabel("자연어 일정 입력")).toBeFocused();
  await page.getByLabel("자연어 일정 입력").fill("내일 공부");
  await page.getByRole("button", { name: "AI 분석", exact: true }).click();
  await page.setViewportSize({ width: 320, height: 700 });
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(
    await page
      .getByRole("dialog")
      .evaluate((e) => e.scrollWidth <= e.clientWidth),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await page
    .getByRole("navigation", { name: "주요 화면" })
    .getByRole("button", { name: "설정", exact: true })
    .click();
  await page.getByRole("button", { name: "시스템", exact: true }).click();
  await page.emulateMedia({ colorScheme: "dark" });
  expect(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--bg")
        .trim(),
    ),
  ).toBe("#10131a");
  await page.emulateMedia({ colorScheme: "light" });
  expect(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--bg")
        .trim(),
    ),
  ).toBe("#f7f8fb");
});
test("login exposes loading and error states and returns to the application", async ({
  page,
}) => {
  let authenticated = false;
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { authenticated } }),
  );
  await page.route("**/api/state*", (r) =>
    r.fulfill({ json: { ...state, development: false } }),
  );
  await page.route("**/api/login", async (r) => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    if (r.request().postDataJSON().password === "fixture-password") {
      authenticated = true;
      await r.fulfill({ json: { ok: true } });
    } else
      await r.fulfill({
        status: 401,
        json: { error: "비밀번호를 확인하세요." },
      });
  });
  await page.goto("/");
  await page.getByLabel("비밀번호").fill("wrong");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page.getByRole("button", { name: "로그인 중…" })).toBeDisabled();
  await expect(page.getByRole("alert")).toContainText("비밀번호");
  await page.getByLabel("비밀번호").fill("fixture-password");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "좋은 하루의 시작." }),
  ).toBeVisible();
});
test("calendar weekday alignment is independent of device timezone", async ({
  page,
}) => {
  await page.route("**/api/state*", (r) => r.fulfill({ json: state }));
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "주요 화면" })
    .getByRole("button", { name: "캘린더", exact: true })
    .click();
  const month = day.slice(0, 7);
  const first = page.getByRole("button", { name: month + "-01", exact: true });
  const index = await first.evaluate((e) =>
    Array.from(e.parentElement!.children).indexOf(e),
  );
  expect(index).toBe(7 + new Date(month + "-01T12:00:00Z").getUTCDay());
});
