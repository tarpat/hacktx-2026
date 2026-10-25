import { test, expect } from "@playwright/test";

test("arena keeps embers and draws a camera clash when neither player traces", async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0.1;
    sessionStorage.setItem("spellcaster:intro-seen", "1");
    sessionStorage.setItem("spellcaster:gestures", "off");
  });
  await page.goto("/practice?mode=training");
  await expect(page.locator(".duel-stage .rising-embers i")).toHaveCount(24);
  await expect(page.locator(".clock.active")).toBeVisible();
  await page.getByRole("button", { name: "Magic charge", exact:false }).click();
  await expect(page.locator(".struggle-leader")).toHaveText("Dead even!");
  await page.keyboard.press("Space"); await page.keyboard.press("Enter");
  await expect(page.locator(".clash-result")).toContainText("Evenly matched!", { timeout: 10_000 });
  await expect(page.locator(".clash-result")).toContainText("Both spells cancel out.");
});
