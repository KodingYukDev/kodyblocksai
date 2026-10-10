/**
 * IMediaLoader app: memuat costume ke renderer dan sound ke audio engine.
 * Padanan scratch-vm import/load-costume.js (loadVector_/loadBitmap_) dan load-sound.js.
 * Renderer bisa belum ada (kanvas panggung belum terpasang): costume tetap dimuat tanpa skin.
 */
import type { AssetData, Costume, CostumeState, IAudioEngine, IMediaLoader, IRenderer, Sound, SoundState } from "@kody/engine";

const BITMAP_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  bmp: "image/bmp",
  gif: "image/gif",
};

export interface MediaLoaderDeps {
  getRenderer(): IRenderer | null;
  getAudio(): IAudioEngine | null;
  /** Ubah bytes gambar jadi sumber bitmap (default createImageBitmap). Untuk tes. */
  decodeBitmap?: (bytes: Uint8Array, mime: string) => Promise<ImageBitmap | HTMLImageElement | HTMLCanvasElement | ImageData>;
}

export function sliceBuffer(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

async function defaultDecodeBitmap(bytes: Uint8Array, mime: string): Promise<ImageBitmap> {
  const blob = new Blob([sliceBuffer(bytes)], { type: mime });
  return createImageBitmap(blob);
}

function noSkin(state: CostumeState, asset: AssetData | null): Costume {
  return { ...state, skinId: -1, size: [0, 0], asset };
}

export function createMediaLoader(deps: MediaLoaderDeps): IMediaLoader {
  const decodeBitmap = deps.decodeBitmap ?? defaultDecodeBitmap;

  const loadVector = (renderer: IRenderer, state: CostumeState, asset: AssetData): Costume => {
    const text = new TextDecoder().decode(asset.data);
    const hasCenter = typeof state.rotationCenterX === "number" && typeof state.rotationCenterY === "number";
    const skinId = hasCenter
      ? renderer.createSVGSkin(text, [state.rotationCenterX, state.rotationCenterY])
      : renderer.createSVGSkin(text);
    const size = renderer.getSkinSize(skinId);
    const costume: Costume = { ...state, skinId, size: [size[0], size[1]], asset };
    if (!hasCenter) {
      const c = renderer.getSkinRotationCenter(skinId);
      costume.rotationCenterX = c[0];
      costume.rotationCenterY = c[1];
    }
    return costume;
  };

  const loadBitmap = async (renderer: IRenderer, state: CostumeState, asset: AssetData): Promise<Costume> => {
    const mime = BITMAP_MIME[state.dataFormat] ?? "image/png";
    const image = await decodeBitmap(asset.data, mime);
    const res = state.bitmapResolution || 2;
    const hasCenter = typeof state.rotationCenterX === "number" && typeof state.rotationCenterY === "number";
    const center: [number, number] | undefined = hasCenter ? [state.rotationCenterX / res, state.rotationCenterY / res] : undefined;
    const skinId = center ? renderer.createBitmapSkin(image, res, center) : renderer.createBitmapSkin(image, res);
    const size = renderer.getSkinSize(skinId);
    const costume: Costume = { ...state, bitmapResolution: res, skinId, size: [size[0], size[1]], asset };
    if (!hasCenter) {
      const c = renderer.getSkinRotationCenter(skinId);
      costume.rotationCenterX = c[0] * res;
      costume.rotationCenterY = c[1] * res;
    }
    return costume;
  };

  return {
    async loadCostume(state, asset) {
      const renderer = deps.getRenderer();
      if (!renderer || !asset) return noSkin(state, asset);
      if (state.dataFormat === "svg") return loadVector(renderer, state, asset);
      return loadBitmap(renderer, state, asset);
    },
    async loadSound(state: SoundState, asset: AssetData | null): Promise<Sound> {
      const audio = deps.getAudio();
      if (!audio || !asset) return { ...state, soundId: "", asset };
      const decoded = await audio.decodeSound(sliceBuffer(asset.data), state.dataFormat);
      return { ...state, soundId: decoded.soundId, rate: decoded.rate, sampleCount: decoded.sampleCount, asset };
    },
  };
}
