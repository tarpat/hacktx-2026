import { test, expect } from "@playwright/test";

for (const mobile of [false, true]) {
  test(`Magic charge challenge requires a camera and fits ${mobile ? "mobile" : "desktop"}`, async ({ page }) => {
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
    await expect(panel.getByRole("status")).toContainText("Enable your camera");
    await expect(panel).toContainText("precisely and quickly");
    await expect(panel).toContainText("Accuracy 80%");
    await page.keyboard.press("Space");
    await expect(panel.locator(".struggle-sides .player-A")).toHaveText("Green Wizard · 0/100");
    await expect(panel.getByRole("button")).toHaveCount(0);
    await expect(panel.getByRole("timer")).toHaveText(/\d\.\d/);
    await expect(page.locator("main.duel")).not.toHaveClass(/screen-shake/);
    await page.screenshot({ path: `/tmp/spellcaster-magic-charge-${mobile ? "mobile" : "desktop"}.png` });
    expect(await page.locator(".magic-charge-event").evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    const box = await page.locator(".magic-charge-event").boundingBox();
    const viewport = page.viewportSize()!;
    expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);

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
  await expect(panel.getByRole("status")).toContainText("Point one index finger");
  await expect(page.locator(".magic-charge-camera .gesture-cam-view")).toBeVisible();
  await expect(page.locator(".gesture-cam-legend")).toHaveCount(0);
  await expect(panel.locator(".struggle-sides .player-A")).toHaveText("Green Wizard · 0/100");
  await page.screenshot({ path: "/tmp/spellcaster-magic-charge-camera.png" });
  await page.getByRole("button", { name: "Reset circle tracking" }).click();
  await expect(panel.getByRole("status")).toContainText("Point one index finger");
});

for (const mobile of [false,true]) {
test(`pointed fingertip traces score through camera input on ${mobile ? "mobile" : "desktop"}`, async ({ page }) => {
  if(mobile) await page.setViewportSize({width:390,height:844});
  await page.route("https://**/*", route=>route.abort());
  await page.addInitScript(()=>{
    Math.random=()=>.1;
    sessionStorage.setItem("spellcaster:intro-seen","1");
    let tracing=false, step=0;
    Object.defineProperty(window,"startTestTrace",{value:()=>{tracing=true;step=0;}});
    const OriginalWorker=window.Worker;
    window.Worker=class {
      onmessage: ((event: {data:unknown})=>void) | null=null;
      constructor(url: string | URL, options?: WorkerOptions) {
        if(!String(url).includes("handWorker")) return new OriginalWorker(url,options);
        queueMicrotask(()=>this.onmessage?.({data:{type:"ready"}}));
      }
      postMessage(request: {frame:ImageBitmap}) {
        request.frame.close();
        let landmarks: {x:number;y:number;z:number}[][]=[];
        if(tracing) {
          const angle=(step++%49)*Math.PI/24;
          const x=1-(.5+.22*Math.cos(angle)), y=(.375+.22*Math.sin(angle))/.75;
          const hand=Array.from({length:21},()=>({x,y:y+.08,z:0}));
          for(const i of [6,10,14,18]) hand[i]={x,y:y+.035,z:0};
          for(const i of [12,16,20]) hand[i]={x,y:y+.06,z:0};
          hand[8]={x,y,z:-.025}; landmarks=[hand];
        }
        queueMicrotask(()=>this.onmessage?.({data:{type:"result",detection:{landmarks,handedness:["Left"]}}}));
      }
      terminate() {}
    } as unknown as typeof Worker;
    navigator.mediaDevices.getUserMedia=async()=>{
      const canvas=document.createElement("canvas");canvas.width=640;canvas.height=480;
      const ctx=canvas.getContext("2d")!;
      setInterval(()=>{ctx.fillStyle="#282138";ctx.fillRect(0,0,640,480);},30);
      return canvas.captureStream(30);
    };
  });
  await page.goto("/practice?mode=training");
  await expect(page.locator(".clock.active")).toBeVisible({timeout:15000});
  await page.keyboard.press("q"); await page.keyboard.press("u");
  const panel=page.getByRole("region",{name:"Charge your magic challenge"});
  await expect(panel).toBeVisible();
  await page.evaluate(()=>{(window as unknown as {startTestTrace:()=>void}).startTestTrace();});
  await expect(panel.locator(".struggle-sides .player-A")).not.toHaveText("Green Wizard · 0/100",{timeout:5000});
  await expect(panel.locator(".magic-trace-result")).toContainText("100% accuracy");
  await page.screenshot({path:`/tmp/spellcaster-pointed-circle-${mobile ? "mobile" : "desktop"}.png`});
});

}
