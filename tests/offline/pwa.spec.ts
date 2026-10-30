import { test, expect } from "@playwright/test";
test("production shell reopens offline without caching private API responses", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "좋은 하루의 시작." }),
  ).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "좋은 하루의 시작." }),
  ).toBeVisible();
  const apiCached = await page.evaluate(async () => {
    const names = await caches.keys();
    for (const name of names) {
      const requests = await (await caches.open(name)).keys();
      if (requests.some((r) => new URL(r.url).pathname.startsWith("/api/")))
        return true;
    }
    return false;
  });
  expect(apiCached).toBe(false);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "좋은 하루의 시작." }),
  ).toBeVisible();
  await expect(page.getByText(/오프라인 · 이 세션/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "AI 분석", exact: true }),
  ).toBeDisabled();
  await context.setOffline(false);
});
test("production static assets ship strict script policy and no-cache service worker", async ({
  request,
}) => {
  const index = await request.get("/");
  expect(index.headers()["content-security-policy"]).toContain(
    "script-src 'self';",
  );
  expect(index.headers()["content-security-policy"]).not.toContain(
    "script-src 'self' 'unsafe-inline'",
  );
  expect(index.headers()["x-content-type-options"]).toBe("nosniff");
  const sw = await request.get("/sw.js");
  expect(sw.headers()["cache-control"]).toContain("no-cache");
});
