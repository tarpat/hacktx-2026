import { test, expect, type BrowserContext, type Page } from "@playwright/test";

/** Deterministic speech results, no microphone or external speech provider is accessed. */
async function speechMock(context: BrowserContext, localSupport = true) {
  await context.addInitScript(({ localSupport }) => {
    const probe = { starts: 0, aborts: 0, local: false, final: (_text: string) => {}, interim: (_text: string) => {}, fail: (_error: string) => {} };
    class MockRecognition {
      lang = ""; continuous = false; interimResults = false; maxAlternatives = 1;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      onresult: ((event: { resultIndex: number; results: unknown[] }) => void) | null = null;
      constructor() { if (localSupport) Object.assign(this, { processLocally: false }); }
      start() {
        probe.starts++;
        probe.local = (this as unknown as { processLocally?: boolean }).processLocally ?? false;
        probe.interim = (text) => this.onresult?.({ resultIndex: 0, results: [{ isFinal: false, 0: { transcript: text } }] });
        probe.final = (text) => {
          const callback = this.onresult;
          const event = { resultIndex: 0, results: [{ isFinal: true, 0: { transcript: text } }] };
          callback?.(event); callback?.(event); // Simulate duplicate queued final callbacks.
        };
        probe.fail = (error) => this.onerror?.({ error });
        this.onstart?.();
      }
      abort() { probe.aborts++; }
    }
    Object.assign(window, { SpeechRecognition: MockRecognition, speechProbe: probe });
  }, { localSupport });
}

async function openVoice(page: Page) {
  await page.goto("/practice?mode=hotseat");
  await expect(page.locator(".clock.active")).toBeVisible();
  await page.locator(".voice-controls summary").click();
}
async function result(page: Page, text: string, final = true) {
  await page.evaluate(({ text, final }) => {
    const probe = (window as unknown as { speechProbe: { final: (s: string) => void; interim: (s: string) => void } }).speechProbe;
    if (final) probe.final(text); else probe.interim(text);
  }, { text, final });
}

test("final speech becomes one fireball request; interim and repeated final callbacks do not duplicate it", async ({ page, context }, testInfo) => {
  await speechMock(context); await openVoice(page);
  expect(await page.evaluate(() => (window as unknown as { speechProbe: { starts: number } }).speechProbe.starts)).toBe(0);
  await page.evaluate(() => {
    const bridge = window.spellcaster!;
    const cast = bridge.cast.bind(bridge);
    const requests: string[] = [];
    Object.assign(window, { voiceRequests: requests });
    bridge.cast = (spell, slot) => { requests.push(spell); cast(spell, slot); };
  });
  await page.getByRole("button", { name: "Speak a spell" }).click();
  await result(page, "Incendio", false);
  await expect(page.getByLabel("Recognized speech")).toHaveText("Incendio");
  await expect(page.locator(".health-value")).toHaveText(["100", "100"]);
  await result(page, "Incendio");
  await expect(page.locator(".health-value")).toHaveText(["100", "80"]);
  expect(await page.evaluate(() => (window as unknown as { voiceRequests: string[] }).voiceRequests)).toEqual(["fireball"]);
  expect(await page.evaluate(() => (window as unknown as { speechProbe: { local: boolean } }).speechProbe.local)).toBe(true);
  await page.locator(".voice-controls").screenshot({ path: testInfo.outputPath("voice-casting.png") });
});

test("non-command speech stays text only; an ultimate request still obeys the meter", async ({ page, context }) => {
  await speechMock(context); await openVoice(page);
  await page.getByRole("button", { name: "Speak a spell" }).click();
  await result(page, "don't cast fireball");
  await expect(page.getByLabel("Recognized speech")).toHaveText("don't cast fireball");
  await expect(page.getByRole("status", { name: "Voice input status" })).toContainText("No single spell");
  await page.getByRole("button", { name: "Speak a spell" }).click();
  await result(page, "ultimate");
  await expect(page.locator(".toast")).toHaveText("Fulmen needs a full meter");
  await expect(page.locator(".health-value")).toHaveText(["100", "100"]);
});

test("browser service requires explicit opt-in; Stop ignores late results and route leave aborts", async ({ page, context }) => {
  await speechMock(context, false); await openVoice(page);
  await page.getByRole("button", { name: "Speak a spell" }).click();
  expect(await page.evaluate(() => (window as unknown as { speechProbe: { starts: number } }).speechProbe.starts)).toBe(0);
  await expect(page.getByRole("status", { name: "Voice input status" })).toContainText("On-device recognition is unavailable");
  await page.getByRole("checkbox", { name: "Use browser speech service" }).check();
  await page.getByRole("button", { name: "Speak a spell" }).click();
  await page.getByRole("button", { name: "Stop listening" }).click();
  await result(page, "fireball");
  await expect(page.locator(".health-value")).toHaveText(["100", "100"]);
  await page.getByRole("button", { name: "Speak a spell" }).click();
  await page.getByRole("link", { name: "Leave", exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { speechProbe: { aborts: number } }).speechProbe.aborts)).toBe(2);
});

test("permission denial leaves keyboard attacks working", async ({ page, context }) => {
  await speechMock(context); await openVoice(page);
  await page.getByRole("button", { name: "Speak a spell" }).click();
  await page.evaluate(() => (window as unknown as { speechProbe: { fail: (s: string) => void } }).speechProbe.fail("not-allowed"));
  await expect(page.getByRole("status", { name: "Voice input status" })).toContainText("Microphone access was denied");
  await page.keyboard.press("q");
  await expect(page.locator(".health-value")).toHaveText(["100", "80"]);
});

test("unsupported browser has a clear fallback without requesting audio", async ({ page, context }) => {
  await context.addInitScript(() => Object.assign(window, { SpeechRecognition: undefined, webkitSpeechRecognition: undefined }));
  await openVoice(page);
  await expect(page.getByRole("button", { name: "Speak a spell" })).toBeDisabled();
  await expect(page.getByRole("status", { name: "Voice input status" })).toContainText("unavailable");
});

test("a transcribed command reaches the server and changes HP on both online clients", async ({ page: a, context, browser }) => {
  await speechMock(context);
  const rival = await browser.newContext();
  try {
    const b = await rival.newPage();
    await a.goto("/");
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
    await expect(a.locator(".clock.active")).toBeVisible();
    await a.locator(".voice-controls summary").click();
    await a.getByRole("button", { name: "Speak a spell" }).click();
    await result(a, "cast fireball");
    await expect(a.locator(".health-value")).toHaveText(["100", "80"]);
    await expect(b.locator(".health-value")).toHaveText(["80", "100"]);
  } finally { await rival.close(); }
});
