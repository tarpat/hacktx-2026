import { test, expect } from "@playwright/test";

for (const mobile of [false, true]) {
  test(`Magic charge challenge supports camera-off taps and fits ${mobile ? "mobile" : "desktop"}`, async ({ page }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      Math.random = () => 0.1;
      sessionStorage.setItem("spellcaster:gestures", "off");
      sessionStorage.setItem("spellcaster:intro-seen", "1");
    });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/practice?mode=training");
    await expect(page.locator(".clock.active")).toBeVisible();
    await page.keyboard.press("q"); await page.keyboard.press("u");
    const panel = page.getByRole("region", { name: "Charge your magic challenge" });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("heading")).toHaveText("Charge your magic!");
    await expect(panel.getByRole("status")).toContainText("Camera off");
    await expect(panel).toContainText("each full circle adds a charge");
    const left = panel.getByRole("button", { name: "Green Wizard SPACE" });
    const right = panel.getByRole("button", { name: "Purple Wizard ENTER" });
    await left.click(); await page.waitForTimeout(130); await left.click();
    await expect(panel.locator(".struggle-sides .player-A")).toHaveText("Green Wizard · 2 charges");
    await page.waitForTimeout(130); await right.click();
    await expect(panel.locator(".struggle-sides .player-B")).toHaveText("1 charge · Purple Wizard");
    await page.waitForTimeout(130);
    await page.keyboard.press("Space"); // Focused button must not also click and double-count.
    await expect(panel.locator(".struggle-sides .player-A")).toHaveText("Green Wizard · 3 charges");
    await expect(panel.getByRole("timer")).toHaveText(/\d\.\d/);
    await expect(page.locator("main.duel")).not.toHaveClass(/screen-shake/);
    await page.screenshot({ path: `/tmp/spellcaster-magic-charge-${mobile ? "mobile" : "desktop"}.png` });
    expect(await page.locator(".magic-charge-event").evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    const box = await page.locator(".magic-charge-event").boundingBox();
    const viewport = page.viewportSize()!;
    expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
    await expect(page.locator(".clash-result")).toContainText("Green Wizard wins!", { timeout: 9000 });
    await expect(page.locator(".health-value").nth(1)).toHaveText("460");
    expect(errors).toEqual([]);
  });
}

test("hand tracker runs on a synthetic camera and asks for a hand", async ({ page }) => {
  await page.route("https://**/*", (route) => route.abort());
  await page.addInitScript(() => {
    Math.random = () => 0.1;
    sessionStorage.setItem("spellcaster:intro-seen", "1");
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 480;
      const ctx = canvas.getContext("2d")!;
      setInterval(() => { ctx.fillStyle = "#282138"; ctx.fillRect(0, 0, 640, 480); }, 50);
      return canvas.captureStream(20);
    };
  });
  await page.goto("/practice?mode=training");
  await expect(page.locator(".clock.active")).toBeVisible();
  await page.keyboard.press("q"); await page.keyboard.press("u");
  const panel = page.getByRole("region", { name: "Charge your magic challenge" });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("status")).toContainText("Show one hand to the camera");
  await expect(page.locator(".magic-charge-camera .gesture-cam-view")).toBeVisible();
  await expect(page.locator(".gesture-cam-legend")).toHaveCount(0);
  await expect(panel.locator(".struggle-sides .player-A")).toHaveText("Green Wizard · 0 charges");
  await page.screenshot({ path: "/tmp/spellcaster-magic-charge-camera.png" });
  await page.getByRole("button", { name: "Reset circle tracking" }).click();
  await expect(panel.getByRole("status")).toContainText("Show one hand");
});
