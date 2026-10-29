import { it, expect } from "vitest";
import worker from "../worker/index";
import { authenticated } from "../worker/auth";
import type { Env } from "../worker/types";
it("fails closed without production auth secrets", async () => {
  expect(
    await authenticated(new Request("https://dayflow.test/api/state"), {
      APP_ENV: "production",
    } as Env),
  ).toBe(false);
});
it("rejects unauthenticated private APIs", async () => {
  const r = await worker.fetch(new Request("https://dayflow.test/api/state"), {
    APP_ENV: "production",
  } as Env);
  expect(r.status).toBe(401);
});
it("rejects cross-origin mutation before auth", async () => {
  const r = await worker.fetch(
    new Request("https://dayflow.test/api/items", {
      method: "POST",
      headers: { Origin: "https://evil.test" },
    }),
    { APP_ENV: "development" } as Env,
  );
  expect(r.status).toBe(403);
});
it("refuses production login when secrets are missing", async () => {
  const r = await worker.fetch(
    new Request("https://dayflow.test/api/login", {
      method: "POST",
      headers: { Origin: "https://dayflow.test" },
    }),
    { APP_ENV: "production" } as Env,
  );
  expect(r.status).toBe(503);
});
