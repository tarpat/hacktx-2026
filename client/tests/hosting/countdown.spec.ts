import { test, expect } from "@playwright/test";

for (const viewport of [
  { width: 1920, height: 1000, name: "desktop" },
  { width: 390, height: 844, name: "mobile" },
  { width: 844, height: 390, name: "short-landscape" },
]) {
  test(`get-ready clock stays inside its frame on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => sessionStorage.setItem("spellcaster:gestures", "off"));
    // Hold the opening countdown while checking layout, then verify it completes.
    await page.clock.install({ time: new Date("2026-10-25T08:00:00Z") });
    await page.clock.pauseAt(new Date("2026-10-25T08:00:01Z"));
    await page.goto("/practice?mode=training");
    await page.clock.runFor(100);
    const clock = page.locator(".clock.countdown");
    await expect(clock.locator(".clock-label")).toHaveText("GET READY");
    await expect(clock.locator(".clock-time")).toHaveText("10:00");
    await expect(page.locator(".match-countdown > span")).toHaveText("3");
    const layout = await clock.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const label = element.querySelector(".clock-label")!;
      const range = document.createRange();
      range.selectNodeContents(label);
      const text = range.getBoundingClientRect();
      return {
        x: box.x, y: box.y, right: box.right, bottom: box.bottom,
        width: box.width, height: box.height,
        textX: text.x, textY: text.y, textRight: text.right, textBottom: text.bottom,
      };
    });
    expect(layout.width).toBeLessThanOrEqual(180);
    expect(layout.height).toBeLessThanOrEqual(170);
    expect(layout.x).toBeGreaterThanOrEqual(0);
    expect(layout.y).toBeGreaterThanOrEqual(0);
    expect(layout.right).toBeLessThanOrEqual(viewport.width);
    expect(layout.bottom).toBeLessThanOrEqual(viewport.height);
    expect(layout.textX).toBeGreaterThanOrEqual(layout.x);
    expect(layout.textY).toBeGreaterThanOrEqual(layout.y);
    expect(layout.textRight).toBeLessThanOrEqual(layout.right);
    expect(layout.textBottom).toBeLessThanOrEqual(layout.bottom);
    await page.screenshot({ path: `/tmp/spellcaster-countdown-${viewport.name}.png` });
    await page.clock.runFor(3100);
    await expect(page.locator(".match-countdown")).toBeHidden();
    await expect(page.locator(".clock.active .clock-label")).toHaveText("ROUND");
  });
}
