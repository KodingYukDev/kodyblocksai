/**
 * Tes diferensial: renderer kita vs jalur CPU scratch-render 1.2.115 asli (BSD-3) pada adegan acak.
 * Membandingkan getBounds (convex hull), getAABB, fencing, isTouchingDrawables, isTouchingColor
 * (dengan & tanpa mask), pick, dan uji titik, termasuk efek distorsi/warna/ghost.
 */
import { describe, expect, it } from "vitest";
import type { GraphicEffect } from "@kody/engine";
import { KodyRenderer } from "../src/renderer-core";
import { createPixelData } from "../src/pixel-source";
import type { PixelData } from "../src/pixel-source";
import { loadOracle, makeOracleRenderer, makeOracleSkin, oracleAvailable } from "./scratch-render-oracle";

/** PRNG deterministik (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PALETTE: [number, number, number][] = [
  [255, 0, 0], [0, 200, 0], [0, 0, 255], [255, 200, 0], [120, 40, 200], [0, 0, 0], [255, 255, 255],
];

/** Bitmap acak: elips/persegi/cincin berwarna dengan tepi semi-transparan. */
function randomBitmap(r: () => number): PixelData {
  const w = 4 + Math.floor(r() * 60);
  const h = 4 + Math.floor(r() * 60);
  const img = createPixelData(w, h);
  const kind = Math.floor(r() * 3);
  const color = PALETTE[Math.floor(r() * PALETTE.length)] as [number, number, number];
  const color2 = PALETTE[Math.floor(r() * PALETTE.length)] as [number, number, number];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (x + 0.5) / w - 0.5;
      const ny = (y + 0.5) / h - 0.5;
      const d = Math.sqrt(nx * nx + ny * ny);
      let a = 0;
      if (kind === 0) a = d < 0.45 ? 255 : d < 0.5 ? 128 : 0;
      else if (kind === 1) a = Math.abs(nx) < 0.4 && Math.abs(ny) < 0.3 ? 255 : 0;
      else a = d > 0.25 && d < 0.48 ? 255 : 0;
      const c = x < w / 2 ? color : color2;
      const o = (y * w + x) * 4;
      img.data[o] = c[0];
      img.data[o + 1] = c[1];
      img.data[o + 2] = c[2];
      img.data[o + 3] = a;
    }
  }
  return img;
}

const EFFECT_NAMES: GraphicEffect[] = ["color", "fisheye", "whirl", "pixelate", "mosaic", "brightness", "ghost"];

interface SceneSpec {
  bitmap: PixelData;
  resolution: number;
  center?: [number, number];
  position: [number, number];
  direction: number;
  scale: [number, number];
  visible: boolean;
  effects: Partial<Record<GraphicEffect, number>>;
}

function randomSpec(r: () => number, spread: number): SceneSpec {
  const bitmap = randomBitmap(r);
  const resolution = r() < 0.5 ? 1 : 2;
  const effects: Partial<Record<GraphicEffect, number>> = {};
  if (r() < 0.4) {
    const e = EFFECT_NAMES[Math.floor(r() * EFFECT_NAMES.length)] as GraphicEffect;
    effects[e] = Math.round((r() * 2 - 1) * 120);
  }
  const flip = r() < 0.2 ? -1 : 1;
  const s = 30 + Math.round(r() * 250);
  const spec: SceneSpec = {
    bitmap,
    resolution,
    position: [Math.round((r() * 2 - 1) * spread) + (r() < 0.3 ? 0.4 : 0), Math.round((r() * 2 - 1) * spread)],
    direction: r() < 0.3 ? 90 : Math.round(r() * 360 - 179),
    scale: [s * flip, s],
    visible: r() > 0.1,
    effects,
  };
  if (r() < 0.5) spec.center = [Math.round(r() * bitmap.width / resolution), Math.round(r() * bitmap.height / resolution)];
  return spec;
}

describe.skipIf(!oracleAvailable)("paritas dengan scratch-render 1.2.115 (CPU)", () => {
  const o = oracleAvailable ? loadOracle() : null;

  function build(specs: SceneSpec[]) {
    const oracle = o as NonNullable<typeof o>;
    const ours = new KodyRenderer();
    const ref = makeOracleRenderer(oracle);
    specs.forEach((spec, i) => {
      const skinId = ours.createBitmapSkin(spec.bitmap, spec.resolution, spec.center);
      const id = ours.createDrawable("sprite");
      expect(id).toBe(i);
      ours.updateDrawableSkinId(id, skinId);
      ours.updateDrawableProperties(id, {
        position: spec.position,
        direction: spec.direction,
        scale: spec.scale,
        visible: spec.visible,
        ...spec.effects,
      });

      const skin = makeOracleSkin(oracle, i, spec.bitmap, spec.resolution, spec.center);
      const d = new oracle.Drawable(i);
      d.skin = skin;
      d.updateProperties({ position: spec.position, direction: spec.direction, scale: spec.scale, visible: spec.visible, ...spec.effects });
      ref._allSkins[i] = skin;
      ref._allDrawables[i] = d;
      ref._drawList.push(i);
    });
    const refBounds = (id: number) => {
      const d = ref._allDrawables[id];
      if (d.needsConvexHullPoints()) d.setConvexHullPoints(ref._getConvexHullPointsForDrawable(id));
      const b = d.getFastBounds();
      return { left: b.left, right: b.right, top: b.top, bottom: b.bottom };
    };
    return { ours, ref, refBounds };
  }

  it("getBounds, getAABB, dan fencing identik di 150 sprite acak", () => {
    const r = rng(12345);
    const specs = Array.from({ length: 150 }, () => randomSpec(r, 300));
    const { ours, ref, refBounds } = build(specs);
    for (let id = 0; id < specs.length; id++) {
      expect(ours.getBounds(id), `bounds #${id}`).toEqual(refBounds(id));
      const a = ref._allDrawables[id].getAABB();
      expect(ours.getAABB(id), `aabb #${id}`).toEqual({ left: a.left, right: a.right, top: a.top, bottom: a.bottom });
      for (const target of [[1000, 0], [-1000, 500], [0, -999], [237.6, 179.2]] as [number, number][]) {
        expect(ours.getFencedPositionOfDrawable(id, target)).toEqual(ref.getFencedPositionOfDrawable(id, target));
      }
    }
  });

  it("isTouchingDrawables & isTouchingColor (dengan/tanpa mask) identik", () => {
    const tally: Record<"touch" | "color" | "mask", [number, number]> = { touch: [0, 0], color: [0, 0], mask: [0, 0] };
    const count = (k: keyof typeof tally, v: boolean): boolean => {
      tally[k][v ? 1 : 0]++;
      return v;
    };
    for (let seed = 1; seed <= 25; seed++) {
      const r = rng(seed * 7919);
      const specs = Array.from({ length: 6 }, () => randomSpec(r, 60));
      const { ours, ref } = build(specs);
      for (let id = 0; id < specs.length; id++) {
        expect(ours.isTouchingDrawables(id), `drawables seed ${seed} #${id}`).toBe(count("touch", ref.isTouchingDrawables(id)));
        const others = [0, 1, 2].filter((x) => x !== id);
        expect(ours.isTouchingDrawables(id, others)).toBe(ref.isTouchingDrawables(id, others));
        for (const c of PALETTE) {
          expect(ours.isTouchingColor(id, c), `color ${c} seed ${seed} #${id}`).toBe(count("color", ref.isTouchingColor(id, c)));
          const mask = PALETTE[(id + seed) % PALETTE.length] as [number, number, number];
          expect(ours.isTouchingColor(id, c, mask), `mask ${mask}->${c} seed ${seed} #${id}`).toBe(count("mask", ref.isTouchingColor(id, c, mask)));
        }
      }
    }
    // Pastikan tes tidak hampa: setiap kueri menghasilkan campuran true/false.
    for (const [k, [f, t]] of Object.entries(tally)) {
      expect(f, `${k} false`).toBeGreaterThan(0);
      expect(t, `${k} true`).toBeGreaterThan(0);
    }
  });

  it("pick dan uji titik identik", () => {
    const r = rng(424242);
    const specs = Array.from({ length: 12 }, () => randomSpec(r, 120));
    const { ours, ref } = build(specs);
    const hits = new Set<number>();
    for (let i = 0; i < 400; i++) {
      const sx = (r() * 2 - 1) * 200;
      const sy = (r() * 2 - 1) * 160;
      const w = 1 + Math.floor(r() * 3);
      const h = 1 + Math.floor(r() * 3);
      const refPick = ref.pick(sx + 240, 180 - sy, w, h);
      const expected = refPick === false ? -1 : refPick;
      hits.add(expected);
      expect(ours.pick(sx, sy, w, h), `pick ${sx},${sy}`).toBe(expected);
      const id = Math.floor(r() * specs.length);
      expect(ours.isTouchingPoint(id, sx, sy)).toBe(ref.drawableTouching(id, sx + 240, 180 - sy));
    }
    expect(hits.has(-1)).toBe(true);
    expect(hits.size).toBeGreaterThan(4);
  });

  it("transformColor & sampleColor4b identik untuk semua efek", () => {
    const oracle = o as NonNullable<typeof o>;
    const r = rng(99);
    for (let n = 0; n < 40; n++) {
      const spec = randomSpec(r, 0);
      spec.visible = true;
      spec.effects = {};
      for (const e of EFFECT_NAMES) if (r() < 0.5) spec.effects[e] = Math.round((r() * 2 - 1) * 150);
      const { ours, ref } = build([spec]);
      const ourD = ours.getDrawable(0);
      const refD = ref._allDrawables[0];
      ourD?.updateCPURenderAttributes();
      refD.updateCPURenderAttributes();
      for (let k = 0; k < 50; k++) {
        const p = [Math.round((r() * 2 - 1) * 60), Math.round((r() * 2 - 1) * 60), 0];
        const a = new Uint8ClampedArray(4);
        const b = new Uint8ClampedArray(4);
        const { Drawable: OurDrawable } = { Drawable: (ourD as NonNullable<typeof ourD>).constructor as typeof import("../src/drawable").Drawable };
        OurDrawable.sampleColor4b(p, ourD as NonNullable<typeof ourD>, a);
        oracle.Drawable.sampleColor4b(p, refD, b);
        expect(Array.from(a)).toEqual(Array.from(b));
      }
    }
  });
});
