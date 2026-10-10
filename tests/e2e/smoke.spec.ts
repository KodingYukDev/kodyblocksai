import { expect, test } from "@playwright/test";

test("shell tampil dengan menu bar KodyBlocks", async ({ page }) => {
  await page.goto("/");
  const bar = page.getByRole("banner");
  await expect(bar).toBeVisible();
  await expect(bar.getByAltText("KodyBlocks")).toBeVisible();
  const box = await bar.boundingBox();
  expect(box?.height).toBe(48);
});
