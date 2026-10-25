import { test, expect } from "@playwright/test";

test("training buttons start each collision challenge, and the old hotseat link lands in training", async ({ page }) => {
  // 0.1 would roll a Magic charge; the pose race button must override it.
  await page.addInitScript(() => { sessionStorage.setItem("spellcaster:intro-seen", "1"); Math.random = () => 0.1; sessionStorage.setItem("spellcaster:gestures", "off"); });
  await page.goto("/practice?mode=hotseat");
  await expect(page.locator(".duel-mode")).toHaveText("TRAINING · YOU CONTROL BOTH WIZARDS");
  await expect(page.getByRole("button", { name: "Hotseat" })).toHaveCount(0);
  await expect(page.locator(".clock.active")).toBeVisible();

  await page.getByRole("button", { name: "Pose race" }).click();
  await expect(page.locator(".pose-race")).toBeVisible();

  await page.goto("/practice?mode=training");
  await expect(page.locator(".clock.active")).toBeVisible();
  await page.getByRole("button", { name: "Magic charge" }).click();
  await expect(page.getByRole("region", { name: "Charge your magic challenge" })).toBeVisible();
  await expect(page.locator(".pose-race")).toHaveCount(0);
});

test("the bot mode has no clash buttons", async ({ page }) => {
  await page.addInitScript(() => { sessionStorage.setItem("spellcaster:intro-seen", "1"); sessionStorage.setItem("spellcaster:gestures", "off"); });
  await page.goto("/practice");
  await expect(page.locator(".clock.active")).toBeVisible();
  await expect(page.getByRole("button", { name: "Magic charge" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Pose race" })).toHaveCount(0);
});
