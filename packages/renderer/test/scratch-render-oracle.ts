/**
 * Memuat jalur CPU scratch-render 1.2.115 (BSD-3, `_reference/bsd3-local`) HANYA untuk tes diferensial.
 * Tidak pernah diimpor kode produksi. Konstruktor RenderWebGL (butuh WebGL) dilewati dengan
 * Object.create(prototype) lalu field yang dipakai jalur CPU diisi manual.
 */
import { existsSync } from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
export const SCRATCH_RENDER_SRC = path.resolve(repoRoot, "../_reference/bsd3-local/scratch-render/src");
const HULL_JS = path.resolve(repoRoot, "../kodyblocks/app/node_modules/hull.js/src/hull.js");
const TWGL = path.resolve(repoRoot, "node_modules/twgl.js/dist/5.x/twgl-full.js");
const STUB = path.resolve(here, "oracle-stub.cjs");

export const oracleAvailable = existsSync(path.join(SCRATCH_RENDER_SRC, "RenderWebGL.js")) && existsSync(HULL_JS);

/** ImageData minimal untuk Node (Silhouette.update memakai instanceof ImageData). */
class NodeImageData {
  readonly data: Uint8ClampedArray;
  constructor(
    dataOrWidth: Uint8ClampedArray | number,
    readonly width: number,
    readonly height: number = 0,
  ) {
    if (typeof dataOrWidth === "number") {
      this.height = width;
      this.width = dataOrWidth;
      this.data = new Uint8ClampedArray(this.width * this.height * 4);
    } else {
      this.data = dataOrWidth;
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export interface Oracle {
  Drawable: Any;
  Skin: Any;
  Rectangle: Any;
  RenderWebGL: Any;
  EffectTransform: Any;
  ImageData: typeof NodeImageData;
}

let cached: Oracle | null = null;

export function loadOracle(): Oracle {
  if (cached) return cached;
  const g = globalThis as Any;
  if (typeof g.ImageData === "undefined") g.ImageData = NodeImageData;
  const M = Module as Any;
  const original = M._resolveFilename;
  M._resolveFilename = function (request: string, parent: unknown, ...rest: unknown[]) {
    if (request === "twgl.js") return TWGL;
    if (request === "hull.js") return HULL_JS;
    if (request === "minilog" || request === "scratch-svg-renderer" || request.startsWith("!")) return STUB;
    return original.call(this, request, parent, ...rest);
  };
  try {
    const req = createRequire(path.join(SCRATCH_RENDER_SRC, "index.js"));
    cached = {
      Drawable: req("./Drawable.js"),
      Skin: req("./Skin.js"),
      Rectangle: req("./Rectangle.js"),
      RenderWebGL: req("./RenderWebGL.js"),
      EffectTransform: req("./EffectTransform.js"),
      ImageData: g.ImageData,
    };
  } finally {
    M._resolveFilename = original;
  }
  return cached;
}

/** Skin oracle bergaya BitmapSkin (useNearest = true, size = tekstur / resolusi) tanpa GPU. */
export function makeOracleSkin(o: Oracle, id: number, img: { width: number; height: number; data: Uint8ClampedArray }, resolution: number, center?: [number, number]): Any {
  const skin = new o.Skin(id);
  const imageData = new o.ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
  skin._silhouette.update(imageData);
  const size: [number, number] = [img.width / resolution, img.height / resolution];
  Object.defineProperty(skin, "size", { get: () => [size[0], size[1]] });
  skin.getTexture = () => ({});
  const c = center ?? [size[0] / 2, size[1] / 2];
  skin._rotationCenter[0] = c[0];
  skin._rotationCenter[1] = c[1];
  return skin;
}

/** RenderWebGL tanpa konstruktor (jalur CPU saja). */
export function makeOracleRenderer(o: Oracle): Any {
  const r = Object.create(o.RenderWebGL.prototype);
  r._allDrawables = [];
  r._allSkins = [];
  r._drawList = [];
  r._xLeft = -240;
  r._xRight = 240;
  r._yBottom = -180;
  r._yTop = 180;
  r._nativeSize = [480, 360];
  r._useGpuMode = "ForceCPU";
  r._backgroundColor3b = new Uint8ClampedArray([255, 255, 255]);
  r._gl = { canvas: { clientWidth: 480, clientHeight: 360 } };
  return r;
}
