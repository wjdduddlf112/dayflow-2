import { buildPushPayload } from "@block65/webcrypto-web-push";
import { occursOn, seoulDay } from "../shared/domain";
import { list, settings } from "./store";
import type { Env } from "./types";
export async function sendPush(
  env: Env,
  subscription: unknown,
  message: { title: string; body: string; url: string },
) {
  if (!env.VAPID_PRIVATE_KEY || !env.VAPID_PUBLIC_KEY || !env.VAPID_SUBJECT)
    throw new Error("VAPID 서버 설정이 필요합니다.");
  const payload = await buildPushPayload(
    { data: JSON.stringify(message), options: { ttl: 1800 } },
    subscription as Parameters<typeof buildPushPayload>[1],
    {
      subject: env.VAPID_SUBJECT,
      publicKey: env.VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY,
    },
  );
  return fetch((subscription as { endpoint: string }).endpoint, {
    ...payload,
    body: new Uint8Array(payload.body).buffer,
    signal: AbortSignal.timeout(10000),
  });
}
export async function cleanup(env: Env, now: Date) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM Sessions WHERE expires_at<?").bind(
      now.getTime(),
    ),
    env.DB.prepare("DELETE FROM AIActionDrafts WHERE expires_at<?").bind(
      now.getTime() - 86400000,
    ),
    env.DB.prepare("DELETE FROM LoginAttempts WHERE reset_at<?").bind(
      now.getTime(),
    ),
    env.DB.prepare("DELETE FROM NotificationLogs WHERE created_at<?").bind(
      new Date(now.getTime() - 30 * 86400000).toISOString(),
    ),
    env.DB.prepare("DELETE FROM RequestKeys WHERE created_at<?").bind(
      new Date(now.getTime() - 7 * 86400000).toISOString(),
    ),
    env.DB.prepare("DELETE FROM AILimits WHERE day<?").bind(
      seoulDay(new Date(now.getTime() - 90 * 86400000)),
    ),
  ]);
}
export async function notify(env: Env, scheduled = new Date()) {
  const now = new Date(Math.floor(scheduled.getTime() / 60000) * 60000);
  // Housekeeping must still run for accounts that never enable notifications.
  if (now.getUTCMinutes() === 0) await cleanup(env, now);
  const s = await settings(env);
  if (!s.notificationsEnabled) return;
  const day = seoulDay(now);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  const items = await list(env, day);
  const messages: { key: string; body: string }[] = [];
  if (time === "09:00")
    messages.push({
      key: `brief:${day}`,
      body: `오늘 일정 ${items.filter((i) => occursOn(i, day)).length}개 · 중요한 할 일 ${items.filter((i) => !i.completed && i.priority === "high").length}개 · 오늘 마감 ${items.filter((i) => !i.completed && i.dueAt && seoulDay(new Date(i.dueAt)) === day).length}개. 앱에서 우선순위를 확인하세요.`,
    });
  for (const i of items) {
    if (i.completed) continue;
    const delta = i.startAt
      ? (new Date(i.startAt).getTime() - now.getTime()) / 60000
      : Infinity;
    if (i.type === "event" && delta > 29 && delta <= 30)
      messages.push({
        key: `event:${i.id}:${i.startAt}`,
        body: "30분 뒤 일정이 있어요. 앱에서 확인하세요.",
      });
    if (
      s.routineNotifications &&
      i.type === "routine" &&
      occursOn(i, day) &&
      i.recurrence?.time === time
    )
      messages.push({
        key: `routine:${i.id}:${day}`,
        body: "루틴을 시작할 시간이에요.",
      });
  }
  const subs = await env.DB.prepare(
    "SELECT id,data FROM PushSubscriptions",
  ).all<{ id: string; data: string }>();
  for (const m of messages)
    for (const sub of subs.results) {
      const id = `${m.key}:${sub.id}`;
      const claimed = await env.DB.prepare(
        "INSERT OR IGNORE INTO NotificationLogs(id,subscription_id,status,created_at) VALUES(?,?,'pending',?)",
      )
        .bind(id, sub.id, now.toISOString())
        .run();
      if (!claimed.meta.changes) continue;
      try {
        const res = await sendPush(env, JSON.parse(sub.data), {
          title: "Dayflow",
          body: m.body,
          url: "/",
        });
        if (res.status === 404 || res.status === 410)
          await env.DB.prepare("DELETE FROM PushSubscriptions WHERE id=?")
            .bind(sub.id)
            .run();
        await env.DB.prepare("UPDATE NotificationLogs SET status=? WHERE id=?")
          .bind(res.ok ? "sent" : "failed", id)
          .run();
      } catch {
        await env.DB.prepare(
          "UPDATE NotificationLogs SET status='failed' WHERE id=?",
        )
          .bind(id)
          .run();
      }
    }
}
