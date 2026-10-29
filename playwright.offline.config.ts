import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/offline",
  use: {
    baseURL: "http://localhost:4173",
    viewport: { width: 390, height: 844 },
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      args: ["--no-sandbox"],
    },
  },
  webServer: {
    command: "npm run preview -- --port 4173",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
