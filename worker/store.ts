import { defaults, type Item, type Settings, seoulDay } from "../shared/domain";
import type { Env } from "./types";
export async function list(env: Env, day = seoulDay()): Promise<Item[]> {
  const [rows, completions] = await Promise.all([
    env.DB.prepare(
      "SELECT * FROM ScheduleItems ORDER BY created_at DESC LIMIT 2000",
    ).all<{
      id: string;
      data: string;
      version: number;
      created_at: string;
      updated_at: string;
    }>(),
    env.DB.prepare("SELECT item_id FROM RoutineCompletions WHERE day=?")
      .bind(day)
      .all<{ item_id: string }>(),
  ]);
  return rows.results.map((r) => {
    const data = JSON.parse(r.data);
    return {
      ...data,
      id: r.id,
      version: r.version,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      completed:
        data.type === "routine"
          ? completions.results.some((c) => c.item_id === r.id)
          : !!data.completed,
    };
  });
}
export async function settings(env: Env): Promise<Settings> {
  const row = await env.DB.prepare(
    "SELECT data FROM UserSettings WHERE id=1",
  ).first<{ data: string }>();
  return row ? { ...defaults, ...JSON.parse(row.data) } : defaults;
}
