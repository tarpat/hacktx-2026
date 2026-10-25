import { test, expect } from "@playwright/test";

for (const mobile of [false, true]) {
  test(`bot match reveals both traits during the countdown and keeps them on the health bars (${mobile ? "mobile" : "desktop"})`, async ({ page }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    // 0.1 rolls Ironhide for both wizards, which shows up as 110 max health.
    await page.addInitScript(() => { Math.random = () => 0.1; sessionStorage.setItem("spellcaster:gestures", "off"); });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/practice");
    const cards = page.locator(".trait-card");
    await expect(cards).toHaveCount(2);
    await expect(cards.first().locator(".trait-who")).toHaveText("You rolled");
    await expect(cards.last().locator(".trait-who")).toHaveText("Rival rolled");
    await expect(cards.last()).toHaveClass(/landed/, { timeout: 3_000 });
    await expect(cards.first().locator(".trait-effect")).toHaveText("+10% max health");
    await page.screenshot({ path: `/tmp/spellcaster-traits-${mobile ? "mobile" : "desktop"}.png` });
    const roll = await page.locator(".trait-roll").boundingBox();
    const viewport = page.viewportSize()!;
    expect(roll!.x).toBeGreaterThanOrEqual(0);
    expect(roll!.x + roll!.width).toBeLessThanOrEqual(viewport.width);
    await expect(page.locator(".clock.active")).toBeVisible();
    await expect(cards).toHaveCount(0);
    await expect(page.locator(".health-trait")).toHaveCount(2);
    await expect(page.locator(".health-trait").first()).toHaveAttribute("title", "+10% max health");
    await expect(page.locator(".health-value")).toHaveText(["110", "110"]);
    expect(errors).toEqual([]);
  });
}

test("training starts without traits until you roll them", async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => 0.5; sessionStorage.setItem("spellcaster:gestures", "off"); });
  await page.goto("/practice?mode=training");
  await expect(page.locator(".clock.active")).toBeVisible();
  await expect(page.locator(".health-trait")).toHaveCount(0);
  await page.getByRole("button", { name: "Roll traits" }).click();
  await expect(page.locator(".clock.countdown")).toBeVisible();
  await expect(page.locator(".trait-card")).toHaveCount(2);
  await expect(page.locator(".trait-card.landed").last()).toContainText("Stormcaller", { timeout: 3_000 });
  await expect(page.locator(".trait-card .trait-who")).toHaveText(["Green Wizard rolled", "Purple Wizard rolled"]);
  await expect(page.locator(".clock.active")).toBeVisible();
  await expect(page.locator(".health-trait")).toHaveCount(2);
});
