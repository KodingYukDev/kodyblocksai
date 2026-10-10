/**
 * Pabrik renderer: WebGL bila tersedia, cadangan Canvas2D, atau headless (tes/Node).
 * Semua geometri & tabrakan identik di ketiga mode karena dikerjakan KodyRenderer di CPU.
 */
import type { RenderBackend } from "./backends/backend";
import { HeadlessBackend } from "./backends/backend";
import { Canvas2DBackend } from "./backends/canvas2d-backend";
import { WebGLBackend, getWebGLContext } from "./backends/webgl-backend";
import { KodyRenderer } from "./renderer-core";
import type { RendererOptions } from "./types";

function chooseBackend(opts: RendererOptions): RenderBackend {
  const canvas = opts.canvas;
  const want = opts.headless ? "headless" : opts.backend ?? "auto";
  if (want === "headless" || !canvas) return new HeadlessBackend();
  if (want === "auto" || want === "webgl") {
    const gl = getWebGLContext(canvas);
    if (gl) return new WebGLBackend(canvas, gl);
    if (want === "webgl") throw new Error("Could not get WebGL context: this browser or environment may not support WebGL.");
  }
  const ctx = canvas.getContext("2d", { alpha: false });
  if (ctx) return new Canvas2DBackend(canvas, ctx);
  return new HeadlessBackend();
}

/** Apakah WebGL tersedia di lingkungan ini (RenderWebGL.isSupported). */
export function isWebGLSupported(canvas?: HTMLCanvasElement): boolean {
  if (typeof document === "undefined" && !canvas) return false;
  try {
    return getWebGLContext(canvas ?? document.createElement("canvas")) !== null;
  } catch {
    return false;
  }
}

export function createRenderer(opts: RendererOptions): KodyRenderer {
  const backend = chooseBackend(opts);
  const renderer = new KodyRenderer({
    canvas: opts.canvas ?? null,
    backend,
    ...(opts.xLeft !== undefined ? { xLeft: opts.xLeft } : {}),
    ...(opts.xRight !== undefined ? { xRight: opts.xRight } : {}),
    ...(opts.yBottom !== undefined ? { yBottom: opts.yBottom } : {}),
    ...(opts.yTop !== undefined ? { yTop: opts.yTop } : {}),
    ...(opts.onAsyncLoad ? { onAsyncLoad: opts.onAsyncLoad } : {}),
    ...(opts.setCssSize !== undefined ? { setCssSize: opts.setCssSize } : {}),
  });
  if (backend.kind !== "headless") {
    const [w, h] = renderer.getNativeSize();
    renderer.resize(w, h);
  }
  return renderer;
}
