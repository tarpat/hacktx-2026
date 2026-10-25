import { test, expect } from "@playwright/test";

test("training and bot duels use the shared backdrop without a layout picker", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("spellcaster.map", "high-plateau");
    sessionStorage.setItem("spellcaster:gestures", "off");
    sessionStorage.setItem("spellcaster:intro-seen", "1");
  });
  await page.goto("/practice?mode=training");
  await expect(page.locator(".clock.active")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".map-picker")).toHaveCount(0);
  await page.getByRole("button", { name: "Vs easy bot" }).click();
  await expect(page.locator(".duel-mode")).toHaveText("PRACTICE");
  await expect(page.locator(".map-picker")).toHaveCount(0);
  await page.getByRole("button", { name: "Training", exact: false }).click();
  await expect(page.locator(".duel-mode")).toHaveText("TRAINING · YOU CONTROL BOTH WIZARDS");
  await expect(page.locator(".map-picker")).toHaveCount(0);
});
