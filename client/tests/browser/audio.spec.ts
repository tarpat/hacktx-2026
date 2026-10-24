import { test, expect } from "@playwright/test";

test("fresh visit needs no device permissions; every real WAV decodes and plays", async ({ page, context }) => {
  await context.clearPermissions();
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => { throw new Error("Audio playground must not request camera or microphone"); };
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const audioRequests: string[] = [];
  page.on("request", (request) => { if (request.url().endsWith(".wav")) audioRequests.push(request.url()); });
  await page.goto("/audio-test");
  await expect(page.getByRole("button", { name: "Fireball cast" })).toBeDisabled();
  expect(audioRequests).toHaveLength(0);
  await page.getByRole("button", { name: "Enable audio" }).click();
  await expect(page.getByRole("status")).toContainText("All six sounds are ready");
  expect(audioRequests).toHaveLength(6);
  for (const name of ["Fireball cast", "Shield raised", "Shield block", "Damage hit", "Countdown", "Victory"]) {
    await page.getByRole("button", { name }).click();
    await expect(page.getByRole("status")).toContainText(`${name}: played`);
  }
  await expect(page.getByRole("status")).toContainText("Active sounds: 0/8");
  expect(errors).toEqual([]);
});

test("mute, zero volume and bounded overlapping playback", async ({ page }) => {
  await page.goto("/audio-test");
  await page.getByRole("button", { name: "Enable audio" }).click();
  await expect(page.getByRole("status")).toContainText("All six sounds are ready");
  await page.getByRole("button", { name: "Mute", exact: true }).click();
  await expect(page.getByRole("button", { name: "Unmute" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Fireball cast" }).click();
  await expect(page.getByRole("status")).toContainText("muted");
  await page.getByRole("button", { name: "Unmute" }).click();
  await page.getByRole("slider", { name: "Master volume" }).fill("0");
  await page.getByRole("button", { name: "Fireball cast" }).click();
  await expect(page.getByRole("status")).toContainText("muted");
  await page.getByRole("slider", { name: "Master volume" }).fill("70");
  await page.getByRole("button", { name: "Test overlapping casts" }).click();
  await expect(page.getByRole("status")).toContainText("8 played; 4 limited");
  await page.getByRole("button", { name: "Stop all" }).click();
  await expect(page.getByRole("status")).toContainText("Active sounds: 0/8");
});

for (const failure of ["missing", "corrupt"]) {
  test(`${failure} asset is recoverable without breaking other cues`, async ({ page }) => {
    await page.route("**/audio/cast.wav", (route) => route.fulfill({ status: failure === "missing" ? 404 : 200, body: "invalid wav" }));
    await page.goto("/audio-test");
    await page.getByRole("button", { name: "Enable audio" }).click();
    await expect(page.getByRole("alert")).toContainText("could not load");
    await page.getByRole("button", { name: "Fireball cast" }).click();
    await expect(page.getByRole("status")).toContainText("failed");
    await page.getByRole("button", { name: "Shield raised" }).click();
    await expect(page.getByRole("status")).toContainText("played");
    await page.unroute("**/audio/cast.wav");
    await page.getByRole("button", { name: "Fireball cast" }).click();
    await expect(page.getByRole("status")).toContainText("played");
  });
}

test("blocked browser audio can be enabled again", async ({ page }) => {
  await page.addInitScript(() => {
    const original = AudioContext.prototype.resume;
    let first = true;
    AudioContext.prototype.resume = function () {
      if (first) { first = false; return Promise.reject(new Error("blocked")); }
      return original.call(this);
    };
  });
  await page.goto("/audio-test");
  await page.getByRole("button", { name: "Enable audio" }).click();
  await expect(page.getByRole("alert")).toContainText("could not start");
  await page.getByRole("button", { name: "Enable audio" }).click();
  await expect(page.getByRole("status")).toContainText("All six sounds are ready");
});

test("leaving page closes contexts; returning creates a fresh disabled player", async ({ page }) => {
  await page.addInitScript(() => {
    const original = AudioContext.prototype.close;
    (window as unknown as { audioCloses: number }).audioCloses = 0;
    AudioContext.prototype.close = function () {
      (window as unknown as { audioCloses: number }).audioCloses++;
      return original.call(this);
    };
  });
  await page.goto("/audio-test");
  await page.getByRole("button", { name: "Enable audio" }).click();
  await expect(page.getByRole("status")).toContainText("All six sounds are ready");
  await page.getByRole("button", { name: "Victory" }).click();
  await page.getByRole("link", { name: "SPELLCASTER" }).click();
  await expect(page.getByRole("button", { name: "Create a duel" })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { audioCloses: number }).audioCloses)).toBe(1);
  await page.goBack();
  await expect(page.getByRole("button", { name: "Victory" })).toBeDisabled();
});

test("mobile layout has no horizontal overflow", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/audio-test");
  await expect(page.getByRole("heading", { name: "Audio playground" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("audio-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: testInfo.outputPath("audio-desktop.png"), fullPage: true });
});

test("real output gains respond immediately to mute and volume changes", async ({ page }) => {
  await page.addInitScript(() => {
    const original = AudioContext.prototype.createGain;
    const gains: GainNode[] = [];
    (window as unknown as { outputGains: GainNode[] }).outputGains = gains;
    AudioContext.prototype.createGain = function () {
      const gain = original.call(this);
      gains.push(gain);
      return gain;
    };
  });
  await page.goto("/audio-test");
  await page.getByRole("button", { name: "Enable audio" }).click();
  await expect(page.getByRole("status")).toContainText("All six sounds are ready");
  await page.getByRole("button", { name: "Victory" }).click();
  await page.getByRole("button", { name: "Mute", exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { outputGains: GainNode[] }).outputGains.at(-1)!.gain.value)).toBe(0);
  await page.getByRole("slider", { name: "Master volume" }).fill("50");
  await page.getByRole("button", { name: "Unmute" }).click();
  expect(await page.evaluate(() => (window as unknown as { outputGains: GainNode[] }).outputGains.at(-1)!.gain.value)).toBeCloseTo(0.3);
  await page.getByRole("button", { name: "Stop all" }).click();
  await expect(page.getByRole("status")).toContainText("Active sounds: 0/8");
});

test("placeholder assets contain finite non-silent PCM with headroom and quiet edges", async ({ page }) => {
  await page.goto("/audio-test");
  const levels = await page.evaluate(async () => {
    const context = new OfflineAudioContext(1, 44100, 44100);
    const results = [];
    for (const cue of ["cast", "shield", "block", "hit", "countdown", "victory"]) {
      const response = await fetch(`/audio/${cue}.wav`);
      const buffer = await context.decodeAudioData(await response.arrayBuffer());
      const data = buffer.getChannelData(0);
      let peak = 0;
      let energy = 0;
      for (const value of data) { peak = Math.max(peak, Math.abs(value)); energy += value * value; }
      results.push({ cue, peak, rms: Math.sqrt(energy / data.length), start: data[0], end: data[data.length - 1], duration: buffer.duration });
    }
    return results;
  });
  for (const level of levels) {
    expect(level.peak, level.cue).toBeLessThan(0.81);
    expect(level.rms, level.cue).toBeGreaterThan(0.01);
    expect(Math.abs(level.start), level.cue).toBeLessThan(0.01);
    expect(Math.abs(level.end), level.cue).toBeLessThan(0.01);
    expect(level.duration, level.cue).toBeLessThan(1.1);
  }
});
