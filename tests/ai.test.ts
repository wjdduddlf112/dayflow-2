// @vitest-environment node
import { it, expect, vi, afterEach } from "vitest";
import { analyze } from "../worker/ai";
import { mockAnalyze } from "../worker/mock";
import { itemInput, resolveActionTarget, type Item } from "../shared/domain";
import type { Env } from "../worker/types";
const env = {
  APP_ENV: "production",
  AI_MODE: "gemini",
  GEMINI_API_KEY: "fixture-not-a-real-key",
  GEMINI_MODEL: "gemini-2.5-flash-lite",
} as Env;
const now = new Date("2026-10-29T16:00:00Z");
const original: Item = {
  ...itemInput.parse({
    type: "event",
    title: "면접",
    description: "전송하면 안 되는 개인 메모",
    priority: "high",
    estimatedMinutes: 90,
    startAt: "2026-10-31T15:00:00+09:00",
    endAt: "2026-10-31T16:30:00+09:00",
  }),
  id: "one",
  version: 1,
  completed: false,
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("uses server key header, configurable model, structured schema and excludes private notes", async () => {
  const result = mockAnalyze("내일 공부", [], now);
  const fetcher = vi.fn(async () =>
    Response.json({
      candidates: [
        {
          finishReason: "STOP",
          content: { parts: [{ text: JSON.stringify(result) }] },
        },
      ],
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  expect((await analyze(env, "내일 공부", [original])).actions).toHaveLength(1);
  const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toContain("gemini-2.5-flash-lite");
  expect(url).not.toContain(env.GEMINI_API_KEY);
  expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe(
    env.GEMINI_API_KEY,
  );
  const body = JSON.parse(init.body as string);
  expect(
    body.generationConfig.responseJsonSchema.properties.actions.items.properties
      .changedFields,
  ).toBeTruthy();
  expect(init.body).not.toContain(original.description);
  expect(init.body).toContain("Asia/Seoul");
});
it.each([
  [429, 429, "AI_QUOTA"],
  [400, 502, "AI_PROVIDER"],
  [404, 502, "AI_PROVIDER"],
  [500, 503, "AI_PROVIDER"],
])(
  "handles Gemini HTTP %s without leaking provider body",
  async (status, expected, code) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("provider-private-detail", { status })),
    );
    await expect(analyze(env, "문장", [])).rejects.toMatchObject({
      status: expected,
      code,
    });
  },
);
it("handles network errors without echoing secrets", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error(env.GEMINI_API_KEY);
    }),
  );
  await expect(analyze(env, "문장", [])).rejects.toMatchObject({
    code: "AI_NETWORK",
    status: 503,
  });
});
it("times out provider without saving", async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal!.addEventListener("abort", () =>
            reject(new Error("aborted")),
          );
        }),
    ),
  );
  const promise = analyze(env, "문장", []);
  const check = expect(promise).rejects.toMatchObject({
    code: "AI_TIMEOUT",
    status: 504,
  });
  await vi.advanceTimersByTimeAsync(20001);
  await check;
});
it.each(["not json", '{"actions":[{"title":"bad"}]}'])(
  "rejects malformed structured output",
  async (text) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ candidates: [{ content: { parts: [{ text }] } }] }),
      ),
    );
    await expect(analyze(env, "문장", [])).rejects.toMatchObject({
      code: "AI_INVALID_RESPONSE",
    });
  },
);
it("handles truncated provider response", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ candidates: [{ finishReason: "MAX_TOKENS" }] }),
    ),
  );
  await expect(analyze(env, "문장", [])).rejects.toMatchObject({
    code: "AI_INCOMPLETE",
  });
});
it("moves event preserving title, priority, duration, notes and time of day", () => {
  const a = mockAnalyze("토요일 면접을 일요일로 옮겨 줘", [original], now)
    .actions[0];
  expect(a.operation).toBe("update");
  expect(a.item.startAt).toBe("2026-11-01T15:00:00+09:00");
  expect(Date.parse(a.item.endAt!) - Date.parse(a.item.startAt!)).toBe(
    90 * 60000,
  );
  expect(a.item.priority).toBe("high");
  expect(a.item.description).toBe(original.description);
  expect(a.changedFields).toEqual(["startAt", "endAt"]);
});
it("retargets an ambiguous update without replacing unrelated fields", () => {
  const a = mockAnalyze(
    "내일 면접을 옮겨 줘",
    [original, { ...original, id: "two" }],
    now,
  ).actions[0];
  expect(a.targetId).toBeNull();
  const resolved = resolveActionTarget(a, original);
  expect(resolved.item.title).toBe("면접");
  expect(resolved.item.description).toBe(original.description);
  expect(resolved.item.priority).toBe("high");
});
it.each([
  ["모레 독서", "2026-11-01"],
  ["다음 주 월요일 독서", "2026-11-02"],
  ["2026-12-01 독서", "2026-12-01"],
])("parses %s as %s", (text, day) =>
  expect(mockAnalyze(text, [], now).actions[0].item.scheduledDate).toBe(day),
);
it("supports explicit weekly weekdays and preserves completed/deleted records", () => {
  expect(
    mockAnalyze("매주 월수금 운동하도록 해", [], now).actions[0].item.recurrence
      ?.weekdays,
  ).toEqual([1, 3, 5]);
  for (const operation of ["완료 처리해", "삭제해"]) {
    const a = mockAnalyze("면접 " + operation, [original], now).actions[0];
    expect(a.item).toEqual(itemInput.parse(original));
  }
});
it("does not invent AM/PM for ambiguous time", () => {
  const a = mockAnalyze("내일 3시에 독서", [], now).actions[0];
  expect(a.item.startAt).toBeNull();
  expect(a.item.scheduledDate).toBe("2026-10-31");
  expect(a.warning).toContain("오전");
});
it("extracts routine reminder time without requiring a start date", () =>
  expect(
    mockAnalyze("매일 오후 6시에 운동", [], now).actions[0].item.recurrence
      ?.time,
  ).toBe("18:00"));
it("matches official Interactions schema and reads only final model output, with provider storage disabled", async () => {
  const result = mockAnalyze("내일 독서", [], now);
  const fetcher = vi.fn(async () =>
    Response.json({
      status: "completed",
      steps: [
        {
          type: "thought",
          content: [{ type: "text", text: "not application output" }],
        },
        {
          type: "model_output",
          content: [{ type: "text", text: JSON.stringify(result) }],
        },
      ],
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  expect(
    (
      await analyze(
        {
          ...env,
          GEMINI_MODEL: "gemini-3.5-flash-lite",
          GEMINI_API_STYLE: "interactions",
        },
        "내일 독서",
        [original],
      )
    ).actions,
  ).toHaveLength(1);
  const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe(
    "https://generativelanguage.googleapis.com/v1beta/interactions",
  );
  const request = JSON.parse(init.body as string);
  expect(request).toMatchObject({
    model: "gemini-3.5-flash-lite",
    store: false,
    stream: false,
    response_format: { type: "text", mime_type: "application/json" },
  });
  expect(request.response_format.schema.properties.actions).toBeTruthy();
  expect(init.body).not.toContain(original.description);
});
it("rejects incomplete Interactions and invalid response envelopes", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ status: "incomplete", steps: [] })),
  );
  await expect(
    analyze({ ...env, GEMINI_API_STYLE: "interactions" }, "문장", []),
  ).rejects.toMatchObject({ code: "AI_INCOMPLETE" });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("broken-json")),
  );
  await expect(analyze(env, "문장", [])).rejects.toMatchObject({
    code: "AI_INVALID_RESPONSE",
  });
});
