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
