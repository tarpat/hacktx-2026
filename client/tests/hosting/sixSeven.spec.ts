import { test, expect } from "@playwright/test";

for (const mobile of [false, true]) {
  test(`6–7 challenge supports camera-off taps and fits ${mobile ? "mobile" : "desktop"}`, async ({ page }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      Math.random = () => 0.1;
      sessionStorage.setItem("spellcaster:gestures", "off");
    });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/practice?mode=hotseat");
    await expect(page.locator(".clock.active")).toBeVisible();
    await page.keyboard.press("q"); await page.keyboard.press("u");
    const panel = page.getByRole("region", { name: "6–7 collision challenge" });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("heading")).toHaveText("6–7 to overpower!");
    await expect(panel.getByRole("status")).toContainText("Camera off");
    await expect(panel).toContainText("elbow scores a beat");
    const left = panel.getByRole("button", { name: "Green Wizard SPACE" });
    const right = panel.getByRole("button", { name: "Purple Wizard ENTER" });
    await left.click(); await page.waitForTimeout(130); await left.click();
    await expect(panel.locator(".struggle-sides .player-A")).toHaveText("Green Wizard · 2 beats");
    await page.waitForTimeout(130); await right.click();
    await expect(panel.locator(".struggle-sides .player-B")).toHaveText("1 beat · Purple Wizard");
    await page.waitForTimeout(130);
    await page.keyboard.press("Space"); // Focused button must not also click and double-count.
    await expect(panel.locator(".struggle-sides .player-A")).toHaveText("Green Wizard · 3 beats");
    await expect(panel.getByRole("timer")).toHaveText(/\d\.\d/);
    await expect(page.locator("main.duel")).not.toHaveClass(/screen-shake/);
    await page.screenshot({ path: `/tmp/spellcaster-six-seven-${mobile ? "mobile" : "desktop"}.png` });
    expect(await page.locator(".six-seven-event").evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    const box = await page.locator(".six-seven-event").boundingBox();
    const viewport = page.viewportSize()!;
    expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
    await expect(page.locator(".clash-result")).toContainText("Green Wizard wins!", { timeout: 9000 });
    await expect(page.locator(".health-value").nth(1)).toHaveText("60");
    expect(errors).toEqual([]);
  });
}

test("self-hosted pose model runs on a synthetic camera and reports missing elbows", async ({ page }) => {
  await page.route("https://**/*", (route) => route.abort());
  await page.addInitScript(() => {
    Math.random = () => 0.1;
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 480;
      const ctx = canvas.getContext("2d")!;
      setInterval(() => { ctx.fillStyle = "#282138"; ctx.fillRect(0, 0, 640, 480); }, 50);
      return canvas.captureStream(20);
    };
  });
  const model = page.waitForResponse((r) => r.url().endsWith("/models/pose_landmarker_lite.task"));
  await page.goto("/practice?mode=hotseat");
  expect((await model).status()).toBe(200);
  await expect(page.locator(".clock.active")).toBeVisible();
  await page.keyboard.press("q"); await page.keyboard.press("u");
  const panel = page.getByRole("region", { name: "6–7 collision challenge" });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("status")).toContainText("Step back until both elbows and wrists are in view");
  await expect(page.locator(".six-seven-camera .gesture-cam-view")).toBeVisible();
  await expect(page.locator(".gesture-cam-legend")).toHaveCount(0);
  await expect(panel.locator(".struggle-sides .player-A")).toHaveText("Green Wizard · 0 beats");
  await page.screenshot({ path: "/tmp/spellcaster-six-seven-camera.png" });
  await page.getByRole("button", { name: "Retry 6–7 tracking" }).click();
  await expect(panel.getByRole("status")).toContainText("Step back");
});
