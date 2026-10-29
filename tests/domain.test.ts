import { describe, it, expect } from "vitest";
import {
  itemInput,
  occursOn,
  seoulDay,
  topThree,
  type Item,
} from "../shared/domain";
import { mockAnalyze } from "../worker/ai";
const now = new Date("2026-10-29T16:00:00Z");
const item = (overrides: Partial<Item> = {}): Item => ({
  ...itemInput.parse({ type: "task", title: "공부" }),
  id: "a",
  version: 1,
  completed: false,
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
  ...overrides,
});
describe("Seoul dates and parsing", () => {
  it("uses Seoul day across UTC midnight", () =>
    expect(seoulDay(now)).toBe("2026-10-30"));
  it("extracts multiple tasks, duration, deadline and routine separately", () => {
    const a = mockAnalyze(
      "내일 GSAT 두 시간 공부하고 금요일까지 지원서 마무리해야 해. 운동은 매일 하자.",
      [],
      now,
    );
    expect(a.actions).toHaveLength(3);
    expect(a.actions[0].item.estimatedMinutes).toBe(120);
    expect(a.actions[0].item.scheduledDate).toBe("2026-10-31");
    expect(a.actions[0].item.startAt).toBeNull();
    expect(a.actions[1].item.dueAt).toBe("2026-10-30T23:59:00+09:00");
    expect(a.actions[1].item.startAt).toBeNull();
    expect(a.actions[2].item.type).toBe("routine");
    expect(a.actions[0].item.title).not.toContain("내일");
  });
  it("does not invent a date for ambiguity", () => {
    const a = mockAnalyze("언젠가 독서", [], now).actions[0];
    expect(a.item.startAt).toBeNull();
    expect(a.warning).toBeTruthy();
  });
  it("distinguishes start time from duration", () =>
    expect(
      mockAnalyze("내일 오후 3시에 면접 일정 추가해", [], now).actions[0].item
        .startAt,
    ).toContain("T15:00"));
  it("resolves unique modification targets", () => {
    const a = mockAnalyze("공부 완료 처리해", [item()], now).actions[0];
    expect(a.operation).toBe("complete");
    expect(a.targetId).toBe("a");
  });
  it("requires selection on ambiguous targets", () =>
    expect(
      mockAnalyze("공부 삭제해", [item(), item({ id: "b" })], now).actions[0]
        .targetId,
    ).toBeNull());
  it("reports mock failures", () =>
    expect(() => mockAnalyze("[오류]", [], now)).toThrow("Mock"));
  it("creates weekly routine", () =>
    expect(
      mockAnalyze("매주 월수금 운동하도록 해", [], now).actions[0].item
        .recurrence?.frequency,
    ).toBe("weekly"));
});
describe("items and priority", () => {
  it("rejects invalid date range", () =>
    expect(
      itemInput.safeParse({
        type: "event",
        title: "면접",
        startAt: "2026-10-30T15:00:00+09:00",
        endAt: "2026-10-30T14:00:00+09:00",
      }).success,
    ).toBe(false));
  it("requires recurrence for routines", () =>
    expect(
      itemInput.safeParse({ type: "routine", title: "운동" }).success,
    ).toBe(false));
  it("occurs on configured weekdays", () => {
    const i = item({
      type: "routine",
      recurrence: { frequency: "weekly", weekdays: [1, 3, 5], time: "18:00" },
    });
    expect(occursOn(i, "2026-10-30")).toBe(true);
    expect(occursOn(i, "2026-10-31")).toBe(false);
  });
  it("ranks overdue above important and excludes completed", () => {
    const r = topThree(
      [
        item({ id: "important", priority: "high" }),
        item({ id: "overdue", dueAt: "2026-10-28T23:59:00+09:00" }),
        item({ id: "done", completed: true }),
      ],
      now,
    );
    expect(r.map((x) => x.item.id)).toEqual(["overdue", "important"]);
    expect(r[0].reason).toContain("마감");
  });
});
