import { expect, test } from "@playwright/test";

test.describe("onboarding baseline", () => {
  test("renders onboarding flow and key sections", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Launch a fully trained support agent in minutes." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "10-minute onboarding flow" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "What you get on day one" })).toBeVisible();
  });

  test("navigates between steps", async ({ page }) => {
    await page.goto("/");

    const stepIndicator = page.getByText("Step 1 of 4");
    await expect(stepIndicator).toBeVisible();

    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Step 2 of 4")).toBeVisible();

    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByText("Step 1 of 4")).toBeVisible();
  });

  test("shows live preview content for current step", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Create your workspace" })).toBeVisible();
    await page.getByRole("button", { name: "Name your support agent" }).click();
    await expect(page.getByRole("heading", { name: "Name your support agent" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Escalation rules" })).toBeVisible();
  });
});
