/**
 * Anggaran CPU per frame dengan 300 sprite (jalur yang dipanggil VM tiap frame): update posisi/arah,
 * fencing, getBounds (pantul tepi), beberapa kueri menyentuh, dan draw (headless = tanpa GPU).
 * Batas 30 fps = 33 ms; kita menuntut rata-rata jauh di bawahnya agar sisa waktu cukup untuk VM & GPU.
 */
import { describe, expect, it } from "vitest";
import { KodyRenderer } from "../src/renderer-core";
import { solidBitmap } from "./helpers";

describe("performa 300 sprite", () => {
  it("rata-rata < 12 ms per frame untuk kerja renderer di CPU", () => {
    const r = new KodyRenderer();
    const costume = solidBitmap(48, 48, [80, 160, 255, 255]);
    for (let i = 0; i < 48 * 48; i++) if ((i % 48) + Math.floor(i / 48) < 12) costume.data[i * 4 + 3] = 0;
    const skin = r.createBitmapSkin(costume, 2);
    const pen = r.createPenSkin();
    r.updateDrawableSkinId(r.createDrawable("pen"), pen);
    const ids: number[] = [];
    for (let i = 0; i < 300; i++) {
      const id = r.createDrawable("sprite");
      r.updateDrawableSkinId(id, skin);
      ids.push(id);
    }
    const state = ids.map((_, i) => ({ x: ((i * 37) % 440) - 220, y: ((i * 53) % 320) - 160, dir: (i * 29) % 360 }));

    const frame = (f: number): void => {
      for (let i = 0; i < ids.length; i++) {
        const s = state[i] as { x: number; y: number; dir: number };
        const id = ids[i] as number;
        s.dir = (s.dir + 3) % 360;
        const rad = (s.dir * Math.PI) / 180;
        const [fx, fy] = r.getFencedPositionOfDrawable(id, [s.x + Math.cos(rad) * 4, s.y + Math.sin(rad) * 4]);
        s.x = fx;
        s.y = fy;
        r.updateDrawablePosition(id, [s.x, s.y]);
        r.updateDrawableDirectionScale(id, s.dir - 180, [100, 100]);
        r.getBounds(id);
      }
      // 20 sprite per frame bertanya "menyentuh sprite lain?" dan 5 "menyentuh warna?"
      for (let k = 0; k < 20; k++) r.isTouchingDrawables(ids[(f * 20 + k) % ids.length] as number, [ids[0] as number, ids[1] as number]);
      for (let k = 0; k < 5; k++) r.isTouchingColor(ids[(f * 5 + k) % ids.length] as number, [255, 0, 0]);
      r.penLine(pen, { color4f: [1, 0, 0, 1], diameter: 3 }, -100, f % 100, 100, f % 100);
      r.draw();
    };

    for (let f = 0; f < 5; f++) frame(f);
    const frames = 60;
    const t0 = performance.now();
    for (let f = 0; f < frames; f++) frame(f);
    const avg = (performance.now() - t0) / frames;
    console.log(`[renderer perf] 300 sprite: rata-rata ${avg.toFixed(2)} ms/frame (CPU, headless)`);
    expect(avg).toBeLessThan(12);
  });
});
