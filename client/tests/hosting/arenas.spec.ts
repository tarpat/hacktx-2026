import { test, expect } from "@playwright/test";

test("only hotseat permits an arena choice and saved choices do not affect other modes", async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => .8; // Select Staggered Rise in non-hotseat modes.
    localStorage.setItem("spellcaster.map", "high-plateau");
    sessionStorage.setItem("spellcaster:gestures", "off");
  });
  await page.goto("/");
  await expect(page.locator(".map-picker")).toHaveCount(0);
  await page.goto("/practice?mode=hotseat");
  await expect(page.locator("main.duel")).toHaveAttribute("data-arena", "high-plateau");
  const picker = page.getByRole("combobox", { name: "Map" });
  await picker.selectOption("twin-ledges");
  await expect(page.locator("main.duel")).toHaveAttribute("data-arena", "twin-ledges");
  for (const name of ["Vs easy bot", "Training dummy"]) {
    await page.getByRole("button", { name, exact: false }).click();
    await expect(page.locator(".map-picker")).toHaveCount(0);
    await expect(page.locator("main.duel")).toHaveAttribute("data-arena", "staggered-rise");
  }
  await page.getByRole("button", { name: "Hotseat", exact: true }).click();
  await expect(picker).toHaveValue("twin-ledges");
  await expect(page.locator("main.duel")).toHaveAttribute("data-arena", "twin-ledges");
});
