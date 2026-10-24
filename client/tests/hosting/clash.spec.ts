import { test, expect } from "@playwright/test";

test("arena shows embers and announces both clash winners and draws", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new Error("Camera disabled for test"); };
  });
  await page.goto("/practice?mode=hotseat");
  await expect(page.locator(".duel-stage .rising-embers i")).toHaveCount(24);
  await expect(page.locator(".clock.active")).toBeVisible();

  const clash = async () => {
    await page.keyboard.press("q");
    await page.keyboard.press("u");
    await expect(page.locator(".struggle")).toBeVisible();
  };
  await clash();
  await expect(page.locator(".struggle-leader")).toHaveText("Dead even!");
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Space");
    await page.waitForTimeout(140);
  }
  await expect(page.locator(".clash-result")).toContainText("Green Wizard wins!");
  await expect(page.locator(".clash-result")).toHaveClass(/player-A/);
  await expect(page.locator(".clash-result")).toBeHidden({ timeout: 5_000 });

  await clash();
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Enter");
    await page.waitForTimeout(140);
  }
  await expect(page.locator(".clash-result")).toContainText("Purple Wizard wins!");
  await expect(page.locator(".clash-result")).toHaveClass(/player-B/);
  await expect(page.locator(".clash-result")).toBeHidden({ timeout: 5_000 });

  await clash();
  await expect(page.locator(".clash-result")).toContainText("Evenly matched!", { timeout: 10_000 });
  await expect(page.locator(".clash-result")).toContainText("Both spells cancel out.");
});
