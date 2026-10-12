/**
 * Build produksi: buka app, seret blok (jari + mouse), bendera hijau, tombol berhenti.
 */
import { expect, test } from "@playwright/test";
import {
  appendToTopStack,
  dragFromPalette,
  expectNoHorizontalScroll,
  expectNoProblems,
  isPhone,
  isTouch,
  openApp,
  openCategory,
  press,
  scriptOpcodes,
  watchProblems,
  workspaceBox,
} from "./helpers";

test("app terbuka tanpa error, tanpa pelanggaran CSP, tanpa scroll horizontal", async ({ page }, info) => {
  const problems = await watchProblems(page);
  await openApp(page);
  const bar = page.getByRole("banner");
  await expect(bar).toBeVisible();
  expect((await bar.boundingBox())?.height).toBe(48);
  await expectNoHorizontalScroll(page);
  // Panggung WebGL tampil dan berukuran.
  const stage = await page.locator("canvas").first().boundingBox();
  expect(stage?.width ?? 0).toBeGreaterThan(100);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: info.outputPath("open.png") });
  await expectNoProblems(page, problems);
});

test("seret blok, bendera hijau menjalankan, tombol berhenti menghentikan", async ({ page }, info) => {
  const problems = await watchProblems(page);
  await openApp(page);

  await openCategory(page, info, "Kejadian");
  const ws = await workspaceBox(page);
  await dragFromPalette(page, info, "event_whenflagclicked", { x: ws.x + Math.min(200, ws.width / 2), y: ws.y + 80 });
  expect(await scriptOpcodes(page)).toEqual([["event_whenflagclicked"]]);

  // "selamanya" + "gerak 10 langkah" di dalamnya: berjalan terus sampai tombol berhenti.
  await appendToTopStack(page, info, "control_forever", "Kontrol");
  expect(await scriptOpcodes(page)).toEqual([["event_whenflagclicked", "control_forever"]]);
  await openCategory(page, info, "Gerakan");
  const forever = await page.locator('.kb-main-svg g.kb-block[data-opcode="control_forever"]').first().boundingBox();
  expect(forever).not.toBeNull();
  // Titik jatuh: di dalam mulut "selamanya" (sedikit kanan, di bawah baris atasnya).
  // "putar 15 derajat" (bukan gerak: gerak berhenti di tepi panggung sehingga tombol Berhenti tidak teruji).
  await dragFromPalette(page, info, "motion_turnright", { x: forever!.x + 24, y: forever!.y + 40 });
  const inner = await page.locator('.kb-main-svg g.kb-block[data-opcode="control_forever"] g.kb-block[data-opcode="motion_turnright"]').count();
  expect(inner, "putar di dalam selamanya").toBe(1);

  if (isPhone(info)) await press(page, info, page.getByRole("tab", { name: "Sprite" }));
  const dir = () => page.locator('input[aria-label="Arah"]').first().inputValue();
  const d0 = await dir();
  await press(page, info, page.getByRole("button", { name: "Jalankan" }).first());
  await expect.poll(dir, { timeout: 10_000 }).not.toBe(d0);
  const seen = new Set<string>();
  for (let i = 0; i < 4; i++) {
    seen.add(await dir());
    await page.waitForTimeout(150);
  }
  expect(seen.size, "skrip terus berjalan").toBeGreaterThan(1);
  await press(page, info, page.getByRole("button", { name: "Berhenti" }).first());
  await page.waitForTimeout(400);
  const stopped = await dir();
  await page.waitForTimeout(800);
  expect(await dir(), "sprite diam setelah Berhenti").toBe(stopped);
  await page.screenshot({ path: info.outputPath("script.png") });
  await expectNoHorizontalScroll(page);
  await expectNoProblems(page, problems);
});

test("seret dengan mouse juga bekerja di perangkat sentuh (iPad + keyboard/trackpad)", async ({ page }, info) => {
  test.skip(!isTouch(info), "hanya proyek sentuh");
  const problems = await watchProblems(page);
  await openApp(page);
  await openCategory(page, info, "Gerakan");
  const ws = await workspaceBox(page);
  const src = page.locator('.kb-flyout-svg g.kb-block[data-opcode="motion_turnright"]').first();
  const b = (await src.boundingBox())!;
  await page.mouse.move(b.x + 8, b.y + 12);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(b.x + 8 + ((ws.x + ws.width / 2 - b.x) * i) / 12, b.y + 12 + ((ws.y + 120 - b.y) * i) / 12);
  await page.mouse.up();
  await page.waitForTimeout(300);
  expect(await scriptOpcodes(page)).toEqual([["motion_turnright"]]);
  await expectNoProblems(page, problems);
});
