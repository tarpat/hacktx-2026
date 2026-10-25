import { test, expect } from "@playwright/test";

test("only training permits an arena choice and saved choices do not affect other modes", async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => .8; // Select Staggered Rise in the bot mode.
    localStorage.setItem("spellcaster.map", "high-plateau");
    sessionStorage.setItem("spellcaster:gestures", "off");
  });
  await page.goto("/");
  await expect(page.locator(".map-picker")).toHaveCount(0);
  await page.goto("/practice?mode=training");
  await expect(page.locator("main.duel")).toHaveAttribute("data-arena", "high-plateau");
  const picker = page.getByRole("combobox", { name: "Map" });
  await picker.selectOption("twin-ledges");
  await expect(page.locator("main.duel")).toHaveAttribute("data-arena", "twin-ledges");
  await page.getByRole("button", { name: "Vs easy bot" }).click();
  await expect(page.locator(".map-picker")).toHaveCount(0);
  await expect(page.locator("main.duel")).toHaveAttribute("data-arena", "staggered-rise");
  await page.getByRole("button", { name: "Training", exact: false }).click();
  await expect(picker).toHaveValue("twin-ledges");
  await expect(page.locator("main.duel")).toHaveAttribute("data-arena", "twin-ledges");
});
