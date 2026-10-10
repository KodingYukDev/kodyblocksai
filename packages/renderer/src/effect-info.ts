/**
 * Daftar efek grafis + konversi nilai blok -> uniform shader.
 * Port scratch-render 1.2.115 `src/ShaderManager.js` (EFFECT_INFO, EFFECTS, DRAW_MODE) - BSD-3-Clause.
 */
import type { GraphicEffect } from "@kody/engine";

export interface EffectInfo {
  uniformName: UniformName;
  mask: number;
  converter: (x: number) => number;
  /** Efek mengubah bentuk -> convex hull harus dihitung ulang. */
  shapeChanges: boolean;
}

export type UniformName = "u_color" | "u_fisheye" | "u_whirl" | "u_pixelate" | "u_mosaic" | "u_brightness" | "u_ghost";

export const EFFECT_INFO: Readonly<Record<GraphicEffect, EffectInfo>> = {
  color: { uniformName: "u_color", mask: 1 << 0, converter: (x) => (x / 200) % 1, shapeChanges: false },
  fisheye: { uniformName: "u_fisheye", mask: 1 << 1, converter: (x) => Math.max(0, (x + 100) / 100), shapeChanges: true },
  whirl: { uniformName: "u_whirl", mask: 1 << 2, converter: (x) => (-x * Math.PI) / 180, shapeChanges: true },
  pixelate: { uniformName: "u_pixelate", mask: 1 << 3, converter: (x) => Math.abs(x) / 10, shapeChanges: true },
  mosaic: {
    uniformName: "u_mosaic",
    mask: 1 << 4,
    converter: (x) => {
      const v = Math.round((Math.abs(x) + 10) / 10);
      return Math.max(1, Math.min(v, 512));
    },
    shapeChanges: true,
  },
  brightness: {
    uniformName: "u_brightness",
    mask: 1 << 5,
    converter: (x) => Math.max(-100, Math.min(x, 100)) / 100,
    shapeChanges: false,
  },
  ghost: {
    uniformName: "u_ghost",
    mask: 1 << 6,
    converter: (x) => 1 - Math.max(0, Math.min(x, 100)) / 100,
    shapeChanges: false,
  },
};

/** Urutan efek = urutan bit (sama dengan Object.keys(EFFECT_INFO) di scratch-render). */
export const EFFECTS: readonly GraphicEffect[] = ["color", "fisheye", "whirl", "pixelate", "mosaic", "brightness", "ghost"];

/** Efek yang memakai sampling linear pada SVG (lihat SVGSkin.useNearest). */
export const DISTORTION_EFFECTS_MASK =
  EFFECT_INFO.fisheye.mask | EFFECT_INFO.whirl.mask | EFFECT_INFO.pixelate.mask | EFFECT_INFO.mosaic.mask;

/** Nilai efek dalam satuan shader (sesudah konversi dari nilai blok). */
export interface EffectUniforms {
  u_color: number;
  u_fisheye: number;
  u_whirl: number;
  u_pixelate: number;
  u_mosaic: number;
  u_brightness: number;
  u_ghost: number;
}

export function defaultEffectUniforms(): EffectUniforms {
  return {
    u_color: EFFECT_INFO.color.converter(0),
    u_fisheye: EFFECT_INFO.fisheye.converter(0),
    u_whirl: EFFECT_INFO.whirl.converter(0),
    u_pixelate: EFFECT_INFO.pixelate.converter(0),
    u_mosaic: EFFECT_INFO.mosaic.converter(0),
    u_brightness: EFFECT_INFO.brightness.converter(0),
    u_ghost: EFFECT_INFO.ghost.converter(0),
  };
}

/** Konversi nilai blok -> uniform shader (ShaderManager.EFFECT_INFO converter). */
export function effectToUniform(effect: GraphicEffect, value: number): number {
  return EFFECT_INFO[effect].converter(value);
}

/** Mode gambar ShaderManager.DRAW_MODE. */
export type DrawMode = "default" | "straightAlpha" | "silhouette" | "colorMask" | "line" | "background";
