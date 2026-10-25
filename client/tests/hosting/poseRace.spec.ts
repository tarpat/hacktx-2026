import { test, expect } from "@playwright/test";

for (const winner of ["A", "B"] as const) {
  test(`five-pose race awards ${winner}, pauses combat, and fits a small screen`, async ({ page }) => {
    await page.addInitScript(() => {
      Math.random = () => 0.8; // Force the pose half of the collision draw in the local engine.
      sessionStorage.setItem("spellcaster:gestures", "off");
    });
    if (winner === "B") await page.setViewportSize({ width: 390, height: 844 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/practice?mode=hotseat");
    await expect(page.locator(".clock.active")).toBeVisible();
    await page.keyboard.press("q"); await page.keyboard.press("u");
    const race = page.getByRole("region", { name: "Pose race" });
    await expect(race).toBeVisible();
    await expect(race.locator(".pose-filmstrip li")).toHaveCount(5);
    await expect(race.locator(".pose-reference h3")).toHaveText("The thinker");
    await expect(page.locator(".clock-label")).toHaveText("PAUSED");
    const frozenClock = await page.locator(".clock-time").innerText();
    await page.keyboard.press("e");
    await expect(page.locator(".toast")).toContainText("Combat paused");
    await race.getByRole("checkbox", { name: "Keyboard practice assist" }).check();
    await expect(race.locator(".pose-clock")).toHaveText(/\d+\.\ds/, { timeout: 6_000 });
    await page.waitForTimeout(350);
    expect(await page.locator(".clock-time").innerText()).toBe(frozenClock);
    const key = winner === "A" ? "Space" : "Enter";
    const progress = race.locator(`.pose-score.player-${winner} b span`);
    for (let step = 0; step < 5; step++) {
      if (step === 4 && winner === "A") {
        await expect(race.locator(".pose-reference h3")).toHaveText("Cheeky grin");
        await expect(race.locator(".pose-reference p")).toContainText("one index or middle finger");
        await expect(race.locator(".pose-reference p")).toContainText("small smile");
      }
      await page.keyboard.down(key);
      if (step < 4) await expect(progress).toHaveText(`${step + 1}/5`);
      else await expect(race).toBeHidden();
      await page.keyboard.up(key);
      if (step < 4) await page.waitForTimeout(400);
    }
    await expect(page.locator(".clash-result")).toContainText(winner === "A" ? "Green Wizard wins!" : "Purple Wizard wins!");
    await expect(page.locator(".health-value").nth(winner === "A" ? 1 : 0)).toHaveText("60");
    expect(errors).toEqual([]);
  });
}

test("pose references load, camera-off guidance is usable, and no assist is enabled by default", async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => .8; sessionStorage.setItem("spellcaster:gestures", "off"); });
  await page.goto("/practice?mode=hotseat");
  await expect(page.locator(".clock.active")).toBeVisible();
  await page.keyboard.press("q"); await page.keyboard.press("u");
  await expect(page.locator(".pose-race")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Keyboard practice assist" })).not.toBeChecked();
  await expect(page.locator(".pose-feedback")).toContainText("Turn on the camera");
  expect(await page.locator(".pose-filmstrip img").evaluateAll((images) => images.every((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await page.screenshot({ path: "/tmp/spellcaster-pose-race.png" });
  const panel = await page.locator(".pose-race").boundingBox();
  const footer = await page.locator(".pose-race-footer").boundingBox();
  expect(footer!.y + footer!.height).toBeLessThanOrEqual(panel!.y + panel!.height);
  expect(await page.locator(".pose-race").evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
});
