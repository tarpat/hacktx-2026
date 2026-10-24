import { test, expect, type Page, type BrowserContext } from "@playwright/test";

test.beforeEach(async ({ context }) => {
  // Playback regression tests must never capture a real microphone.
  await context.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException("Test microphone denied", "NotAllowedError"); };
  });
});

/** Observe actual source starts, not just calls to the audio adapter. */
async function observe(context: BrowserContext) {
  await context.addInitScript(() => {
    const starts: number[] = [];
    const probe = { starts, closes: 0 };
    (window as unknown as { audioProbe: typeof probe }).audioProbe = probe;
    const createSource = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function () {
      const source = createSource.call(this);
      const start = source.start.bind(source);
      source.start = (...args: Parameters<typeof start>) => {
        starts.push(Number(source.buffer?.duration.toFixed(2)));
        return start(...args);
      };
      return source;
    };
    const close = AudioContext.prototype.close;
    AudioContext.prototype.close = function () { probe.closes++; return close.call(this); };
  });
}

const starts = (page: Page) => page.evaluate(() => (window as unknown as { audioProbe: { starts: number[] } }).audioProbe.starts);
async function enable(page: Page) {
  await page.getByRole("button", { name: "Enable duel audio" }).click();
  await expect(page.getByRole("button", { name: "Sound enabled" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Duel audio" }).getByRole("status")).toHaveText("Sound on");
}

test("two online clients hear one confirmed block, one hit, and no cooldown-rejection sound", async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  try {
    await observe(contextA); await observe(contextB);
    const a = await contextA.newPage(); const b = await contextB.newPage();
    await a.goto("http://127.0.0.1:4176/");
    await a.getByRole("button", { name: "Create a duel" }).click();
    const code = await a.locator(".room-ready strong").innerText();
    await b.goto("http://127.0.0.1:4176/");
    await b.getByRole("textbox", { name: "Room code" }).fill(code);
    await b.getByRole("button", { name: "Join", exact: true }).click();
    for (const page of [a, b]) {
      await page.getByRole("button", { name: "Continue to calibration" }).click();
      await page.getByRole("button", { name: "Enter the arena" }).click();
    }
    await a.getByRole("button", { name: "I'm ready" }).click();
    await b.getByRole("button", { name: "I'm ready" }).click();
    await enable(a); await enable(b);
    await expect(a.locator(".clock.active")).toBeVisible();
    await a.keyboard.press("q");
    await expect.poll(() => starts(b)).toEqual([0.5]);
    await b.keyboard.press("w");
    await a.keyboard.press("q"); // Same spell on cooldown: must remain silent.
    for (const page of [a, b]) {
      await expect.poll(() => starts(page)).toEqual([0.5, 0.65, 0.3]);
      await expect(page.locator(".health-value")).toHaveText(["100", "100"]);
    }
    await b.keyboard.press("q");
    for (const page of [a, b]) {
      await expect.poll(() => starts(page)).toEqual([0.5, 0.65, 0.3, 0.5, 0.32]);
      await expect(page.locator(".duel-hud")).toContainText("80");
    }
  } finally { await contextA.close(); await contextB.close(); }
});

test("practice hotseat uses the same adapter; muted events never replay and leaving cleans up", async ({ page, context }, testInfo) => {
  await observe(context);
  await page.goto("/practice?mode=hotseat");
  await enable(page);
  await expect(page.locator(".clock.active")).toBeVisible();
  await page.keyboard.press("q");
  await expect.poll(() => starts(page)).toEqual([0.5]);
  await page.keyboard.press("i");
  await expect.poll(() => starts(page)).toEqual([0.5, 0.65, 0.3]);
  await page.getByRole("button", { name: "Mute duel", exact: true }).click();
  await page.keyboard.press("u");
  await expect(page.locator(".duel-hud")).toContainText("80");
  await page.getByRole("button", { name: "Unmute duel" }).click();
  expect(await starts(page)).toEqual([0.5, 0.65, 0.3]);
  await page.screenshot({ path: testInfo.outputPath("combat-audio.png"), fullPage: true });
  await page.getByRole("link", { name: "Leave", exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { audioProbe: { closes: number } }).audioProbe.closes)).toBe(1);
});

test("combat continues with audio disabled or a missing effect", async ({ page }) => {
  await page.route("**/audio/cast.wav", (route) => route.fulfill({ status: 404, body: "missing" }));
  await page.goto("/practice?mode=hotseat");
  await expect(page.locator(".clock.active")).toBeVisible();
  await page.keyboard.press("q");
  await expect(page.locator(".duel-hud")).toContainText("80");
  await page.getByRole("button", { name: "Enable duel audio" }).click();
  await expect(page.getByRole("alert")).toContainText("could not load");
  await page.keyboard.press("u");
  await expect(page.getByRole("alert")).toContainText("Could not play");
  await page.unroute("**/audio/cast.wav");
  await page.getByRole("button", { name: "Retry sound" }).click();
  await expect(page.getByRole("button", { name: "Sound enabled" })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.locator(".health-value")).toHaveText(["80", "80"]);
  await expect(page.getByRole("group", { name: "Duel audio" }).getByRole("status")).toHaveText("Sound on");
});

test("duel audio controls fit a mobile viewport", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/practice?mode=hotseat");
  const controls = page.getByRole("group", { name: "Duel audio" });
  await expect(controls.getByRole("button", { name: "Enable duel audio" })).toBeVisible();
  const bounds = await controls.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(375);
  await enable(page); // The controls must be clickable, not merely present beneath the canvas.
  await expect(page.locator(".clock.active")).toBeVisible();
  await controls.scrollIntoViewIfNeeded();
  await controls.screenshot({ path: testInfo.outputPath("combat-audio-mobile.png") });
});
