import { z } from "zod";
export const seoulDay = (date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
export const daySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((day) => {
    const d = new Date(day + "T00:00:00Z");
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === day;
  }, "올바른 날짜를 입력하세요.");
export const editableFields = [
  "type",
  "title",
  "description",
  "scheduledDate",
  "startAt",
  "endAt",
  "dueAt",
  "estimatedMinutes",
  "priority",
  "recurrence",
] as const;
export const recurrenceSchema = z.object({
  frequency: z.enum(["daily", "weekly"]),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7),
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable(),
});
const date = z.string().datetime({ offset: true }).nullable();
export const itemInput = z
  .object({
    type: z.enum(["event", "task", "routine"]),
    title: z.string().trim().min(1).max(120),
    description: z.string().max(2000).default(""),
    scheduledDate: daySchema.nullable().default(null),
    startAt: date.default(null),
    endAt: date.default(null),
    dueAt: date.default(null),
    estimatedMinutes: z
      .number()
      .int()
      .min(1)
      .max(10080)
      .nullable()
      .default(null),
    priority: z.enum(["low", "medium", "high"]).default("medium"),
    recurrence: recurrenceSchema.nullable().default(null),
  })
  .superRefine((i, ctx) => {
    if (i.endAt && (!i.startAt || Date.parse(i.endAt) <= Date.parse(i.startAt)))
      ctx.addIssue({
        code: "custom",
        message: "종료시간은 시작시간 이후여야 합니다.",
      });
    if (i.recurrence?.frequency === "weekly" && !i.recurrence.weekdays.length)
      ctx.addIssue({
        code: "custom",
        message: "반복할 요일을 하나 이상 선택하세요.",
      });
    if (
      i.scheduledDate &&
      i.startAt &&
      i.scheduledDate !== seoulDay(new Date(i.startAt))
    )
      ctx.addIssue({
        code: "custom",
        message: "날짜와 시작시간의 날짜가 서로 다릅니다.",
      });
    if (i.type === "routine" && !i.recurrence)
      ctx.addIssue({ code: "custom", message: "루틴 반복 규칙이 필요합니다." });
    if (i.type !== "routine" && i.recurrence)
      ctx.addIssue({
        code: "custom",
        message: "반복 항목은 루틴으로 저장하세요.",
      });
  });
export type ItemInput = z.infer<typeof itemInput>;
export type Item = ItemInput & {
  id: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
};
export const actionSchema = z.object({
  operation: z.enum(["create", "update", "delete", "complete"]),
  targetId: z.string().nullable(),
  changedFields: z.array(z.enum(editableFields)).max(10).default([]),
  item: itemInput,
  confidence: z.number().min(0).max(1),
  requiresConfirmation: z.boolean(),
  warning: z.string().max(500).nullable(),
});
export const analysisSchema = z.object({
  actions: z.array(actionSchema).max(20),
  message: z.string().max(2000),
});
export type Analysis = z.infer<typeof analysisSchema>;
export function resolveActionTarget(
  action: Analysis["actions"][number],
  target: Item,
) {
  if (action.operation !== "update")
    return { ...action, targetId: target.id, item: itemInput.parse(target) };
  const patch = Object.fromEntries(
    action.changedFields.map((key) => [key, action.item[key]]),
  ) as Partial<ItemInput>;
  let changedFields = [...action.changedFields];
  if (
    patch.scheduledDate &&
    target.startAt &&
    !changedFields.includes("startAt")
  ) {
    const clock = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Seoul",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date(target.startAt));
    patch.startAt = `${patch.scheduledDate}T${clock}+09:00`;
    patch.scheduledDate = null;
    changedFields = [...changedFields, "startAt"];
  }
  if (
    patch.startAt &&
    target.startAt &&
    target.endAt &&
    !changedFields.includes("endAt")
  ) {
    patch.endAt = new Date(
      Date.parse(patch.startAt) +
        Date.parse(target.endAt) -
        Date.parse(target.startAt),
    ).toISOString();
    changedFields.push("endAt");
  }
  const item = itemInput.parse({ ...target, ...patch });
  return { ...action, targetId: target.id, changedFields, item };
}
export const intervalsOverlap = (a: ItemInput, b: ItemInput) =>
  !!(
    a.startAt &&
    b.startAt &&
    a.endAt &&
    b.endAt &&
    Date.parse(a.startAt) < Date.parse(b.endAt) &&
    Date.parse(a.endAt) > Date.parse(b.startAt)
  );
export type Settings = {
  aiEnabled: boolean;
  notificationsEnabled: boolean;
  routineNotifications: boolean;
  timezone: "Asia/Seoul";
};
export const settingsSchema = z.object({
  aiEnabled: z.boolean(),
  notificationsEnabled: z.boolean(),
  routineNotifications: z.boolean(),
  timezone: z.literal("Asia/Seoul"),
});
export const defaults: Settings = {
  aiEnabled: true,
  notificationsEnabled: false,
  routineNotifications: false,
  timezone: "Asia/Seoul",
};
export function occursOn(item: Item, day: string): boolean {
  if (item.type === "routine") {
    if (item.scheduledDate && item.scheduledDate > day) return false;
    if (item.startAt && seoulDay(new Date(item.startAt)) > day) return false;
    return (
      !!item.recurrence &&
      (item.recurrence.frequency === "daily" ||
        item.recurrence.weekdays.includes(
          new Date(day + "T12:00:00Z").getUTCDay(),
        ))
    );
  }
  return (
    item.scheduledDate === day ||
    [item.startAt, item.dueAt].some((d) => d && seoulDay(new Date(d)) === day)
  );
}
export function topThree(items: Item[], now = new Date()) {
  return items
    .filter(
      (i) =>
        !i.completed &&
        (i.type === "routine"
          ? occursOn(i, seoulDay(now))
          : (!i.scheduledDate || i.scheduledDate <= seoulDay(now)) &&
            (!i.startAt || seoulDay(new Date(i.startAt)) <= seoulDay(now))),
    )
    .map((item) => {
      const remaining = item.dueAt
        ? (new Date(item.dueAt).getTime() - now.getTime()) / 3600000
        : Infinity;
      const conflict = items.some(
        (other) =>
          other.id !== item.id &&
          !other.completed &&
          intervalsOverlap(item, other),
      );
      const age =
        (now.getTime() - new Date(item.createdAt).getTime()) / 86400000;
      const score =
        (remaining < 0
          ? 1000
          : remaining < 24
            ? 500
            : remaining < 72
              ? 200
              : 0) +
        { high: 100, medium: 40, low: 0 }[item.priority] +
        (conflict ? 30 : 0) +
        Math.min(Math.max(age, 0), 30) +
        (item.estimatedMinutes && item.estimatedMinutes <= 30 ? 15 : 0);
      const reason =
        remaining < 0
          ? "마감이 지났어요. 먼저 마무리해요."
          : remaining < 24
            ? "마감이 하루 이내로 다가왔어요."
            : conflict
              ? "다른 일정과 시간이 겹쳐요."
              : item.priority === "high"
                ? "중요하게 표시한 일이에요."
                : item.estimatedMinutes && item.estimatedMinutes <= 30
                  ? "짧은 시간에 완료할 수 있어요."
                  : age > 7
                    ? "오랫동안 남아 있는 일이에요."
                    : "차근차근 진행해 보세요.";
      return { item, score, reason };
    })
    .sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id))
    .slice(0, 3);
}
