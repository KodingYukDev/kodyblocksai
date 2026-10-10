/**
 * Generator + penjaga konsistensi pustaka.
 * - `KODY_WRITE_LIBRARY=1 npx vitest run app/src/library/generate-library.test.ts`
 *   menulis ulang app/public/assets/library/ (library.json + <md5>.svg/.wav).
 * - Tanpa variabel itu, tes memastikan isi folder public identik dengan hasil generator.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildLibrary, serializeCatalog } from "./catalog-build";
import { md5 } from "./md5";

const OUT_DIR = fileURLToPath(new URL("../../public/assets/library/", import.meta.url));
const built = buildLibrary();
const json = serializeCatalog(built.catalog);

if (process.env.KODY_WRITE_LIBRARY === "1") {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const name of readdirSync(OUT_DIR)) {
    if (/^[0-9a-f]{32}\.(svg|wav)$/.test(name) || name === "library.json") rmSync(join(OUT_DIR, name));
  }
  for (const [name, data] of built.files) writeFileSync(join(OUT_DIR, name), data);
  writeFileSync(join(OUT_DIR, "library.json"), json);
}

describe("pustaka aset", () => {
  const { catalog } = built;

  it("jumlah minimum: 30 sprite, 20 latar, 30 suara", () => {
    expect(catalog.sprites.length).toBeGreaterThanOrEqual(30);
    expect(catalog.backdrops.length).toBeGreaterThanOrEqual(20);
    expect(catalog.sounds.length).toBeGreaterThanOrEqual(30);
    expect(catalog.costumes.length).toBe(catalog.sprites.reduce((n, s) => n + s.costumes.length, 0));
  });

  it("id unik per jenis & setiap entri punya kategori terdaftar", () => {
    for (const list of [catalog.sprites, catalog.costumes, catalog.backdrops, catalog.sounds]) {
      const ids = list.map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
    const spriteCats = new Set(catalog.categories.sprite.map((c) => c.id));
    for (const s of catalog.sprites) expect(spriteCats.has(s.category)).toBe(true);
  });

  it("deterministik: dua kali build menghasilkan md5 yang sama", () => {
    const again = buildLibrary();
    expect(serializeCatalog(again.catalog)).toBe(json);
  });

  it("aset orisinal: tidak ada rujukan ke aset/merek Scratch", () => {
    const dec = new TextDecoder();
    for (const [name, data] of built.files) {
      if (!name.endsWith(".svg")) continue;
      const text = dec.decode(data);
      expect(text).not.toMatch(/scratch|<script|\son[a-z]+=|xlink:href="http|href="http/i);
    }
    expect(json).not.toMatch(/scratch/i);
  });

  it("suara: WAV mono 22050 Hz, durasi wajar, tidak hening", () => {
    for (const s of catalog.sounds) {
      expect(s.sound.rate).toBe(22050);
      expect(s.sound.sampleCount).toBeGreaterThan(200);
      expect(s.sound.sampleCount).toBeLessThan(22050 * 2);
      const data = built.files.get(s.sound.md5ext);
      expect(data?.length).toBe(44 + s.sound.sampleCount * 2);
    }
  });

  it("latar 480x360 dengan pusat 240,180", () => {
    for (const b of catalog.backdrops) {
      expect(b.costume.rotationCenterX).toBe(240);
      expect(b.costume.rotationCenterY).toBe(180);
      const text = new TextDecoder().decode(built.files.get(b.costume.md5ext));
      expect(text).toContain('viewBox="0 0 480 360"');
    }
  });

  it("folder public identik dengan hasil generator", () => {
    const jsonPath = join(OUT_DIR, "library.json");
    expect(existsSync(jsonPath), "jalankan generator dengan KODY_WRITE_LIBRARY=1").toBe(true);
    expect(readFileSync(jsonPath, "utf8")).toBe(json);
    for (const [name] of built.files) {
      const data = new Uint8Array(readFileSync(join(OUT_DIR, name)));
      expect(md5(data)).toBe(name.split(".")[0]);
    }
    const extra = readdirSync(OUT_DIR).filter((n) => n !== "library.json" && !built.files.has(n));
    expect(extra).toEqual([]);
  });
});
