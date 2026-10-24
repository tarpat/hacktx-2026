import { test, expect } from "@playwright/test";

test("built routes refresh correctly and do not start audio transcription", async ({ page, context }) => {
  await context.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new Error("Unexpected automatic device capture"); };
    Object.assign(window, { SpeechRecognition: class { constructor() { throw new Error("Transcription was removed"); } } });
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const route of ["/", "/practice?mode=hotseat", "/gesture-test"]) {
    await page.goto(route);
    await page.reload();
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByRole("group", { name: "Voice casting" })).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test("production browser clients connect on the hosted origin without a localhost backend", async ({ browser }) => {
  const aContext = await browser.newContext(); const bContext = await browser.newContext();
  const connections: string[] = [];
  try {
    const a = await aContext.newPage(); const b = await bContext.newPage();
    for (const page of [a, b]) page.on("websocket", (socket) => connections.push(socket.url()));
    await a.goto("http://127.0.0.1:4180/");
    await a.getByRole("button", { name: "Create a duel" }).click();
    const code = await a.locator(".room-ready strong").innerText();
    await b.goto("http://127.0.0.1:4180/");
    await b.getByRole("textbox", { name: "Room code" }).fill(code);
    await b.getByRole("button", { name: "Join", exact: true }).click();
    for (const page of [a, b]) {
      await page.getByRole("button", { name: "Continue to calibration" }).click();
      await page.getByRole("button", { name: "Enter the arena" }).click();
    }
    await a.getByRole("button", { name: "I'm ready" }).click();
    await b.getByRole("button", { name: "I'm ready" }).click();
    await expect(a.locator(".clock.active")).toBeVisible();
    await a.keyboard.press("q");
    await expect(a.locator(".health-value")).toHaveText(["100", "80"]);
    await expect(b.locator(".health-value")).toHaveText(["80", "100"]);
    expect(connections.length).toBeGreaterThanOrEqual(2);
    expect(connections.every((url) => url.startsWith("ws://127.0.0.1:4180/socket.io/"))).toBe(true);
  } finally { await aContext.close(); await bContext.close(); }
});
