/**
 * Kueri geometri & tabrakan di CPU: isTouchingDrawables, isTouchingColor (+mask), pick, fencing.
 * Port scratch-render 1.2.115 `RenderWebGL.js` (BSD-3-Clause): maskMatches, colorMatches, _touchingBounds,
 * _candidatesTouching, _candidatesBounds, isTouchingDrawables, isTouchingColor (jalur CPU),
 * sampleColor3b, clientSpaceToScratchBounds, drawableTouching, pick, getFencedPositionOfDrawable.
 * Jalur GPU readPixels scratch-render tidak dipakai: kita selalu CPU (setara UseGpuModes.ForceCPU),
 * jadi hasil deterministik dan sama di WebGL, Canvas2D, maupun headless.
 */
import type { Rect } from "@kody/engine";
import { Drawable } from "./drawable";
import { EFFECT_INFO } from "./effect-info";
import { Rectangle } from "./rectangle";

/** Tampilan scene yang dibutuhkan kueri tabrakan. */
export interface SceneView {
  getDrawable(id: number): Drawable | undefined;
  readonly drawList: readonly number[];
  readonly xLeft: number;
  readonly xRight: number;
  readonly yBottom: number;
  readonly yTop: number;
  /** Warna latar 0..255 (default putih). */
  readonly backgroundColor3b: Uint8ClampedArray;
}

export interface Candidate {
  id: number;
  drawable: Drawable;
  intersection: Rectangle;
}

export const MAX_TOUCH_SIZE: readonly [number, number] = [3, 3];
const FENCE_WIDTH = 15;
const ID_NONE = -1;

/** Pencocokan mask "warna menyentuh warna": 6 bit atas tiap kanal. */
export const maskMatches = (a: ArrayLike<number>, b: ArrayLike<number>): boolean =>
  (a[3] as number) > 0 &&
  ((a[0] as number) & 0b11111100) === ((b[0] as number) & 0b11111100) &&
  ((a[1] as number) & 0b11111100) === ((b[1] as number) & 0b11111100) &&
  ((a[2] as number) & 0b11111100) === ((b[2] as number) & 0b11111100);

/** Pencocokan warna target: 5 bit R, 5 bit G, 4 bit B. */
export const colorMatches = (a: ArrayLike<number>, b: ArrayLike<number>, offset: number): boolean =>
  ((a[0] as number) & 0b11111000) === ((b[offset] as number) & 0b11111000) &&
  ((a[1] as number) & 0b11111000) === ((b[offset + 1] as number) & 0b11111000) &&
  ((a[2] as number) & 0b11110000) === ((b[offset + 2] as number) & 0b11110000);

const touchingPoint = new Float32Array(3);
const touchingColor = new Uint8ClampedArray(4);
const blendColor = new Uint8ClampedArray(4);
const fenceBounds = new Rectangle();

export function touchingBounds(scene: SceneView, id: number): Rectangle | null {
  const drawable = scene.getDrawable(id);
  if (!drawable || !drawable.skin || !drawable.skin.getTexture([100, 100])) return null;
  const bounds = drawable.getFastBounds();
  bounds.clamp(scene.xLeft, scene.xRight, scene.yBottom, scene.yTop);
  bounds.snapToInt();
  if (bounds.width === 0 || bounds.height === 0) return null;
  return bounds;
}

export function candidatesTouching(scene: SceneView, id: number, candidateIds: readonly number[]): Candidate[] {
  const bounds = touchingBounds(scene, id);
  const result: Candidate[] = [];
  if (bounds === null) return result;
  // Dari belakang daftar: yang paling depan diperiksa lebih dulu.
  for (let index = candidateIds.length - 1; index >= 0; index--) {
    const cid = candidateIds[index] as number;
    if (cid === id) continue;
    const drawable = scene.getDrawable(cid);
    if (!drawable) continue;
    // Balon teks tidak ikut kueri "menyentuh".
    if (drawable.skin && drawable.skin.kind === "text") continue;
    if (drawable.skin && drawable.getVisible()) {
      drawable.updateCPURenderAttributes();
      const candidateBounds = drawable.getFastBounds();
      candidateBounds.snapToInt();
      if (bounds.intersects(candidateBounds)) {
        result.push({ id: cid, drawable, intersection: Rectangle.intersect(bounds, candidateBounds) });
      }
    }
  }
  return result;
}

export function candidatesBounds(candidates: readonly Candidate[]): Rectangle | null {
  let memo: Rectangle | null = null;
  for (const c of candidates) {
    memo = memo === null ? c.intersection : Rectangle.union(memo, c.intersection, new Rectangle());
  }
  return memo;
}

function visibleList(scene: SceneView, ids: readonly number[]): number[] {
  return ids.filter((id) => scene.getDrawable(id)?.getVisible() === true);
}

export function isTouchingDrawables(scene: SceneView, id: number, candidateIds: readonly number[] = scene.drawList): boolean {
  const drawable = scene.getDrawable(id);
  if (!drawable) return false;
  const candidates = candidatesTouching(scene, id, visibleList(scene, candidateIds));
  if (candidates.length === 0 || !drawable.getVisible()) return false;
  const bounds = candidatesBounds(candidates) as Rectangle;
  const point = touchingPoint;
  drawable.updateCPURenderAttributes();
  for (let x = bounds.left; x <= bounds.right; x++) {
    point[0] = x;
    for (let y = bounds.bottom; y <= bounds.top; y++) {
      point[1] = y;
      if (drawable.isTouching(point)) {
        for (let i = 0; i < candidates.length; i++) {
          if ((candidates[i] as Candidate).drawable.isTouching(point)) return true;
        }
      }
    }
  }
  return false;
}

/** Warna panggung (premultiplied blend + latar putih) dari kandidat, depan ke belakang. */
export function sampleColor3b(vec: ArrayLike<number>, candidates: readonly { drawable: Drawable }[], dst: Uint8ClampedArray): Uint8ClampedArray {
  dst.fill(0);
  let blendAlpha = 1;
  for (let index = 0; blendAlpha !== 0 && index < candidates.length; index++) {
    Drawable.sampleColor4b(vec, (candidates[index] as { drawable: Drawable }).drawable, blendColor);
    dst[0] = (dst[0] as number) + (blendColor[0] as number) * blendAlpha;
    dst[1] = (dst[1] as number) + (blendColor[1] as number) * blendAlpha;
    dst[2] = (dst[2] as number) + (blendColor[2] as number) * blendAlpha;
    blendAlpha *= 1 - (blendColor[3] as number) / 255;
  }
  dst[0] = (dst[0] as number) + blendAlpha * 255;
  dst[1] = (dst[1] as number) + blendAlpha * 255;
  dst[2] = (dst[2] as number) + blendAlpha * 255;
  return dst;
}

export function isTouchingColor(scene: SceneView, id: number, color3b: ArrayLike<number>, mask3b?: ArrayLike<number>): boolean {
  const drawable = scene.getDrawable(id);
  if (!drawable) return false;
  const candidates = candidatesTouching(scene, id, visibleList(scene, scene.drawList));
  let bounds: Rectangle | null;
  if (colorMatches(color3b, scene.backgroundColor3b, 0)) {
    // Warna latar ada di seluruh panggung: periksa semua piksel di dalam drawable.
    bounds = touchingBounds(scene, id);
    if (bounds === null) return false;
  } else if (candidates.length === 0) {
    return false;
  } else {
    bounds = candidatesBounds(candidates) as Rectangle;
  }

  const point = touchingPoint;
  const color = touchingColor;
  const hasMask = Boolean(mask3b);
  drawable.updateCPURenderAttributes();
  // Drawable bermask mengabaikan efek ghost.
  const effectMask = ~EFFECT_INFO.ghost.mask;

  for (let y = bounds.bottom; y <= bounds.top; y++) {
    for (let x = bounds.left; x <= bounds.right; x++) {
      point[1] = y;
      point[0] = x;
      const inside = hasMask
        ? maskMatches(Drawable.sampleColor4b(point, drawable, color, effectMask), mask3b as ArrayLike<number>)
        : drawable.isTouching(point);
      if (inside) {
        sampleColor3b(point, candidates, color);
        if (colorMatches(color, color3b, 0)) return true;
      }
    }
  }
  return false;
}

/**
 * Kotak sentuh di sekitar titik panggung (padanan clientSpaceToScratchBounds; koordinat klien diganti
 * koordinat panggung tak dibulatkan: clientX * 480/clientWidth = stageX - xLeft).
 */
export function stageTouchBounds(scene: SceneView, stageX: number, stageY: number, width = 1, height = 1): Rectangle {
  const w = Math.max(1, Math.min(Math.round(width), MAX_TOUCH_SIZE[0]));
  const h = Math.max(1, Math.min(Math.round(height), MAX_TOUCH_SIZE[1]));
  const x = stageX - scene.xLeft - (w - 1) / 2;
  const y = scene.yTop - stageY + (h - 1) / 2;
  const xOfs = w % 2 ? 0 : -0.5;
  const yOfs = h % 2 ? 0 : -0.5;
  return new Rectangle().initFromBounds(
    Math.floor(scene.xLeft + x + xOfs),
    Math.floor(scene.xLeft + x + xOfs + w - 1),
    Math.ceil(scene.yTop - y + yOfs),
    Math.ceil(scene.yTop - y + yOfs + h - 1),
  );
}

/** drawableTouching: apakah piksel buram drawable ada di kotak sentuh. */
export function drawableTouchingBounds(scene: SceneView, id: number, bounds: Rectangle): boolean {
  const drawable = scene.getDrawable(id);
  if (!drawable) return false;
  const p = new Float32Array(3);
  drawable.updateCPURenderAttributes();
  for (p[1] = bounds.bottom; (p[1] as number) <= bounds.top; p[1]++) {
    for (p[0] = bounds.left; (p[0] as number) <= bounds.right; p[0]++) {
      if (drawable.isTouching(p)) return true;
    }
  }
  return false;
}

/** Drawable teratas pada kotak sentuh (bias ke "ada" daripada "tidak ada"), atau -1. */
export function pickInBounds(scene: SceneView, bounds: Rectangle, candidateIds?: readonly number[]): number {
  if (bounds.left === -Infinity || bounds.bottom === -Infinity) return ID_NONE;
  const ids = (candidateIds ?? scene.drawList).filter((id) => {
    const d = scene.getDrawable(id);
    if (d && d.getVisible() && d.getUniforms().u_ghost !== 0) {
      if (!bounds.intersects(d.getFastBounds())) return false;
      d.updateCPURenderAttributes();
      return true;
    }
    return false;
  });
  if (ids.length === 0) return ID_NONE;

  const hits = new Map<number, number>();
  const worldPos = new Float32Array(3);
  for (worldPos[1] = bounds.bottom; (worldPos[1] as number) <= bounds.top; worldPos[1]++) {
    for (worldPos[0] = bounds.left; (worldPos[0] as number) <= bounds.right; worldPos[0]++) {
      for (let d = ids.length - 1; d >= 0; d--) {
        const id = ids[d] as number;
        if ((scene.getDrawable(id) as Drawable).isTouching(worldPos)) {
          hits.set(id, (hits.get(id) ?? 0) + 1);
          break;
        }
      }
    }
  }
  // Seri: id terkecil menang (urutan for..in array di scratch-render).
  let hit = ID_NONE;
  let best = 0;
  for (const id of [...hits.keys()].sort((a, b) => a - b)) {
    const count = hits.get(id) as number;
    if (count > best) {
      best = count;
      hit = id;
    }
  }
  return hit;
}

/** keepInFence: posisi setelah dijepit agar sprite tetap terlihat minimal sebagian di panggung. */
export function fencedPosition(scene: SceneView, id: number, position: readonly number[]): [number, number] {
  let x = position[0] as number;
  let y = position[1] as number;
  const drawable = scene.getDrawable(id);
  if (!drawable || !drawable.skin) return [x, y];
  const pos = drawable._position;
  const dx = x - (pos[0] as number);
  const dy = y - (pos[1] as number);
  const aabb: Rect & { width?: number; height?: number } = drawable.skin.getFenceBounds(drawable, fenceBounds);
  const aw = Math.abs(aabb.left - aabb.right);
  const ah = Math.abs(aabb.top - aabb.bottom);
  const inset = Math.floor(Math.min(aw, ah) / 2);

  const sx = scene.xRight - Math.min(FENCE_WIDTH, inset);
  if (aabb.right + dx < -sx) x = Math.ceil((pos[0] as number) - (sx + aabb.right));
  else if (aabb.left + dx > sx) x = Math.floor((pos[0] as number) + (sx - aabb.left));
  const sy = scene.yTop - Math.min(FENCE_WIDTH, inset);
  if (aabb.top + dy < -sy) y = Math.ceil((pos[1] as number) - (sy + aabb.top));
  else if (aabb.bottom + dy > sy) y = Math.floor((pos[1] as number) + (sy - aabb.bottom));
  return [x, y];
}
