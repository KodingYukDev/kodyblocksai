/** Pembuat NewCostume / NewSound dari bytes (md5 = assetId seperti scratch-storage createAsset). */
import type { CostumeState, SoundState } from "@kody/engine";
import { md5 } from "../library/md5";
import type { LibraryCostume, LibrarySound } from "../library/library-types";
import type { CostumeView, NewCostume, NewSound, SoundView } from "./types";

export function makeCostume(
  name: string,
  dataFormat: CostumeState["dataFormat"],
  data: Uint8Array,
  bitmapResolution: number,
  rotationCenterX: number,
  rotationCenterY: number,
): NewCostume {
  const assetId = md5(data);
  return {
    state: { name, assetId, md5ext: `${assetId}.${dataFormat}`, dataFormat, bitmapResolution, rotationCenterX, rotationCenterY },
    asset: { assetId, dataFormat, data },
  };
}

export function makeSound(name: string, dataFormat: SoundState["dataFormat"], data: Uint8Array, rate: number, sampleCount: number): NewSound {
  const assetId = md5(data);
  return {
    state: { name, assetId, md5ext: `${assetId}.${dataFormat}`, dataFormat, rate, sampleCount },
    asset: { assetId, dataFormat, data },
  };
}

export function costumeFromLibrary(c: LibraryCostume, data: Uint8Array, name = c.name): NewCostume {
  return {
    state: {
      name,
      assetId: c.assetId,
      md5ext: c.md5ext,
      dataFormat: c.dataFormat,
      bitmapResolution: c.bitmapResolution,
      rotationCenterX: c.rotationCenterX,
      rotationCenterY: c.rotationCenterY,
    },
    asset: { assetId: c.assetId, dataFormat: c.dataFormat, data },
  };
}

export function soundFromLibrary(s: LibrarySound, data: Uint8Array, name = s.name): NewSound {
  return {
    state: { name, assetId: s.assetId, md5ext: s.md5ext, dataFormat: s.dataFormat, rate: s.rate, sampleCount: s.sampleCount },
    asset: { assetId: s.assetId, dataFormat: s.dataFormat, data },
  };
}

/** Salin view (untuk duplikat) menjadi NewCostume dengan bytes yang sama. */
export function costumeFromView(v: CostumeView): NewCostume | null {
  if (!v.asset) return null;
  const { asset, size: _size, ...state } = v;
  return { state: { ...state }, asset };
}

export function soundFromView(v: SoundView): NewSound | null {
  if (!v.asset) return null;
  const { asset, ...state } = v;
  return { state: { ...state }, asset };
}

/** SVG kosong costume baru (empty-assets.js scratch-gui: 2x2, pusat 0,0). */
export const EMPTY_SVG =
  '<svg version="1.1" width="2" height="2" viewBox="-1 -1 2 2" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">\n' +
  "  <!-- Exported by KodyBlocks -->\n</svg>";

export function emptyCostume(name: string): NewCostume {
  return makeCostume(name, "svg", new TextEncoder().encode(EMPTY_SVG), 1, 0, 0);
}

/** MIME untuk dataFormat (thumbnail blob, unduh). */
export function mimeForFormat(dataFormat: string): string {
  switch (dataFormat) {
    case "svg":
      return "image/svg+xml";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "bmp":
      return "image/bmp";
    case "wav":
      return "audio/wav";
    case "mp3":
      return "audio/mpeg";
    case "ogg":
      return "audio/ogg";
    case "webm":
      return "audio/webm";
    default:
      return "application/octet-stream";
  }
}
