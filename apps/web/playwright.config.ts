import { defineConfig, devices } from "@playwright/test";

const isCi = Boolean(process.env.CI);
const baseUrl = process.env.PLAYWRIGHT_BASE_URL || (isCi ? "http://127.0.0.1:4173" : "http://127.0.0.1:5173");

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: {
    timeout: 5_000
  },
  use: {
    baseURL: baseUrl,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  webServer: {
    command: isCi
      ? "npm run build && npm run preview -- --host 127.0.0.1 --strictPort --port 4173"
      : "npm run dev -- --host 127.0.0.1 --strictPort --port 5173",
    url: baseUrl,
    reuseExistingServer: !isCi,
    timeout: 120_000
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
