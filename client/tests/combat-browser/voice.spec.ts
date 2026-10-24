import { test, expect, type BrowserContext, type Page } from "@playwright/test";

/** Synthetic microphone and recognition: no real audio or speech-provider access. */
async function speechMock(context: BrowserContext, options: { local?: boolean; denied?: boolean; unsupported?: boolean } = {}) {
  await context.addInitScript((options) => {
    const probe = { permissions: 0, released: 0, starts: 0, aborts: 0, local: false,
      result: (_text: string, _final = false, _index = 0) => {}, end: () => {}, fail: (_error: string) => {}, late: () => {} };
    navigator.mediaDevices.getUserMedia = async () => {
      probe.permissions++;
      if (options.denied) throw new DOMException("denied", "NotAllowedError");
      return { getTracks: () => [{ stop() { probe.released++; } }] } as unknown as MediaStream;
    };
    class MockRecognition {
      static async available() { return options.local ? "available" : "unavailable"; }
      lang = ""; continuous = false; interimResults = false; maxAlternatives = 1;
      processLocally = false;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      onresult: ((event: { resultIndex: number; results: unknown[] }) => void) | null = null;
      start() {
        probe.starts++; probe.local = this.processLocally;
        probe.result = (text, final = false, index = 0) => {
          const callback = this.onresult;
          const results = Array.from({ length: index + 1 }, () => ({ isFinal: true, 0: { transcript: "" } }));
          results[index] = { isFinal: final, 0: { transcript: text } };
          const event = { resultIndex: index, results };
          probe.late = () => callback?.(event);
          callback?.(event);
        };
        probe.end = () => this.onend?.();
        probe.fail = (error) => this.onerror?.({ error });
        this.onstart?.();
      }
      abort() { probe.aborts++; }
    }
    Object.assign(window, { SpeechRecognition: options.unsupported ? undefined : MockRecognition,
      webkitSpeechRecognition: undefined, speechProbe: probe });
  }, options);
}

async function ready(page: Page) {
  await page.goto("/practice?mode=hotseat");
  await expect(page.locator(".clock.active")).toBeVisible();
  await expect(page.getByRole("status", { name: "Voice input status" })).toContainText("Listening:");
}
async function result(page: Page, text: string, final = false, index = 0) {
  await page.evaluate(({ text, final, index }) => {
    (window as unknown as { speechProbe: { result: (s: string, f: boolean, i: number) => void } }).speechProbe.result(text, final, index);
  }, { text, final, index });
}

test("automatically requests microphone, dispatches on interim in the same turn, and keeps listening", async ({ page, context }, testInfo) => {
  await speechMock(context); await ready(page);
  const measurement = await page.evaluate(() => {
    const bridge = window.spellcaster!;
    const cast = bridge.cast.bind(bridge);
    const requests: string[] = [];
    Object.assign(window, { voiceRequests: requests });
    bridge.cast = (spell, slot) => { requests.push(spell); cast(spell, slot); };
    const probe = (window as unknown as { speechProbe: { result: (s: string, f?: boolean, i?: number) => void; permissions: number; released: number } }).speechProbe;
    const before = performance.now();
    probe.result("incendio");
    return { count: requests.length, dispatchMs: performance.now() - before, permissions: probe.permissions, released: probe.released };
  });
  expect(measurement.count).toBe(1);
  expect(measurement.dispatchMs).toBeLessThan(100);
  expect(measurement.permissions).toBeGreaterThan(0);
  expect(measurement.released).toBe(measurement.permissions);
  await expect(page.getByLabel("Recognized speech")).toHaveText("incendio");
  await expect(page.locator(".health-value")).toHaveText(["100", "80"]);
  await result(page, "incendio", true); await result(page, "incendio", true);
  await result(page, "protego", false, 1);
  expect(await page.evaluate(() => (window as unknown as { voiceRequests: string[] }).voiceRequests)).toEqual(["fireball", "shield"]);
  await expect(page.getByRole("button", { name: "Stop voice" })).toBeVisible();
  await page.locator(".voice-controls").screenshot({ path: testInfo.outputPath("voice-continuous.png") });
});

test("unknown/ordinary words stay silent; fulmen is still checked by the game meter", async ({ page, context }) => {
  await speechMock(context); await ready(page);
  await result(page, "don't incendio", true);
  await result(page, "fireball", true, 1);
  await expect(page.locator(".health-value")).toHaveText(["100", "100"]);
  await result(page, "fulmen", false, 2);
  await expect(page.locator(".toast")).toHaveText("Fulmen needs a full meter");
  await expect(page.locator(".health-value")).toHaveText(["100", "100"]);
});

test("automatically restarts after endpointing without re-requesting microphone permission", async ({ page, context }) => {
  await speechMock(context); await ready(page);
  const before = await page.evaluate(() => {
    const probe = (window as unknown as { speechProbe: { starts: number; permissions: number; end: () => void } }).speechProbe;
    const before = { starts: probe.starts, permissions: probe.permissions }; probe.end(); return before;
  });
  await expect.poll(() => page.evaluate(() => (window as unknown as { speechProbe: { starts: number } }).speechProbe.starts)).toBe(before.starts + 1);
  expect(await page.evaluate(() => (window as unknown as { speechProbe: { permissions: number } }).speechProbe.permissions)).toBe(before.permissions);
  await result(page, "glacius");
  await expect(page.locator(".health-value")).toHaveText(["100", "90"]);
});

test("Stop, visibility and route cleanup cancel speech without late attacks", async ({ page, context }) => {
  await speechMock(context); await ready(page);
  await result(page, "hello");
  await page.getByRole("button", { name: "Stop voice" }).click();
  await page.evaluate(() => (window as unknown as { speechProbe: { late: () => void } }).speechProbe.late());
  await expect(page.getByRole("button", { name: "Resume voice" })).toBeVisible();
  await page.getByRole("button", { name: "Resume voice" }).click();
  await expect(page.getByRole("status", { name: "Voice input status" })).toContainText("Listening:");
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { value: true, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
  await expect(page.getByRole("status", { name: "Voice input status" })).toContainText("paused");
  await result(page, "incendio");
  await expect(page.locator(".health-value")).toHaveText(["100", "100"]);
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { value: false, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
  await expect(page.getByRole("status", { name: "Voice input status" })).toContainText("Listening:");
  const before = await page.evaluate(() => (window as unknown as { speechProbe: { aborts: number } }).speechProbe.aborts);
  await page.getByRole("link", { name: "Leave", exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { speechProbe: { aborts: number } }).speechProbe.aborts)).toBe(before + 1);
});

test("denied permissions show a single recovery action while keyboard attacks keep working", async ({ page, context }) => {
  await speechMock(context, { denied: true });
  await page.goto("/practice?mode=hotseat");
  await expect(page.getByRole("status", { name: "Voice input status" })).toContainText("denied");
  await expect(page.getByRole("button", { name: "Resume voice" })).toBeVisible();
  await expect(page.locator(".clock.active")).toBeVisible();
  await page.keyboard.press("q");
  await expect(page.locator(".health-value")).toHaveText(["100", "80"]);
});

test("unsupported browsers do not request a microphone", async ({ page, context }) => {
  await speechMock(context, { unsupported: true });
  await page.goto("/practice?mode=hotseat");
  await expect(page.getByRole("button", { name: "Resume voice" })).toBeDisabled();
  await expect(page.getByRole("status", { name: "Voice input status" })).toContainText("unavailable");
  expect(await page.evaluate(() => (window as unknown as { speechProbe: { permissions: number } }).speechProbe.permissions)).toBe(0);
});

test("an installed local model is preferred and mode can change without losing automatic listening", async ({ page, context }) => {
  await speechMock(context, { local: true }); await ready(page);
  expect(await page.evaluate(() => (window as unknown as { speechProbe: { local: boolean } }).speechProbe.local)).toBe(true);
  await page.getByText("Speech settings", { exact: true }).click();
  await page.getByRole("combobox", { name: "Speech processing" }).selectOption("browser");
  await expect.poll(() => page.evaluate(() => (window as unknown as { speechProbe: { local: boolean } }).speechProbe.local)).toBe(false);
  await expect(page.getByRole("status", { name: "Voice input status" })).toContainText("Listening:");
});

test("an interim incantation reaches the server and updates both online clients before a final transcript", async ({ page: a, context, browser }) => {
  await speechMock(context);
  const rival = await browser.newContext();
  await speechMock(rival);
  try {
    const b = await rival.newPage();
    await a.goto("/"); await a.getByRole("button", { name: "Create a duel" }).click();
    const code = await a.locator(".room-ready strong").innerText();
    await b.goto("http://127.0.0.1:4176/");
    await b.getByRole("textbox", { name: "Room code" }).fill(code);
    await b.getByRole("button", { name: "Join", exact: true }).click();
    for (const page of [a, b]) {
      await page.getByRole("button", { name: "Continue to calibration" }).click();
      await page.getByRole("button", { name: "Enter the arena" }).click();
    }
    await a.getByRole("button", { name: "I'm ready" }).click(); await b.getByRole("button", { name: "I'm ready" }).click();
    await expect(a.locator(".clock.active")).toBeVisible();
    await expect(a.getByRole("status", { name: "Voice input status" })).toContainText("Listening:");
    await result(a, "incendio");
    await expect(a.locator(".health-value")).toHaveText(["100", "80"]);
    await expect(b.locator(".health-value")).toHaveText(["80", "100"]);
  } finally { await rival.close(); }
});
