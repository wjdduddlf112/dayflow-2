import {
  analysisSchema,
  itemInput,
  resolveActionTarget,
  seoulDay,
  type Item,
  type Analysis,
} from "../shared/domain";
const weekday: Record<string, number> = {
  일: 0,
  월: 1,
  화: 2,
  수: 3,
  목: 4,
  금: 5,
  토: 6,
};
export function mockAnalyze(
  text: string,
  items: Item[],
  now = new Date(),
): Analysis {
  if (text.includes("[오류]"))
    throw new Error("Mock AI 장애를 재현했습니다. 잠시 후 다시 시도하세요.");
  const parts = text
    .split(/하고|그리고|해야 해[.!]?|하자[.!]?|[\n;,]|[.!](?:\s|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
  const actions = parts.map((part): Analysis["actions"][number] => {
    const operation = /삭제|취소된/.test(part)
      ? "delete"
      : /완료/.test(part)
        ? "complete"
        : /옮겨|미뤄|변경/.test(part)
          ? "update"
          : "create";
    const candidates = items.filter(
      (i) =>
        part.includes(i.title) ||
        i.title.split(" ").some((w) => w.length > 1 && part.includes(w)),
    );
    const target = candidates.length === 1 ? candidates[0] : null;
    const changedFields: Analysis["actions"][number]["changedFields"] = [];
    const today = seoulDay(now);
    const d = new Date(today + "T12:00:00Z");
    let known = false;
    if (/모레/.test(part)) {
      d.setUTCDate(d.getUTCDate() + 2);
      known = true;
    } else if (/내일/.test(part)) {
      d.setUTCDate(d.getUTCDate() + 1);
      known = true;
    } else if (/오늘/.test(part)) {
      known = true;
    } else if (/어제/.test(part)) {
      d.setUTCDate(d.getUTCDate() - 1);
      known = true;
    }
    // For a move, the final weekday is the destination (토요일 약속을 일요일로).
    const weekdays = [...part.matchAll(/([일월화수목금토])요일/g)];
    const w = weekdays.at(-1);
    if (w && !/매주/.test(part)) {
      let delta = (weekday[w[1]] - d.getUTCDay() + 7) % 7;
      if (/다음\s*주/.test(part))
        delta = ((8 - d.getUTCDay()) % 7) + ((weekday[w[1]] + 6) % 7);
      d.setUTCDate(d.getUTCDate() + delta);
      known = true;
    }
    const explicit = part.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (explicit) {
      d.setTime(Date.parse(explicit[0] + "T12:00:00Z"));
      known = true;
    }
    const day = known ? seoulDay(d) : null;
    const h = part.match(/(오전|오후)?\s*(\d{1,2})시(?:\s*(\d{1,2})분)?/);
    const duration = part.match(/(\d+)\s*시간/);
    const minutes = part.match(/(\d+)분(?:\s*(?:동안|공부|운동|작업))/);
    const daily = /매일/.test(part),
      weekly = /매주/.test(part),
      routine = daily || weekly,
      due = /까지|마감/.test(part);
    let startAt: string | null = null;
    const ambiguousTime =
      !!h && !h[1] && Number(h[2]) > 0 && Number(h[2]) <= 12;
    let alarmTime: string | null = null;
    if (h) {
      let hour = Number(h[2]);
      if (h[1] === "오후" && hour < 12) hour += 12;
      if (h[1] === "오전" && hour === 12) hour = 0;
      alarmTime = `${String(hour).padStart(2, "0")}:${String(h[3] || "00").padStart(2, "0")}`;
    }
    if (h && day && !ambiguousTime) {
      let hour = Number(h[2]);
      if (h[1] === "오후" && hour < 12) hour += 12;
      if (h[1] === "오전" && hour === 12) hour = 0;
      startAt = `${day}T${String(hour).padStart(2, "0")}:${String(h[3] || "00").padStart(2, "0")}:00+09:00`;
    }
    const title =
      part
        .replace(
          /\d{4}-\d{2}-\d{2}|모레|내일|오늘|어제|이번\s*주|다음\s*주|매일|매주\s*[월화수목금토일]+|매주|[일월화수목금토]요일|오전|오후|\d+시(?:\s*\d+분)?(?:에)?|\d+\s*시간|두 시간|까지|추가해|하도록 해|해야 해|하자|해 줘|완료 처리해|삭제해/g,
          "",
        )
        .trim()
        .replace(/(은|는|을|를)$/, "")
        .trim() || "새 할 일";
    const item = itemInput.parse({
      type: routine ? "routine" : h ? "event" : "task",
      title,
      scheduledDate:
        day && (!h || ambiguousTime) && !due && !routine ? day : null,
      startAt,
      dueAt: due && day ? `${day}T23:59:00+09:00` : null,
      estimatedMinutes: duration
        ? Number(duration[1]) * 60
        : /두 시간/.test(part)
          ? 120
          : minutes
            ? Number(minutes[1])
            : null,
      priority: /지원서|면접|마감/.test(part) ? "high" : "medium",
      recurrence: routine
        ? {
            frequency: daily ? "daily" : "weekly",
            weekdays: weekly
              ? [
                  ...new Set(
                    (part.match(/매주\s*([월화수목금토일]+)/)?.[1] || "")
                      .split("")
                      .map((w) => weekday[w]),
                  ),
                ]
              : [],
            time: ambiguousTime ? null : alarmTime,
          }
        : null,
    });
    if (operation === "update") {
      if (known) {
        changedFields.push(due ? "dueAt" : h ? "startAt" : "scheduledDate");
        if (!due && target?.startAt && !h) {
          item.startAt = day + target.startAt.slice(10);
          item.scheduledDate = null;
          changedFields.splice(0, 1, "startAt");
          if (target.endAt) {
            item.endAt = new Date(
              Date.parse(item.startAt) +
                Date.parse(target.endAt) -
                Date.parse(target.startAt),
            ).toISOString();
            changedFields.push("endAt");
          }
        }
      }
      if (duration || minutes || /두 시간/.test(part))
        changedFields.push("estimatedMinutes");
    }
    const action: Analysis["actions"][number] = {
      operation,
      targetId: target?.id || null,
      changedFields,
      item,
      confidence: 0.7,
      requiresConfirmation: true,
      warning: ambiguousTime
        ? "오전인지 오후인지 확인해 주세요."
        : operation !== "create" && !target
          ? "변경할 기존 항목을 선택해 주세요."
          : !known && !routine && operation === "create"
            ? "날짜가 미확정입니다. 필요하면 지정하세요."
            : null,
    };
    return target && operation !== "create"
      ? resolveActionTarget(action, target)
      : action;
  });
  return analysisSchema.parse({
    actions,
    message:
      "개발용 Mock 분석입니다. 복잡한 문장 해석은 실제 Gemini 연결 후 확인하세요.",
  });
}
