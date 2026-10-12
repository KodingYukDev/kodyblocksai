/**
 * Build produksi: anak melatih AI sendiri.
 * - Gambar: kamera palsu Chromium (--use-fake-device-for-media-stream), 2 kelas, latih, lihat kepercayaan,
 *   pakai kelas di blok, simpan .sb3, buka lagi -> model masih ada.
 * - Teks: latih 2 kelas, pakai di blok "label dari teks".
 * - Semua contoh proyek AI (Belajar AI -> Tutorial & Contoh AI) terbuka.
 */
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import {
  addExtension,
  blockText,
  expectNoHorizontalScroll,
  expectNoProblems,
  hold,
  isChromium,
  loadProject,
  menu,
  newProject,
  openApp,
  openCategory,
  paletteBlock,
  press,
  runReporterFromPalette,
  saveProject,
  scriptOpcodes,
  stubShare,
  watchProblems,
} from "./helpers";

async function openLab(page: Page, info: TestInfo): Promise<ReturnType<Page["locator"]>> {
  await menu(page, info, "Belajar AI", "Latih AI-mu (AI Lab)");
  const lab = page.getByTestId("ai-lab");
  await expect(lab).toBeVisible({ timeout: 60_000 });
  return lab;
}

async function renameClass(page: Page, lab: ReturnType<Page["locator"]>, index: number, name: string): Promise<void> {
  const input = lab.getByRole("textbox", { name: "Nama kelas" }).nth(index);
  await input.fill(name);
  await input.press("Enter");
  await expect(lab.getByRole("region", { name: `Kelas ${name}` })).toBeVisible();
}

async function closeLab(page: Page, info: TestInfo, lab: ReturnType<Page["locator"]>): Promise<void> {
  await press(page, info, lab.getByRole("button", { name: "Tutup", exact: true }));
  await expect(lab).toHaveCount(0);
}

test("latih AI gambar dengan kamera, pakai di blok, simpan & buka lagi", async ({ page, context }, info) => {
  test.skip(!isChromium(info), "kamera palsu hanya ada di Chromium");
  const problems = await watchProblems(page);
  await stubShare(page);
  await context.grantPermissions(["camera", "microphone"]);
  await openApp(page);

  await addExtension(page, info, "aiImage");
  await expect(paletteBlock(page, "classConfidence")).toBeVisible({ timeout: 30_000 });

  const lab = await openLab(page, info);
  await expectNoHorizontalScroll(page);
  await renameClass(page, lab, 0, "merah");
  await renameClass(page, lab, 1, "biru");

  await press(page, info, lab.getByRole("button", { name: "Nyalakan kamera" }));
  await expect(lab.getByRole("button", { name: "Matikan kamera" })).toBeVisible({ timeout: 30_000 });

  for (const name of ["merah", "biru"]) {
    const card = lab.getByRole("region", { name: `Kelas ${name}` });
    // Model MobileNet dimuat saat contoh pertama; tahan sampai minimal 6 contoh terkumpul.
    for (let i = 0; i < 12; i++) {
      await hold(page, info, card.getByRole("button", { name: /Tahan untuk merekam|Merekam/ }), 1500);
      const n = Number(/(\d+) contoh/.exec((await card.locator(".kal-count").textContent()) ?? "")?.[1] ?? 0);
      if (n >= 6) break;
    }
    await expect(card.locator(".kal-count")).toHaveText(/^(\d{2,}|[6-9]) contoh/, { timeout: 30_000 });
  }

  await press(page, info, lab.getByRole("button", { name: "Latih model" }));
  await expect(lab.getByText("Model siap dipakai di blok")).toBeVisible({ timeout: 90_000 });
  await expect(lab.getByText(/Perkiraan ketepatan: \d+%/)).toBeVisible();

  // Panel uji: batang kepercayaan per kelas terisi dari kamera.
  const meters = lab.getByRole("meter");
  await expect(meters).toHaveCount(2, { timeout: 30_000 });
  await expect
    .poll(async () => (await meters.evaluateAll((els) => els.map((e) => Number(e.getAttribute("aria-valuenow") ?? 0)))).reduce((a, b) => a + b, 0), {
      timeout: 30_000,
    })
    .toBeGreaterThan(50);
  await page.screenshot({ path: info.outputPath("lab-trained.png") });
  await closeLab(page, info, lab);

  // Kelas terlatih muncul di dropdown blok, dan blok jalan.
  await openCategory(page, info, "Klasifikasi Gambar");
  const conf = paletteBlock(page, "classConfidence");
  await expect.poll(() => blockText(conf)).toMatch(/merah|biru/);
  // Seperti anak: jalankan "mulai klasifikasi kamera", lalu klik reporter.
  await runReporterFromPalette(page, info, paletteBlock(page, "startAuto"), 0, false);
  await page.waitForTimeout(2500);
  const label = await runReporterFromPalette(page, info, paletteBlock(page, "classLabel"), 1);
  expect(["merah", "biru"]).toContain(label);
  const value = await runReporterFromPalette(page, info, conf, 2);
  expect(Number(value), `kepercayaan "${value}"`).toBeGreaterThanOrEqual(0);
  expect(Number(value)).toBeLessThanOrEqual(100);
  expect(value).not.toBe("");

  // Simpan, kosongkan, buka lagi: model dan kelas masih ada.
  const file = await saveProject(page, info);
  await newProject(page, info);
  await expect.poll(() => scriptOpcodes(page)).toEqual([]);
  await loadProject(page, info, file);
  await expect.poll(() => scriptOpcodes(page), { timeout: 30_000 }).toHaveLength(3);
  await openCategory(page, info, "Klasifikasi Gambar");
  await expect.poll(() => blockText(paletteBlock(page, "classConfidence")), { timeout: 30_000 }).toMatch(/merah|biru/);
  const lab2 = await openLab(page, info);
  await expect(lab2.getByText("Model siap dipakai di blok")).toBeVisible({ timeout: 30_000 });
  await expect(lab2.getByRole("textbox", { name: "Nama kelas" }).first()).toHaveValue("merah");
  await expect(lab2.getByRole("textbox", { name: "Nama kelas" }).nth(1)).toHaveValue("biru");
  await closeLab(page, info, lab2);
  await expectNoProblems(page, problems);
});

test("latih AI teks dan pakai di blok", async ({ page }, info) => {
  const problems = await watchProblems(page);
  await openApp(page);
  await addExtension(page, info, "aiText");
  const lab = await openLab(page, info);
  await press(page, info, lab.getByRole("tab", { name: "Teks" }));
  await renameClass(page, lab, 0, "sapaan");
  await renameClass(page, lab, 1, "pamit");
  const samples: Record<string, string[]> = {
    sapaan: ["halo", "halo teman", "hai halo apa kabar", "selamat pagi halo"],
    pamit: ["dadah", "sampai jumpa", "selamat tinggal", "aku pulang dulu dadah"],
  };
  for (const [cls, list] of Object.entries(samples)) {
    const input = lab.getByRole("textbox", { name: `Contoh kalimat untuk ${cls}` });
    for (const s of list) {
      await input.fill(s);
      await input.press("Enter");
    }
    await expect(lab.getByRole("region", { name: `Kelas ${cls}` }).locator(".kal-count")).toHaveText(/^4 contoh/);
  }
  await press(page, info, lab.getByRole("button", { name: "Latih model" }));
  await expect(lab.getByText("Model siap dipakai di blok")).toBeVisible({ timeout: 30_000 });
  // Uji langsung di panel.
  const test = lab.locator(".kal-side").getByRole("textbox").first();
  await test.fill("sampai jumpa besok");
  await expect(lab.getByRole("meter", { name: "pamit" })).toHaveAttribute("aria-valuenow", /^([5-9]\d|100)$/, { timeout: 10_000 });
  await expectNoHorizontalScroll(page);
  await closeLab(page, info, lab);

  await openCategory(page, info, "Klasifikasi Teks");
  const label = await runReporterFromPalette(page, info, paletteBlock(page, "classifyText"));
  expect(label).toBe("sapaan");
  await expect.poll(() => blockText(paletteBlock(page, "isTextClass"))).toMatch(/sapaan|pamit/);
  await expectNoProblems(page, problems);
});

test("semua contoh proyek AI bisa dibuka", async ({ page }, info) => {
  const problems = await watchProblems(page);
  await openApp(page);
  page.on("dialog", (d) => void d.accept());
  await menu(page, info, "Belajar AI", "Tutorial & Contoh AI");
  const dlg = page.locator(".kb-tutorials");
  await expect(dlg.locator(".kb-tutorials__card")).toHaveCount(6, { timeout: 30_000 });
  await expectNoHorizontalScroll(page);
  const titles = await dlg.locator(".kb-tutorials__card-title").allTextContents();
  for (const title of titles) {
    if (!(await dlg.count())) await menu(page, info, "Belajar AI", "Tutorial & Contoh AI");
    await press(page, info, dlg.locator(".kb-tutorials__card").filter({ hasText: title }));
    await press(page, info, dlg.getByRole("button", { name: "Buka contoh" }));
    await expect(dlg.getByText("Contoh sudah terbuka")).toBeVisible({ timeout: 60_000 });
    await press(page, info, dlg.getByRole("button", { name: "Mulai coding" }));
    await expect(dlg).toHaveCount(0);
    await expect(page.locator(".kb-menu-bar input").first()).toHaveValue(title);
    await expect.poll(() => scriptOpcodes(page).then((s) => s.length), { timeout: 30_000 }).toBeGreaterThan(0);
    // Skrip contoh tidak saling menumpuk.
    const overlaps = await page.evaluate(() => {
      const boxes = Array.from(document.querySelectorAll(".kb-main-svg g.kb-stack[data-top-id]"))
        .filter((s) => !s.parentElement?.closest("g.kb-stack"))
        .map((s) => s.getBoundingClientRect());
      let n = 0;
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i]!;
          const b = boxes[j]!;
          if (a.left < b.right - 2 && b.left < a.right - 2 && a.top < b.bottom - 2 && b.top < a.bottom - 2) n++;
        }
      return n;
    });
    expect(overlaps, `skrip bertumpuk di "${title}"`).toBe(0);
    await page.screenshot({ path: info.outputPath(`example-${titles.indexOf(title)}.png`) });
  }
  await expectNoProblems(page, problems);
});
