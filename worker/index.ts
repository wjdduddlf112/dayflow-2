import { z } from "zod";
import {
  analysisSchema,
  daySchema,
  resolveActionTarget,
  intervalsOverlap,
  itemInput,
  settingsSchema,
  seoulDay,
  topThree,
} from "../shared/domain";
import { authenticated, cookie, digest, verifyPassword } from "./auth";
import { analyze, GeminiError } from "./ai";
import { list, settings } from "./store";
import { notify, sendPush } from "./push";
import type { Env } from "./types";
const json = (
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
const fail = (message: string, status = 400) =>
  json({ error: message }, status);
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
async function body(req: Request) {
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError(400, "요청 내용이 없습니다.");
  const decoder = new TextDecoder();
  let text = "";
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 20000) throw new HttpError(413, "입력이 너무 깁니다.");
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    await reader.cancel();
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "올바른 JSON 요청이 필요합니다.");
  }
}
async function api(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;
  if (
    !["GET", "HEAD"].includes(method) &&
    req.headers.get("Origin") !== url.origin
  )
    return fail("요청 출처를 확인할 수 없습니다.", 403);
  if (path === "/api/session" && method === "GET")
    return json({
      authenticated: await authenticated(req, env),
      development: env.APP_ENV === "development",
    });
  if (path === "/api/login" && method === "POST") {
    if (env.APP_ENV === "development") return json({ ok: true });
    if (!env.AUTH_PASSWORD_HASH || !env.SESSION_SECRET)
      return fail("서버 인증 비밀값을 먼저 설정하세요.", 503);
    const key = await digest(req.headers.get("CF-Connecting-IP") || "local");
    const now = Date.now();
    const claim = await env.DB.prepare(
      "INSERT INTO LoginAttempts(key,attempts,reset_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN reset_at<? THEN 1 ELSE attempts+1 END, reset_at=CASE WHEN reset_at<? THEN excluded.reset_at ELSE reset_at END RETURNING attempts",
    )
      .bind(key, now + 900000, now, now)
      .first<{ attempts: number }>();
    if ((claim?.attempts || 0) > 5)
      return fail("로그인 시도가 많습니다. 15분 후 다시 시도하세요.", 429);
    const { password } = z
      .object({ password: z.string().max(256) })
      .parse(await body(req));
    if (!(await verifyPassword(password, env.AUTH_PASSWORD_HASH)))
      return fail("비밀번호를 확인하세요.", 401);
    const token = crypto.randomUUID() + crypto.randomUUID();
    await env.DB.prepare("INSERT INTO Sessions VALUES(?,?)")
      .bind(await digest(token + env.SESSION_SECRET), now + 604800000)
      .run();
    return json({ ok: true }, 200, { "Set-Cookie": cookie(token) });
  }
  if (!(await authenticated(req, env)))
    return fail("로그인이 필요합니다.", 401);
  if (path === "/api/logout" && method === "POST") {
    const token = req.headers
      .get("Cookie")
      ?.match(/dayflow_session=([^;]+)/)?.[1];
    if (token)
      await env.DB.prepare("DELETE FROM Sessions WHERE id=?")
        .bind(await digest(token + env.SESSION_SECRET))
        .run();
    return json({ ok: true }, 200, { "Set-Cookie": cookie("", 0) });
  }
  if (path === "/api/state" && method === "GET") {
    const day = daySchema.parse(url.searchParams.get("day") || seoulDay());
    return json({
      items: await list(env, day),
      settings: await settings(env),
      aiMode:
        env.APP_ENV === "development" && env.AI_MODE === "mock"
          ? "mock"
          : env.GEMINI_API_KEY
            ? "gemini"
            : "unavailable",
      vapidPublicKey: env.VAPID_PUBLIC_KEY || null,
      development: env.APP_ENV === "development",
    });
  }
  if (path === "/api/settings" && method === "PUT") {
    const s = settingsSchema.parse(await body(req));
    await env.DB.prepare(
      "INSERT INTO UserSettings VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
    )
      .bind(JSON.stringify(s))
      .run();
    return json(s);
  }
  if (path === "/api/items" && method === "POST") {
    const input = itemInput.parse(await body(req));
    const key = z.string().uuid().parse(req.headers.get("Idempotency-Key"));
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO RequestKeys VALUES(?,?)").bind(key, now),
      env.DB.prepare("INSERT INTO ScheduleItems VALUES(?,?,1,?,?)").bind(
        id,
        JSON.stringify({ ...input, completed: false }),
        now,
        now,
      ),
    ]);
    return json({ id }, 201);
  }
  const match = path.match(/^\/api\/items\/([^/]+)(\/complete)?$/);
  if (match) {
    const id = match[1];
    const row = await env.DB.prepare(
      "SELECT data,version FROM ScheduleItems WHERE id=?",
    )
      .bind(id)
      .first<{ data: string; version: number }>();
    if (!row) return fail("항목을 찾을 수 없습니다.", 404);
    const data = JSON.parse(row.data);
    if (method === "DELETE") {
      const version = Number(req.headers.get("If-Match"));
      const r = await env.DB.prepare(
        "DELETE FROM ScheduleItems WHERE id=? AND version=?",
      )
        .bind(id, version)
        .run();
      return r.meta.changes
        ? json({ ok: true })
        : fail("다른 변경사항이 있습니다. 새로고침하세요.", 409);
    }
    if (method === "PUT" || method === "POST") {
      const b = await body(req);
      const version = z.number().int().parse(b.version);
      if (version !== row.version)
        return fail("다른 변경사항이 있습니다. 새로고침하세요.", 409);
      if (match[2]) {
        const { completed, day } = z
          .object({
            completed: z.boolean(),
            day: daySchema,
          })
          .parse(b);
        if (data.type === "routine") {
          const guard = crypto.randomUUID();
          await env.DB.batch([
            env.DB.prepare(
              "INSERT INTO MutationGuards(id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM ScheduleItems WHERE id=? AND version=?) THEN 1 ELSE 0 END",
            ).bind(guard, id, version),
            env.DB.prepare(
              "UPDATE ScheduleItems SET version=version+1,updated_at=? WHERE id=? AND version=?",
            ).bind(new Date().toISOString(), id, version),
            env.DB.prepare(
              completed
                ? "INSERT OR IGNORE INTO RoutineCompletions VALUES(?,?)"
                : "DELETE FROM RoutineCompletions WHERE item_id=? AND day=?",
            ).bind(id, day),
            env.DB.prepare("DELETE FROM MutationGuards WHERE id=?").bind(guard),
          ]);
          return json({ ok: true });
        }
        data.completed = completed;
      } else Object.assign(data, itemInput.parse(b.item));
      const r = await env.DB.prepare(
        "UPDATE ScheduleItems SET data=?,version=version+1,updated_at=? WHERE id=? AND version=?",
      )
        .bind(JSON.stringify(data), new Date().toISOString(), id, version)
        .run();
      return r.meta.changes
        ? json({ ok: true })
        : fail("동시 변경이 발생했습니다.", 409);
    }
  }
  if (path === "/api/ai/analyze" && method === "POST") {
    if (!(await settings(env)).aiEnabled)
      return fail("설정에서 AI를 활성화하세요.");
    const { text } = z
      .object({ text: z.string().trim().min(1).max(3000) })
      .parse(await body(req));
    const items = await list(env);
    const candidates = items
      .filter(
        (i) =>
          text.includes(i.title) ||
          i.title.split(" ").some((w) => w.length > 1 && text.includes(w)),
      )
      .slice(0, 40);
    if (
      /(?:급한 것|우선순위|할 것).*?(?:알려|정리)|(?:급한 것부터 알려)/.test(
        text,
      ) &&
      !/추가|옮겨|삭제|완료/.test(text)
    )
      return json({
        id: null,
        actions: [],
        message:
          topThree(items)
            .map((x, i) => `${i + 1}. ${x.item.title} — ${x.reason}`)
            .join("\n") || "아직 등록한 할 일이 없어요.",
        candidates: [],
      });
    if (!(env.APP_ENV === "development" && env.AI_MODE === "mock")) {
      if (!env.GEMINI_API_KEY)
        return fail(
          "Gemini 연결이 필요합니다. 서버에 API 키를 설정하세요.",
          503,
        );
      const limit = await env.DB.prepare(
        "INSERT INTO AILimits(day,calls) VALUES(?,1) ON CONFLICT(day) DO UPDATE SET calls=calls+1 RETURNING calls",
      )
        .bind(seoulDay())
        .first<{ calls: number }>();
      if ((limit?.calls || 0) > 30)
        return fail(
          "앱의 일일 AI 안전 한도(30회)에 도달했습니다. 내일 다시 이용하세요.",
          429,
        );
    }
    const analysis = await analyze(env, text, candidates);
    analysis.actions = analysis.actions.map((action) => {
      const target = candidates.find((i) => i.id === action.targetId);
      const a =
        target && action.operation !== "create"
          ? resolveActionTarget(action, target)
          : { ...action, targetId: null };
      const past =
        (a.item.startAt && Date.parse(a.item.startAt) < Date.now()) ||
        (a.item.scheduledDate && a.item.scheduledDate < seoulDay()) ||
        (a.item.dueAt && Date.parse(a.item.dueAt) < Date.now());
      return {
        ...a,
        requiresConfirmation: true,
        warning:
          a.warning ||
          (past
            ? "과거 날짜가 포함되어 있어요. 확인하세요."
            : items.some(
                  (i) => i.id !== a.targetId && intervalsOverlap(a.item, i),
                )
              ? "기존 일정과 시간이 겹쳐요."
              : null),
      };
    });
    const id = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO AIActionDrafts(id,data,snapshot,expires_at) VALUES(?,?,?,?)",
    )
      .bind(
        id,
        JSON.stringify(analysis),
        JSON.stringify(items.map((i) => ({ id: i.id, version: i.version }))),
        Date.now() + 1800000,
      )
      .run();
    return json({ id, ...analysis, candidates });
  }
  if (path === "/api/ai/apply" && method === "POST") {
    const b = z
      .object({ id: z.string().uuid(), actions: analysisSchema.shape.actions })
      .parse(await body(req));
    const draft = await env.DB.prepare(
      "SELECT * FROM AIActionDrafts WHERE id=?",
    )
      .bind(b.id)
      .first<{
        data: string;
        snapshot: string;
        expires_at: number;
        applied: number;
      }>();
    if (!draft || draft.expires_at < Date.now())
      return fail("미리보기가 만료되었습니다. 다시 분석하세요.", 410);
    if (draft.applied) return json({ ok: true, alreadyApplied: true });
    const original = analysisSchema.parse(JSON.parse(draft.data));
    if (
      original.actions.length !== b.actions.length ||
      b.actions.some((a, i) => a.operation !== original.actions[i].operation)
    )
      return fail("분석 작업이 변경되었습니다.");
    const current = await list(env);
    const snapshot = JSON.parse(draft.snapshot) as {
      id: string;
      version: number;
    }[];
    const ids = new Set<string>();
    const now = new Date().toISOString();
    const statements: D1PreparedStatement[] = [];
    // A unique claim at the start makes duplicate concurrent applications roll back atomically.
    statements.push(
      env.DB.prepare("INSERT INTO RequestKeys VALUES(?,?)").bind(
        `draft:${b.id}`,
        now,
      ),
    );
    for (const submitted of b.actions) {
      let a = submitted;
      if (a.operation === "create") {
        statements.push(
          env.DB.prepare("INSERT INTO ScheduleItems VALUES(?,?,1,?,?)").bind(
            crypto.randomUUID(),
            JSON.stringify({ ...a.item, completed: false }),
            now,
            now,
          ),
        );
        continue;
      }
      const item = current.find((i) => i.id === a.targetId);
      if (!item || ids.has(item.id))
        return fail("변경할 대상을 하나씩 선택하세요.");
      ids.add(item.id);
      a = resolveActionTarget(a, item);
      const old = snapshot.find((i) => i.id === item.id);
      if (!old || old.version !== item.version)
        return fail("대상 항목이 변경되었습니다. 다시 분석하세요.", 409);
      statements.push(
        env.DB.prepare(
          "INSERT INTO RequestKeys(id,created_at) SELECT CASE WHEN EXISTS(SELECT 1 FROM ScheduleItems WHERE id=? AND version=?) THEN ? ELSE ? END, ?",
        ).bind(
          item.id,
          old.version,
          `guard:${b.id}:${item.id}`,
          `draft:${b.id}`,
          now,
        ),
      );
      if (a.operation === "delete")
        statements.push(
          env.DB.prepare("DELETE FROM ScheduleItems WHERE id=?").bind(item.id),
        );
      else if (a.operation === "complete" && item.type === "routine") {
        statements.push(
          env.DB.prepare(
            "UPDATE ScheduleItems SET version=version+1,updated_at=? WHERE id=?",
          ).bind(now, item.id),
        );
        statements.push(
          env.DB.prepare(
            "INSERT OR IGNORE INTO RoutineCompletions VALUES(?,?)",
          ).bind(item.id, seoulDay()),
        );
      } else
        statements.push(
          env.DB.prepare(
            "UPDATE ScheduleItems SET data=?,version=version+1,updated_at=? WHERE id=?",
          ).bind(
            JSON.stringify({
              ...(a.operation === "complete" ? item : a.item),
              completed: a.operation === "complete" ? true : item.completed,
            }),
            now,
            item.id,
          ),
        );
    }
    statements.push(
      env.DB.prepare("UPDATE AIActionDrafts SET applied=1 WHERE id=?").bind(
        b.id,
      ),
    );
    await env.DB.batch(statements);
    return json({ ok: true });
  }
  if (path === "/api/push/subscribe" && method === "POST") {
    const sub = z
      .object({
        endpoint: z.string().url().max(2048),
        keys: z.object({
          p256dh: z.string().max(200),
          auth: z.string().max(100),
        }),
      })
      .parse(await body(req));
    const host = new URL(sub.endpoint);
    if (
      host.protocol !== "https:" ||
      host.port ||
      (!["web.push.apple.com", "fcm.googleapis.com"].includes(host.hostname) &&
        !host.hostname.endsWith(".notify.windows.com") &&
        !host.hostname.endsWith(".push.services.mozilla.com"))
    )
      return fail("지원하지 않는 Push 서비스입니다.");
    await env.DB.prepare(
      "INSERT INTO PushSubscriptions VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
    )
      .bind(
        await digest(sub.endpoint),
        JSON.stringify(sub),
        new Date().toISOString(),
      )
      .run();
    return json({ ok: true });
  }
  if (path === "/api/push/subscribe" && method === "DELETE") {
    const b = z.object({ endpoint: z.string().url() }).parse(await body(req));
    await env.DB.prepare("DELETE FROM PushSubscriptions WHERE id=?")
      .bind(await digest(b.endpoint))
      .run();
    return json({ ok: true });
  }
  if (path === "/api/push/test" && method === "POST") {
    const subs = await env.DB.prepare(
      "SELECT data FROM PushSubscriptions",
    ).all<{ data: string }>();
    if (!subs.results.length) return fail("먼저 이 기기의 알림을 허용하세요.");
    for (const sub of subs.results) {
      const res = await sendPush(env, JSON.parse(sub.data), {
        title: "Dayflow",
        body: "테스트 알림입니다. 오늘도 가볍게 시작해요.",
        url: "/",
      });
      if (!res.ok) return fail("Push 서비스가 발송을 거절했습니다.", 502);
    }
    return json({ ok: true });
  }
  return fail("지원하지 않는 요청입니다.", 404);
}
export default {
  async fetch(req: Request, env: Env) {
    if (!new URL(req.url).pathname.startsWith("/api/")) {
      const res = await env.ASSETS.fetch(req);
      const h = new Headers(res.headers);
      h.set(
        "Content-Security-Policy",
        (env.APP_ENV === "development"
          ? "default-src 'self'; script-src 'self' 'unsafe-inline';"
          : "default-src 'self'; script-src 'self';") +
          " style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
      );
      h.set("Referrer-Policy", "no-referrer");
      h.set("X-Content-Type-Options", "nosniff");
      return new Response(res.body, { status: res.status, headers: h });
    }
    try {
      return await api(req, env);
    } catch (e) {
      if (e instanceof GeminiError)
        return json({ error: e.message, code: e.code }, e.status);
      if (e instanceof HttpError) return fail(e.message, e.status);
      if (e instanceof Error && /CHECK constraint/.test(e.message))
        return fail("항목이 변경되었습니다. 다시 불러오세요.", 409);
      if (e instanceof z.ZodError)
        return fail(e.issues[0]?.message || "입력을 확인하세요.");
      if (e instanceof Error && /UNIQUE constraint/.test(e.message))
        return fail("중복 요청입니다. 목록을 새로고침하세요.", 409);
      return fail(
        e instanceof Error && /Gemini|Mock|VAPID/.test(e.message)
          ? e.message
          : "요청을 처리하지 못했습니다. 잠시 후 다시 시도하세요.",
        503,
      );
    }
  },
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(notify(env, new Date(event.scheduledTime)));
  },
};
