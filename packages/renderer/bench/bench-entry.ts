/**
 * Benchmark browser: 300 sprite bergerak + berputar + efek, digambar tiap requestAnimationFrame.
 * Hasil ditulis ke window.__bench. Dijalankan oleh bench/run-bench.mjs (Playwright).
 */
import { createRenderer } from "../src/index";
import type { BackendChoice } from "../src/types";

interface BenchResult {
  backend: string;
  frames: number;
  seconds: number;
  fps: number;
  avgDrawMs: number;
  avgCpuMs: number;
}

declare global {
  interface Window {
    __bench?: BenchResult | { error: string };
    __benchQuery?: string;
  }
}

function makeCostume(hue: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 96;
  c.height = 96;
  const ctx = c.getContext("2d") as CanvasRenderingContext2D;
  ctx.fillStyle = `hsl(${hue}, 80%, 55%)`;
  ctx.beginPath();
  ctx.arc(48, 48, 40, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.fillRect(40, 20, 16, 30);
  return c;
}

async function run(): Promise<void> {
  const params = new URLSearchParams(window.__benchQuery ?? location.search);
  const backend = (params.get("backend") ?? "auto") as BackendChoice;
  const count = Number(params.get("count") ?? 300);
  const durationMs = Number(params.get("ms") ?? 4000);
  const canvas = document.createElement("canvas");
  document.body.appendChild(canvas);
  const r = createRenderer({ canvas, backend });
  r.resize(480, 360);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 60"><rect x="5" y="5" width="70" height="50" rx="12" fill="#FF8C1A" stroke="#333" stroke-width="3"/></svg>`;
  const skins = [0, 60, 120, 200, 280].map((h) => r.createBitmapSkin(makeCostume(h), 2));
  skins.push(r.createSVGSkin(svg));
  const pen = r.createPenSkin();
  r.updateDrawableSkinId(r.createDrawable("pen"), pen);
  const ids: number[] = [];
  for (let i = 0; i < count; i++) {
    const id = r.createDrawable("sprite");
    r.updateDrawableSkinId(id, skins[i % skins.length] as number);
    if (i % 10 === 0) r.updateDrawableEffect(id, "color", (i * 7) % 200);
    if (i % 15 === 0) r.updateDrawableEffect(id, "ghost", 40);
    if (i % 25 === 0) r.updateDrawableEffect(id, "whirl", 90);
    ids.push(id);
  }
  await new Promise((res) => setTimeout(res, 300));

  let frames = 0;
  let drawMs = 0;
  let cpuMs = 0;
  const start = performance.now();
  await new Promise<void>((resolve) => {
    const tick = (): void => {
      const t0 = performance.now();
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i] as number;
        const t = (frames + i * 13) / 30;
        r.updateDrawablePosition(id, [Math.cos(t + i) * 200, Math.sin(t * 1.3 + i) * 150]);
        r.updateDrawableDirectionScale(id, (frames * 3 + i * 17) % 360, [60 + (i % 5) * 20, 60 + (i % 5) * 20]);
      }
      for (let k = 0; k < 10; k++) r.isTouchingDrawables(ids[(frames + k) % ids.length] as number);
      r.penLine(pen, { color4f: [0, 0, 1, 1], diameter: 2 }, -200, (frames % 300) - 150, 200, (frames % 300) - 150);
      const t1 = performance.now();
      r.draw();
      const t2 = performance.now();
      cpuMs += t1 - t0;
      drawMs += t2 - t1;
      frames++;
      if (t2 - start < durationMs) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
  const seconds = (performance.now() - start) / 1000;
  window.__bench = {
    backend: r.backendKind,
    frames,
    seconds,
    fps: frames / seconds,
    avgDrawMs: drawMs / frames,
    avgCpuMs: cpuMs / frames,
  };
}

run().catch((e: unknown) => {
  window.__bench = { error: e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e) };
});
