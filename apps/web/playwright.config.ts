import { defineConfig, devices } from "@playwright/test";

const apiPort = 4190;
const apiBaseUrl = `http://127.0.0.1:${apiPort}`;

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: {
    timeout: 5_000
  },
  webServer: [
    {
      command: `PORT=${apiPort} npm --prefix ../api run dev`,
      url: `${apiBaseUrl}/health`,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI
    },
    {
      command: `VITE_API_BASE_URL=${apiBaseUrl} VITE_API_USER_ID=user_admin npm run dev -- --host 127.0.0.1 --port 4173 --strictPort`,
      url: "http://127.0.0.1:4173",
      timeout: 120_000,
      reuseExistingServer: !process.env.CI
    }
  ],
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
