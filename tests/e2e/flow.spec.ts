/**
 * Smoke alur penuh: buka app -> project default -> seret "ketika bendera diklik" + "gerak 10 langkah" +
 * "katakan Halo!" -> klik bendera -> sprite bergerak -> simpan .sb3 -> muat ulang -> skrip kembali.
 * Screenshot ke docs/screenshots/<project>-*.png.
 */
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const SHOTS = join(process.cwd(), "docs", "screenshots");
mkdirSync(SHOTS, { recursive: true });

type Box = { x: number; y: number; width: number; height: number };

interface KodyWindow {
  __kody?: {
    runtime: {
      flyoutBlocks: { toRecord(): Record<string, { opcode: string; topLevel: boolean }> };
      getEditingTarget(): {
        x: number;
        y: number;
        sprite: { name: string };
        blocks: { toRecord(): Record<string, { id: string; opcode: string; next: string | null; topLevel: boolean }> };
        getCustomState(key: string): { text?: string } | undefined;
      } | null;
    };
  };
}

async function waitForApp(page: Page): Promise<void> {
  await page.goto("/");
  await page.waitForFunction(() => {
    const k = (window as unknown as KodyWindow).__kody;
    return !!k && !!k.runtime.getEditingTarget() && Object.keys(k.runtime.flyoutBlocks.toRecord()).length > 50;
  });
}

async function openCategory(page: Page, name: string): Promise<void> {
  await page.locator(".kb-ws").getByText(name, { exact: true }).first().click();
  await page.waitForTimeout(400);
}

async function flyoutBlock(page: Page, opcode: string): Promise<Box> {
  const id = await page.evaluate((op) => {
    const rec = (window as unknown as KodyWindow).__kody?.runtime.flyoutBlocks.toRecord() ?? {};
    return Object.entries(rec).find(([, b]) => b.opcode === op && b.topLevel)?.[0] ?? null;
  }, opcode);
  expect(id, `blok flyout ${opcode}`).not.toBeNull();
  const box = await page.locator(`.kb-flyout-svg g.kb-block[data-block-id="${id}"]`).first().boundingBox();
  expect(box, `kotak ${opcode}`).not.toBeNull();
  return box as Box;
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
  }
  await page.waitForTimeout(80);
  await page.mouse.up();
  await page.waitForTimeout(250);
}

async function topStackBox(page: Page): Promise<Box> {
  const box = await page.locator(".kb-main-svg g.kb-stack").first().boundingBox();
  expect(box).not.toBeNull();
  return box as Box;
}

async function scriptOpcodes(page: Page): Promise<string[][]> {
  return page.evaluate(() => {
    const t = (window as unknown as KodyWindow).__kody?.runtime.getEditingTarget();
    const rec = t?.blocks.toRecord() ?? {};
    return Object.values(rec)
      .filter((b) => b.topLevel)
      .map((top) => {
        const chain: string[] = [];
        let cur: string | null = top.id;
        while (cur) {
          const b: { opcode: string; next: string | null } | undefined = rec[cur];
          if (!b) break;
          chain.push(b.opcode);
          cur = b.next;
        }
        return chain;
      });
  });
}

/** Seret blok dari palet lalu sambungkan di bawah stack paling atas. */
async function appendBlock(page: Page, opcode: string, category: string): Promise<void> {
  await openCategory(page, category);
  const src = await flyoutBlock(page, opcode);
  const stack = await topStackBox(page);
  const grab = { x: src.x + 6, y: src.y + Math.min(src.height / 2, 14) };
  // Titik jatuh: kiri stack, sedikit di bawah dasar stack (dalam radius snap).
  await drag(page, grab, { x: stack.x + 6, y: stack.y + stack.height + 6 });
}

test("alur bendera hijau: seret blok, jalankan, simpan .sb3, muat ulang", async ({ page }, info) => {
  const tag = info.project.name;
  await waitForApp(page);
  await page.screenshot({ path: join(SHOTS, `${tag}-1-default.png`) });

  // 1. "ketika bendera diklik" ke area kode.
  await openCategory(page, "Kejadian");
  const hat = await flyoutBlock(page, "event_whenflagclicked");
  const ws = await page.locator(".kb-ws-main").boundingBox();
  expect(ws).not.toBeNull();
  const wsBox = ws as Box;
  await drag(page, { x: hat.x + 10, y: hat.y + hat.height - 12 }, { x: wsBox.x + Math.min(160, wsBox.width / 3), y: wsBox.y + 120 });
  expect(await scriptOpcodes(page)).toEqual([["event_whenflagclicked"]]);

  // 2. "gerak 10 langkah" lalu 3. "katakan Halo!".
  await appendBlock(page, "motion_movesteps", "Gerakan");
  await appendBlock(page, "looks_say", "Tampilan");
  expect(await scriptOpcodes(page)).toEqual([["event_whenflagclicked", "motion_movesteps", "looks_say"]]);
  await page.screenshot({ path: join(SHOTS, `${tag}-2-script.png`) });

  // 4. Bendera hijau: sprite bergerak 10 langkah ke kanan dan berkata Halo!.
  const before = await page.evaluate(() => (window as unknown as KodyWindow).__kody?.runtime.getEditingTarget()?.x ?? NaN);
  await page.getByRole("button", { name: "Jalankan" }).click();
  await page.waitForFunction((x0) => (window as unknown as KodyWindow).__kody?.runtime.getEditingTarget()?.x === x0 + 10, before);
  const bubble = await page.evaluate(() => (window as unknown as KodyWindow).__kody?.runtime.getEditingTarget()?.getCustomState("Scratch.looks")?.text);
  expect(bubble).toBe("Halo!");
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(SHOTS, `${tag}-3-after-flag.png`) });

  // 5. Simpan .sb3.
  await page.getByRole("button", { name: "File" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByText("Simpan .sb3").click();
  const download = await downloadPromise;
  const sb3Path = info.outputPath("project.sb3");
  await download.saveAs(sb3Path);
  expect(download.suggestedFilename()).toMatch(/\.sb3$/);

  // 6. Proyek baru (skrip hilang) lalu muat .sb3 tadi.
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "File" }).click();
  await page.getByText("Baru", { exact: true }).click();
  await page.waitForFunction(() => {
    const t = (window as unknown as KodyWindow).__kody?.runtime.getEditingTarget();
    return !!t && Object.keys(t.blocks.toRecord()).length === 0;
  });
  await page.getByRole("button", { name: "File" }).click();
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByText("Buka .sb3").click();
  const chooser = await chooserPromise;
  await chooser.setFiles(sb3Path);
  await page.waitForFunction(() => {
    const t = (window as unknown as KodyWindow).__kody?.runtime.getEditingTarget();
    return !!t && Object.keys(t.blocks.toRecord()).length > 0;
  });
  expect(await scriptOpcodes(page)).toEqual([["event_whenflagclicked", "motion_movesteps", "looks_say"]]);
  const reloaded = await page.evaluate(() => {
    const t = (window as unknown as KodyWindow).__kody?.runtime.getEditingTarget();
    return t ? { name: t.sprite.name, x: t.x } : null;
  });
  expect(reloaded).toEqual({ name: "Kody", x: before + 10 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(SHOTS, `${tag}-4-reloaded.png`) });
});
