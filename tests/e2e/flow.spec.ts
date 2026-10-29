import { test, expect } from "@playwright/test";
test("mobile CRUD, routine, AI preview confirmation, themes and PWA", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "좋은 하루의 시작." }),
  ).toBeVisible();
  const title = `테스트 일정 ${Date.now()}`;
  await page.getByRole("button", { name: "새 일정", exact: true }).click();
  await page.getByLabel("제목", { exact: true }).fill(title);
  await page.getByRole("button", { name: "저장하기", exact: true }).click();
  await expect(
    page.getByRole("button", { name: `${title} 완료`, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: `${title} 완료`, exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: `${title} 완료 취소`, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: `${title} 완료 취소`, exact: true })
    .click();
  await page.locator(".item-main").filter({ hasText: title }).click();
  await page.getByLabel("제목", { exact: true }).fill(title + " 수정");
  await page.getByRole("button", { name: "저장하기", exact: true }).click();
  await expect(
    page.locator(".item-main").filter({ hasText: title + " 수정" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: `${title} 수정 삭제`, exact: true })
    .click();
  await page.getByRole("button", { name: "삭제하기", exact: true }).click();
  await expect(
    page.locator(".item-main").filter({ hasText: title }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "인박스", exact: true }).click();
  await page
    .getByLabel("자연어 일정 입력")
    .fill(
      "내일 GSAT 두 시간 공부하고 금요일까지 지원서 마무리해야 해. 운동은 매일 하자.",
    );
  await page.getByRole("button", { name: "AI 분석", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator(".preview-card")).toHaveCount(3);
  const before = (await (await request.get("/api/state")).json()).items.length;
  await page.getByRole("button", { name: "확인하고 반영하기" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const after = (await (await request.get("/api/state")).json()).items;
  expect(after.length).toBe(before + 3);
  expect(after.some((i: { type: string }) => i.type === "routine")).toBe(true);
  await page.getByRole("button", { name: "설정", exact: true }).click();
  for (const t of ["다크", "라이트", "시스템"]) {
    await page.getByRole("button", { name: t, exact: true }).click();
    await expect(
      page.getByRole("button", { name: t, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  }
  await page.getByRole("button", { name: "캘린더", exact: true }).click();
  await expect(page.locator(".calendar-grid")).toBeVisible();
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons).toHaveLength(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/calendar-mobile.png",
    fullPage: true,
  });
});
test("AI replay is idempotent and production mutation origins enforced", async ({
  request,
}) => {
  const headers = { Origin: "http://localhost:5173" };
  const p = await request.post("/api/ai/analyze", {
    headers,
    data: { text: "내일 책 읽기" },
  });
  expect(p.ok()).toBe(true);
  const draft = await p.json();
  const before = (await (await request.get("/api/state")).json()).items.length;
  for (let i = 0; i < 2; i++)
    expect(
      (
        await request.post("/api/ai/apply", {
          headers,
          data: { id: draft.id, actions: draft.actions },
        })
      ).ok(),
    ).toBe(true);
  expect((await (await request.get("/api/state")).json()).items.length).toBe(
    before + 1,
  );
  expect(
    (
      await request.post("/api/items", {
        headers: { Origin: "https://evil.test" },
        data: {},
      })
    ).status(),
  ).toBe(403);
});
