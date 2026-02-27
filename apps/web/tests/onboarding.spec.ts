import { expect, test } from "@playwright/test";

test.describe("onboarding baseline", () => {
  test("renders onboarding flow and key sections", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByRole("heading", { name: "Launch a fully trained support agent in minutes." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "10-minute onboarding flow" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "What you get on day one" })).toBeVisible();
  });

  test("shows onboarding progress and controls", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByText("Step 1 of 4")).toBeVisible();
    await expect(page.getByRole("button", { name: "Back" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  test("shows live preview content for current step", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByRole("heading", { name: "Create your workspace" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Retention policy" })).toBeVisible();
  });
});
