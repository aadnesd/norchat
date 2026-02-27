import { expect, test, type Page } from "@playwright/test";
import { buildHelpPage, buildWidgetScript } from "../../api/src/ui-templates";

const apiBase = "http://localhost:4000";

const disableAnimations = async (page: Page) => {
  await page.addStyleTag({
    content: "* { transition: none !important; animation: none !important; }"
  });
};

const waitForFonts = async (page: Page) => {
  await page.evaluate(() => {
    if (!document.fonts) {
      return;
    }
    return Promise.race([
      document.fonts.ready,
      new Promise((resolve) => setTimeout(resolve, 2000))
    ]);
  });
};

const widgetChannelId = "channel-visual-widget";
const helpChannelId = "channel-visual-help";

test.describe("visual snapshots", () => {
  test("onboarding flow snapshot", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await waitForFonts(page);
    await disableAnimations(page);

    const onboarding = page.locator(".onboarding");
    await expect(onboarding).toHaveScreenshot("onboarding-flow.png");
  });

  test("widget embed snapshot", async ({ page }) => {
    await page.setContent(
      `<!doctype html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Widget Embed</title>
        </head>
        <body>
          <script data-channel="${widgetChannelId}" data-api-base="${apiBase}">${buildWidgetScript()}</script>
        </body>
      </html>`,
      { waitUntil: "domcontentloaded" }
    );

    await page.waitForSelector(`#ralph-widget-${widgetChannelId} .rw-button`);
    const widgetRoot = page.locator(`#ralph-widget-${widgetChannelId}`);
    await widgetRoot.locator(".rw-button").click();
    await expect(widgetRoot.locator(".rw-panel")).toBeVisible();
    await disableAnimations(page);

    await expect(widgetRoot).toHaveScreenshot("widget-open.png");
  });

  test("help page snapshot", async ({ page }) => {
    await page.setContent(buildHelpPage(helpChannelId), { waitUntil: "domcontentloaded" });
    await waitForFonts(page);
    await disableAnimations(page);

    await expect(page).toHaveScreenshot("help-page.png", { fullPage: true });
  });
});
