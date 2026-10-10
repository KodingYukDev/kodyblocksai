/**
 * Ukuran tampilan panggung (CSS px) untuk mode kecil / normal / layar penuh. Rasio 4:3 tetap,
 * koordinat logis 480x360 tidak berubah (renderer.resize hanya mengubah buffer).
 */

export type StageSizeMode = "small" | "normal" | "fullscreen";

export interface StageDisplaySize {
  width: number;
  height: number;
  /** Skala tampilan relatif ukuran native. */
  scale: number;
}

/**
 * Hitung ukuran panggung.
 * - small: setengah native (240x360 -> 240x180), seperti tombol "small stage" editor.
 * - normal: native, diperkecil bila wadah lebih sempit.
 * - fullscreen: sebesar mungkin di dalam wadah.
 */
export function computeStageSize(
  mode: StageSizeMode,
  container: { width: number; height: number },
  nativeSize: readonly [number, number] = [480, 360],
): StageDisplaySize {
  const [nw, nh] = nativeSize;
  const fit = Math.max(0, Math.min(container.width / nw, container.height / nh));
  let scale: number;
  if (mode === "small") scale = Math.min(0.5, fit);
  else if (mode === "normal") scale = Math.min(1, fit);
  else scale = fit;
  return { width: Math.floor(nw * scale), height: Math.floor(nh * scale), scale };
}
