import React from "react";
import { it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import App from "../src/App";
import { defaults } from "../shared/domain";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});
it("renders empty real state and switches all themes", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => ({
      ok: true,
      json: async () =>
        input.endsWith("/session")
          ? { authenticated: true }
          : {
              items: [],
              settings: defaults,
              aiMode: "mock",
              development: true,
              vapidPublicKey: null,
            },
    })),
  );
  render(<App />);
  await screen.findByText("좋은 하루의 시작");
  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
  for (const label of ["다크", "라이트", "시스템"]) {
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(screen.getByRole("button", { name: label })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  }
  expect(document.documentElement.dataset.theme).toBe("system");
});
it("restores optimistic completion after a failed server mutation", async () => {
  const { itemInput } = await import("../shared/domain");
  const item = {
    ...itemInput.parse({ type: "task", title: "복구 테스트" }),
    id: "rollback",
    version: 1,
    completed: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => ({
      ok: !input.includes("/complete"),
      status: input.includes("/complete") ? 503 : 200,
      json: async () =>
        input.endsWith("/session")
          ? { authenticated: true }
          : input.includes("/complete")
            ? { error: "저장 실패" }
            : {
                items: [item],
                settings: defaults,
                aiMode: "mock",
                development: true,
                vapidPublicKey: null,
              },
    })),
  );
  render(<App />);
  const check = await screen.findByRole("button", {
    name: "복구 테스트 완료",
  });
  fireEvent.click(check);
  await screen.findByRole("alert");
  expect(
    screen.getByRole("button", { name: "복구 테스트 완료" }),
  ).toBeEnabled();
  expect(
    screen.queryByRole("button", {
      name: "복구 테스트 완료 취소",
    }),
  ).toBeNull();
});
it("does not mark successful writes as failed when session storage is unavailable", async () => {
  const { writeCache } = await import("../src/storage");
  const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("quota");
  });
  expect(() => writeCache({ items: [] })).not.toThrow();
  spy.mockRestore();
});
it("keeps a confirmed completion when only the following refresh fails", async () => {
  const { itemInput } = await import("../shared/domain");
  const item = {
    ...itemInput.parse({ type: "task", title: "확정 완료 테스트" }),
    id: "committed",
    version: 1,
    completed: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  let reads = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      if (input.startsWith("/api/state") && ++reads > 1)
        throw new Error("network");
      return {
        ok: true,
        json: async () =>
          input.endsWith("/session")
            ? { authenticated: true }
            : input.includes("/complete")
              ? { ok: true }
              : {
                  items: [item],
                  settings: defaults,
                  aiMode: "mock",
                  development: true,
                  vapidPublicKey: null,
                },
      };
    }),
  );
  render(<App />);
  fireEvent.click(
    await screen.findByRole("button", { name: "확정 완료 테스트 완료" }),
  );
  await screen.findByRole("alert");
  expect(
    screen.getByRole("button", { name: "확정 완료 테스트 완료 취소" }),
  ).toBeEnabled();
});
