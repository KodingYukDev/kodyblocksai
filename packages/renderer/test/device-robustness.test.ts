/**
 * Ketahanan perangkat: batas devicePixelRatio/ukuran buffer (iPad/iPhone) dan pemulihan konteks WebGL
 * yang hilang (Safari iPad membuang konteks saat app di latar belakang atau memori GPU penuh).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { HeadlessBackend } from "../src/backends/backend";
import { WebGLBackend } from "../src/backends/webgl-backend";
import { KodyRenderer, MAX_BUFFER_DIMENSION, MAX_PIXEL_RATIO, bufferRatio } from "../src/renderer-core";

describe("bufferRatio", () => {
  it("dpr dibatasi MAX_PIXEL_RATIO", () => {
    expect(bufferRatio(480, 360, 1)).toBe(1);
    expect(bufferRatio(480, 360, 2)).toBe(2);
    expect(bufferRatio(480, 360, 3)).toBe(MAX_PIXEL_RATIO);
  });
  it("sisi buffer terpanjang tidak melebihi MAX_BUFFER_DIMENSION", () => {
    const r = bufferRatio(1366, 1024, 2);
    expect(1366 * r).toBeLessThanOrEqual(MAX_BUFFER_DIMENSION + 1e-9);
    expect(r).toBeLessThan(2);
  });
  it("dpr tidak valid -> 1", () => {
    expect(bufferRatio(480, 360, Number.NaN)).toBe(1);
    expect(bufferRatio(480, 360, 0)).toBe(1);
  });
});

describe("KodyRenderer.resize", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("memakai rasio yang dibatasi dan mengabaikan ukuran NaN/0", () => {
    vi.stubGlobal("window", { devicePixelRatio: 3 });
    const backend = new HeadlessBackend();
    const r = new KodyRenderer({ backend });
    r.resize(480, 360);
    expect(backend.getBufferSize()).toEqual([960, 720]);
    r.resize(Number.NaN, 0);
    expect(backend.getBufferSize()).toEqual([960, 720]);
    r.resize(4000, 3000);
    const [w, h] = backend.getBufferSize();
    expect(Math.max(w, h)).toBeLessThanOrEqual(MAX_BUFFER_DIMENSION);
  });
});

/** WebGL palsu: semua method jadi no-op yang dihitung; cukup untuk jalur setup/draw/kehilangan konteks. */
function fakeGL() {
  const calls = new Map<string, number>();
  let lost = false;
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_t, prop) {
      if (typeof prop !== "string") return undefined;
      if (/^[A-Z_0-9]+$/.test(prop)) return 1;
      return (..._args: unknown[]) => {
        calls.set(prop, (calls.get(prop) ?? 0) + 1);
        if (prop === "isContextLost") return lost;
        if (prop === "getShaderParameter" || prop === "getProgramParameter") return true;
        if (prop === "getAttribLocation") return 0;
        return {};
      };
    },
  };
  const gl = new Proxy({}, handler) as unknown as WebGLRenderingContext;
  return {
    gl,
    count: (name: string) => calls.get(name) ?? 0,
    setLost: (v: boolean) => {
      lost = v;
    },
  };
}

function fakeCanvas(): HTMLCanvasElement {
  const target = new EventTarget() as EventTarget & { width: number; height: number; toDataURL: () => string };
  target.width = 480;
  target.height = 360;
  target.toDataURL = () => "data:image/png;base64,";
  return target as unknown as HTMLCanvasElement;
}

const frame = {
  drawables: [],
  nativeSize: [480, 360] as const,
  xLeft: -240,
  xRight: 240,
  yBottom: -180,
  yTop: 180,
  backgroundColor4f: [1, 1, 1, 1] as const,
};

describe("WebGLBackend kehilangan konteks", () => {
  it("berhenti menggambar saat konteks hilang dan membangun ulang sumber daya saat pulih", () => {
    const fake = fakeGL();
    const canvas = fakeCanvas();
    const backend = new WebGLBackend(canvas, fake.gl);
    backend.drawFrame(frame);
    expect(fake.count("clear")).toBe(1);
    const buffersBefore = fake.count("createBuffer");

    const lostEvent = new Event("webglcontextlost", { cancelable: true });
    fake.setLost(true);
    canvas.dispatchEvent(lostEvent);
    // preventDefault wajib agar browser mau mengirim webglcontextrestored.
    expect(lostEvent.defaultPrevented).toBe(true);
    backend.drawFrame(frame);
    expect(fake.count("clear")).toBe(1);

    fake.setLost(false);
    canvas.dispatchEvent(new Event("webglcontextrestored"));
    expect(fake.count("createBuffer")).toBe(buffersBefore + 2);
    backend.drawFrame(frame);
    expect(fake.count("clear")).toBe(2);
    backend.dispose();
  });
});
