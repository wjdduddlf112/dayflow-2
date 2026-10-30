// @vitest-environment node
import { beforeAll, afterAll, it, expect } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { build } from "esbuild";
import { notify } from "../worker/push";
import type { Env } from "../worker/types";
import { readFileSync, readdirSync } from "node:fs";
import { randomBytes, pbkdf2Sync, webcrypto, randomUUID } from "node:crypto";
let mf: Miniflare;
let db: D1Database;
const password = "ephemeral-test-password";
const origin = "https://dayflow.test";
const call = (path: string, method = "GET", data?: unknown, cookie?: string) =>
  mf.dispatchFetch(origin + path, {
    method,
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      "Idempotency-Key": randomUUID(),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
  });
beforeAll(async () => {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, 100000, 32, "sha256");
  const compiled = await build({
    entryPoints: ["worker/index.ts"],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    external: ["node:crypto"],
  });
  mf = new Miniflare(
    convertV4MiniflareOptions({
      workers: [
        {
          modules: true,
          script: compiled.outputFiles[0].text,
          compatibilityDate: "2026-10-01",
          compatibilityFlags: ["nodejs_compat"],
          d1Databases: ["DB"],
          bindings: {
            APP_ENV: "production",
            AI_MODE: "mock",
            GEMINI_MODEL: "gemini-2.5-flash-lite",
            AUTH_PASSWORD_HASH: `100000:${salt.toString("base64")}:${hash.toString("base64")}`,
            SESSION_SECRET: randomBytes(32).toString("hex"),
          },
        },
      ],
    }),
  );
  db = (await mf.getD1Database("DB")) as unknown as D1Database;
  const sql = readdirSync("migrations")
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync("migrations/" + name, "utf8"))
    .join("\n");
  await db.exec(sql.replace(/\n/g, " "));
}, 30000);
afterAll(async () => {
  await mf?.dispose();
});
it("real workerd verifies password, cookie session, CRUD and logout", async () => {
  expect((await call("/api/state")).status).toBe(401);
  expect((await call("/api/login", "POST", { password: "wrong" })).status).toBe(
    401,
  );
  const login = await call("/api/login", "POST", { password });
  expect(login.status).toBe(200);
  const cookie = login.headers.get("set-cookie")!;
  expect(cookie).toContain("HttpOnly");
  expect(cookie).toContain("Secure");
  expect(cookie).toContain("SameSite=Strict");
  const s = await call("/api/state", "GET", undefined, cookie);
  expect(s.status).toBe(200);
  expect(((await s.json()) as { aiMode: string }).aiMode).toBe("unavailable");
  // Production never silently uses Mock when API key is missing.
  expect(
    (await call("/api/ai/analyze", "POST", { text: "내일 공부" }, cookie))
      .status,
  ).toBe(503);
  await call("/api/logout", "POST", {}, cookie);
  expect((await call("/api/state", "GET", undefined, cookie)).status).toBe(401);
});
it("rate limits login attempts", async () => {
  for (let i = 0; i < 6; i++)
    await call("/api/login", "POST", { password: "wrong" });
  expect((await call("/api/login", "POST", { password })).status).toBe(429);
});
it("D1 enforces per-routine daily completion and notification deduplication", async () => {
  await db
    .prepare("INSERT INTO ScheduleItems VALUES(?,?,1,?,?)")
    .bind("routine", "{}", "now", "now")
    .run();
  for (const day of ["2026-10-30", "2026-10-31", "2026-10-30"])
    await db
      .prepare("INSERT OR IGNORE INTO RoutineCompletions VALUES(?,?)")
      .bind("routine", day)
      .run();
  expect(
    (await db.prepare("SELECT * FROM RoutineCompletions").all()).results,
  ).toHaveLength(2);
  await db
    .prepare("INSERT INTO NotificationLogs VALUES('one','sub','pending','now')")
    .run();
  expect(
    (
      await db
        .prepare(
          "INSERT OR IGNORE INTO NotificationLogs VALUES('one','sub','pending','now')",
        )
        .run()
    ).meta.changes,
  ).toBe(0);
});
it("builds encrypted Web Push payload inside workerd using Web Crypto", async () => {
  const vapid = await webcrypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const pub = Buffer.from(
    await webcrypto.subtle.exportKey("raw", vapid.publicKey),
  ).toString("base64url");
  const priv = await webcrypto.subtle.exportKey("jwk", vapid.privateKey);
  const subscriber = await webcrypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const p256dh = Buffer.from(
    await webcrypto.subtle.exportKey("raw", subscriber.publicKey),
  ).toString("base64url");
  const compiled = await build({
    stdin: {
      contents: `import {buildPushPayload} from '@block65/webcrypto-web-push';export default {async fetch(){const p=await buildPushPayload({data:'test',options:{ttl:60}},${JSON.stringify({ endpoint: "https://web.push.apple.com/test", keys: { p256dh, auth: randomBytes(16).toString("base64url") } })},${JSON.stringify({ subject: "mailto:test@example.com", publicKey: pub, privateKey: priv.d })});return Response.json({encrypted:p.body.length>0,authorization:p.headers.authorization.startsWith('vapid '),encoding:p.headers['content-encoding']});}};`,
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    external: ["node:crypto"],
  });
  const push = new Miniflare(
    convertV4MiniflareOptions({
      workers: [
        {
          modules: true,
          script: compiled.outputFiles[0].text,
          compatibilityDate: "2026-10-01",
          compatibilityFlags: ["nodejs_compat"],
        },
      ],
    }),
  );
  try {
    const r = await push.dispatchFetch(origin);
    expect(await r.json()).toEqual({
      encrypted: true,
      authorization: true,
      encoding: "aes128gcm",
    });
  } finally {
    await push.dispose();
  }
}, 30000);

it("scheduler claims one morning briefing per subscription even on duplicate invocation", async () => {
  await db
    .prepare("INSERT INTO UserSettings VALUES(1,?)")
    .bind(
      JSON.stringify({
        aiEnabled: true,
        notificationsEnabled: true,
        routineNotifications: false,
        timezone: "Asia/Seoul",
      }),
    )
    .run();
  await db
    .prepare("INSERT INTO PushSubscriptions VALUES(?,?,?)")
    .bind("sub", "{}", "now")
    .run();
  await db.prepare("DELETE FROM ScheduleItems").run();
  const env = { DB: db } as Env;
  const now = new Date("2026-10-30T00:00:00Z");
  await notify(env, now);
  await notify(env, now);
  const logs = await db
    .prepare("SELECT * FROM NotificationLogs WHERE id LIKE 'brief:%'")
    .all();
  expect(logs.results).toHaveLength(1);
  expect(logs.results[0].status).toBe("failed");
});
async function loginSession() {
  await db.prepare("DELETE FROM LoginAttempts").run();
  const res = await call("/api/login", "POST", { password });
  expect(res.status).toBe(200);
  return res.headers.get("set-cookie")!;
}
async function createItem(cookie: string, input: Record<string, unknown>) {
  const r = await call("/api/items", "POST", input, cookie);
  expect(r.status).toBe(201);
  return ((await r.json()) as { id: string }).id;
}
it("authenticated CRUD preserves data, rejects stale edits and isolates routine completion days", async () => {
  const cookie = await loginSession();
  const id = await createItem(cookie, {
    type: "routine",
    title: "회귀 운동",
    recurrence: { frequency: "daily", weekdays: [], time: "18:00" },
    priority: "high",
  });
  const responses = await Promise.all([
    call(
      `/api/items/${id}/complete`,
      "POST",
      { version: 1, completed: true, day: "2026-10-30" },
      cookie,
    ),
    call(
      `/api/items/${id}/complete`,
      "POST",
      { version: 1, completed: true, day: "2026-10-30" },
      cookie,
    ),
  ]);
  expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
  const get = async (day: string) => {
    const r = await call("/api/state?day=" + day, "GET", undefined, cookie);
    return (
      (await r.json()) as {
        items: { id: string; completed: boolean; version: number }[];
      }
    ).items.find((i) => i.id === id)!;
  };
  expect((await get("2026-10-30")).completed).toBe(true);
  expect((await get("2026-10-31")).completed).toBe(false);
  expect(
    (
      await call(
        `/api/items/${id}/complete`,
        "POST",
        { version: 2, completed: false, day: "2026-10-30" },
        cookie,
      )
    ).status,
  ).toBe(200);
  expect((await get("2026-10-30")).completed).toBe(false);
  expect(
    (
      await call(
        `/api/items/${id}`,
        "PUT",
        { version: 1, item: { type: "task", title: "stale" } },
        cookie,
      )
    ).status,
  ).toBe(409);
  const version = (await get("2026-10-30")).version;
  const deleted = await mf.dispatchFetch(origin + `/api/items/${id}`, {
    method: "DELETE",
    headers: { Origin: origin, Cookie: cookie, "If-Match": String(version) },
  });
  expect(deleted.status).toBe(200);
  expect(
    await db
      .prepare("SELECT * FROM RoutineCompletions WHERE item_id=?")
      .bind(id)
      .first(),
  ).toBeNull();
});
it("AI confirmed partial updates preserve private notes and reject a stale snapshot atomically", async () => {
  const cookie = await loginSession();
  const id = await createItem(cookie, {
    type: "task",
    title: "회귀 지원서",
    description: "fixture-private-note",
    priority: "high",
    estimatedMinutes: 120,
  });
  const { mockAnalyze } = await import("../worker/mock");
  const { list } = await import("../worker/store");
  const items = await list({ DB: db } as Env);
  const action = mockAnalyze(
    "내일 회귀 지원서를 옮겨 줘",
    items,
    new Date("2026-10-30T00:00:00Z"),
  );
  const draftId = randomUUID();
  await db
    .prepare(
      "INSERT INTO AIActionDrafts(id,data,snapshot,expires_at) VALUES(?,?,?,?)",
    )
    .bind(
      draftId,
      JSON.stringify(action),
      JSON.stringify(items.map((i) => ({ id: i.id, version: i.version }))),
      Date.now() + 60000,
    )
    .run();
  const applied = await call(
    "/api/ai/apply",
    "POST",
    { id: draftId, actions: action.actions },
    cookie,
  );
  expect(applied.status).toBe(200);
  const saved = await db
    .prepare("SELECT data FROM ScheduleItems WHERE id=?")
    .bind(id)
    .first<{ data: string }>();
  expect(JSON.parse(saved!.data)).toMatchObject({
    title: "회귀 지원서",
    description: "fixture-private-note",
    priority: "high",
    estimatedMinutes: 120,
    scheduledDate: "2026-10-31",
  });
  const staleId = randomUUID();
  await db
    .prepare(
      "INSERT INTO AIActionDrafts(id,data,snapshot,expires_at) VALUES(?,?,?,?)",
    )
    .bind(
      staleId,
      JSON.stringify(action),
      JSON.stringify(items.map((i) => ({ id: i.id, version: i.version }))),
      Date.now() + 60000,
    )
    .run();
  expect(
    (
      await call(
        "/api/ai/apply",
        "POST",
        { id: staleId, actions: action.actions },
        cookie,
      )
    ).status,
  ).toBe(409);
  expect(
    await db
      .prepare("SELECT * FROM RequestKeys WHERE id=?")
      .bind("draft:" + staleId)
      .first(),
  ).toBeNull();
});
it("cleans expired secrets-related state even with notifications disabled", async () => {
  await db
    .prepare("UPDATE UserSettings SET data=? WHERE id=1")
    .bind(JSON.stringify({ notificationsEnabled: false }))
    .run();
  await db
    .prepare("INSERT INTO Sessions VALUES(?,?)")
    .bind("expired-fixture", 1)
    .run();
  await notify({ DB: db } as Env, new Date("2026-10-30T01:00:00Z"));
  expect(
    await db
      .prepare("SELECT * FROM Sessions WHERE id=?")
      .bind("expired-fixture")
      .first(),
  ).toBeNull();
});
it("rejects malformed JSON, oversized UTF-8 bodies and invalid dates", async () => {
  const cookie = await loginSession();
  const r = await mf.dispatchFetch(origin + "/api/items", {
    method: "POST",
    headers: { Origin: origin, Cookie: cookie },
    body: "not-json",
  });
  expect(r.status).toBe(400);
  const large = await call(
    "/api/items",
    "POST",
    { title: "한".repeat(10000) },
    cookie,
  );
  expect(large.status).toBe(413);
  expect(
    (await call("/api/state?day=2026-02-30", "GET", undefined, cookie)).status,
  ).toBe(400);
});
