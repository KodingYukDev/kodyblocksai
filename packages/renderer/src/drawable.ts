/**
 * Drawable: transformasi (posisi/arah/skala/rotation center), efek, convex hull, uji titik CPU.
 * Port scratch-render 1.2.115 `src/Drawable.js` (BSD-3-Clause). Matriks/vektor memakai Float32Array
 * (twgl) persis seperti aslinya supaya pembulatan bounds & tabrakan identik.
 */
import { m4 } from "twgl.js";
import type { DrawableProperties, GraphicEffect } from "@kody/engine";
import { EFFECT_INFO, EFFECTS, defaultEffectUniforms } from "./effect-info";
import type { EffectUniforms } from "./effect-info";
import { transformColor, transformPoint } from "./effect-transform";
import type { EffectSubject } from "./effect-transform";
import { Rectangle } from "./rectangle";
import type { Skin, SkinDrawableView } from "./skins/skin";

const FLOATING_POINT_ERROR_ALLOWANCE = 1e-6;
const ID_NONE = -1;

const isTouchingPosition = new Float32Array(3);
const hullProjection = m4.ortho(-1, 1, -1, 1, -1, 1);

/** Properti yang diterima updateProperties (DrawableProperties + efek per nama, seperti scratch-render). */
export type DrawablePropertyBag = DrawableProperties & Partial<Record<GraphicEffect, number>>;

export class Drawable implements EffectSubject, SkinDrawableView {
  readonly id: number;
  readonly uniforms: EffectUniforms & { u_modelMatrix: Float32Array; u_silhouetteColor: number[] };
  readonly _position = new Float32Array(3);
  readonly _scale = new Float32Array([100, 100, 0]);
  private _direction = 90;
  private transformDirty = true;
  private readonly rotationMatrix = m4.identity() as Float32Array;
  private rotationTransformDirty = true;
  private readonly rotationAdjusted = new Float32Array(3);
  private rotationCenterDirty = true;
  private readonly skinScale = new Float32Array(3);
  private skinScaleDirty = true;
  readonly inverseMatrix = m4.identity() as Float32Array;
  private inverseTransformDirty = true;
  private _visible = true;
  enabledEffects = 0;
  /** Nilai blok efek (untuk backend Canvas2D dan debug). */
  readonly effectValues: Record<GraphicEffect, number> = {
    color: 0, fisheye: 0, whirl: 0, pixelate: 0, mosaic: 0, brightness: 0, ghost: 0,
  };
  private convexHullPoints: number[][] | null = null;
  private convexHullDirty = true;
  private transformedHullPoints: Float32Array[] | null = null;
  private transformedHullDirty = true;
  private _skin: Skin | null = null;
  private readonly onSkinAltered = (): void => this.skinWasAltered();
  /** Diatur updateCPURenderAttributes: 0 = never, 1 = nearest, 2 = linear. */
  private touchMode: 0 | 1 | 2 = 0;

  constructor(id: number) {
    this.id = id;
    this.uniforms = {
      u_modelMatrix: m4.identity() as Float32Array,
      u_silhouetteColor: Drawable.color4fFromID(id),
      ...defaultEffectUniforms(),
    };
  }

  dispose(): void {
    this.skin = null;
  }

  setTransformDirty(): void {
    this.transformDirty = true;
    this.inverseTransformDirty = true;
    this.transformedHullDirty = true;
  }

  get skin(): Skin | null {
    return this._skin;
  }

  set skin(newSkin: Skin | null) {
    if (this._skin !== newSkin) {
      if (this._skin) this._skin.offWasAltered(this.onSkinAltered);
      this._skin = newSkin;
      if (this._skin) this._skin.onWasAltered(this.onSkinAltered);
      this.skinWasAltered();
    }
  }

  get direction(): number {
    return this._direction;
  }

  get scale(): [number, number] {
    return [this._scale[0] as number, this._scale[1] as number];
  }

  get position(): [number, number] {
    return [this._position[0] as number, this._position[1] as number];
  }

  getUniforms(): Drawable["uniforms"] {
    if (this.transformDirty) this.calculateTransform();
    return this.uniforms;
  }

  getSkinSize(): readonly [number, number] {
    return this._skin ? this._skin.size : [0, 0];
  }

  getVisible(): boolean {
    return this._visible;
  }

  updatePosition(position: readonly number[]): void {
    if (this._position[0] !== position[0] || this._position[1] !== position[1]) {
      this._position[0] = Math.round(position[0] as number);
      this._position[1] = Math.round(position[1] as number);
      this.setTransformDirty();
    }
  }

  updateDirection(direction: number): void {
    if (this._direction !== direction) {
      this._direction = direction;
      this.rotationTransformDirty = true;
      this.setTransformDirty();
    }
  }

  updateScale(scale: readonly number[]): void {
    if (this._scale[0] !== scale[0] || this._scale[1] !== scale[1]) {
      this._scale[0] = scale[0] as number;
      this._scale[1] = scale[1] as number;
      this.rotationCenterDirty = true;
      this.skinScaleDirty = true;
      this.setTransformDirty();
    }
  }

  updateVisible(visible: boolean): void {
    if (this._visible !== visible) {
      this._visible = visible;
      this.setConvexHullDirty();
    }
  }

  updateEffect(effectName: GraphicEffect, rawValue: number): void {
    const info = EFFECT_INFO[effectName];
    if (rawValue) this.enabledEffects |= info.mask;
    else this.enabledEffects &= ~info.mask;
    this.effectValues[effectName] = rawValue;
    this.uniforms[info.uniformName] = info.converter(rawValue);
    if (info.shapeChanges) this.setConvexHullDirty();
  }

  updateProperties(properties: DrawablePropertyBag): void {
    if ("position" in properties && properties.position) this.updatePosition(properties.position);
    if ("direction" in properties && properties.direction !== undefined) this.updateDirection(properties.direction);
    if ("scale" in properties && properties.scale) this.updateScale(properties.scale);
    if ("visible" in properties && properties.visible !== undefined) this.updateVisible(properties.visible);
    for (const effect of EFFECTS) {
      const v = properties[effect];
      if (v !== undefined) this.updateEffect(effect, v);
    }
  }

  private calculateTransform(): void {
    if (this.rotationTransformDirty) {
      const rotation = ((270 - this._direction) * Math.PI) / 180;
      const c = Math.cos(rotation);
      const s = Math.sin(rotation);
      this.rotationMatrix[0] = c;
      this.rotationMatrix[1] = s;
      this.rotationMatrix[4] = -s;
      this.rotationMatrix[5] = c;
      this.rotationTransformDirty = false;
    }

    const skin = this._skin;
    if (this.rotationCenterDirty && skin !== null) {
      const center = skin.rotationCenter;
      const skinSize = skin.size;
      this.rotationAdjusted[0] = (((center[0] as number) - skinSize[0] / 2) * (this._scale[0] as number)) / 100;
      this.rotationAdjusted[1] = ((((center[1] as number) - skinSize[1] / 2) * (this._scale[1] as number)) / 100) * -1;
      this.rotationCenterDirty = false;
    }

    if (this.skinScaleDirty && skin !== null) {
      const skinSize = skin.size;
      this.skinScale[0] = (skinSize[0] * (this._scale[0] as number)) / 100;
      this.skinScale[1] = (skinSize[1] * (this._scale[1] as number)) / 100;
      this.skinScaleDirty = false;
    }

    const m = this.uniforms.u_modelMatrix;
    const scale0 = this.skinScale[0] as number;
    const scale1 = this.skinScale[1] as number;
    const r00 = this.rotationMatrix[0] as number;
    const r01 = this.rotationMatrix[1] as number;
    const r10 = this.rotationMatrix[4] as number;
    const r11 = this.rotationMatrix[5] as number;
    const a0 = this.rotationAdjusted[0] as number;
    const a1 = this.rotationAdjusted[1] as number;
    m[0] = scale0 * r00;
    m[1] = scale0 * r01;
    m[4] = scale1 * r10;
    m[5] = scale1 * r11;
    m[12] = r00 * a0 + r10 * a1 + (this._position[0] as number);
    m[13] = r01 * a0 + r11 * a1 + (this._position[1] as number);
    this.transformDirty = false;
  }

  needsConvexHullPoints(): boolean {
    return !this.convexHullPoints || this.convexHullDirty || this.convexHullPoints.length === 0;
  }

  setConvexHullDirty(): void {
    this.convexHullDirty = true;
  }

  setConvexHullPoints(points: number[][]): void {
    this.convexHullPoints = points;
    this.convexHullDirty = false;
    this.transformedHullPoints = points.map(() => new Float32Array(3));
    this.transformedHullDirty = true;
  }

  getBounds(result?: Rectangle): Rectangle {
    if (this.needsConvexHullPoints()) throw new Error("Needs updated convex hull points before bounds calculation.");
    if (this.transformDirty) this.calculateTransform();
    const r = result ?? new Rectangle();
    r.initFromPointsAABB(this.getTransformedHullPoints());
    return r;
  }

  getBoundsForBubble(result?: Rectangle): Rectangle {
    if (this.needsConvexHullPoints()) throw new Error("Needs updated convex hull points before bubble bounds calculation.");
    if (this.transformDirty) this.calculateTransform();
    const slice = 8;
    const pts = this.getTransformedHullPoints();
    let maxY = -Infinity;
    for (const p of pts) maxY = Math.max(maxY, p[1] as number);
    const filtered = pts.filter((p) => (p[1] as number) > maxY - slice);
    const r = result ?? new Rectangle();
    r.initFromPointsAABB(filtered);
    return r;
  }

  getAABB(result?: Rectangle): Rectangle {
    if (this.transformDirty) this.calculateTransform();
    const r = result ?? new Rectangle();
    r.initFromModelMatrix(this.uniforms.u_modelMatrix);
    return r;
  }

  getFastBounds(result?: Rectangle): Rectangle {
    if (!this.needsConvexHullPoints()) return this.getBounds(result);
    return this.getAABB(result);
  }

  private getTransformedHullPoints(): Float32Array[] {
    const out = this.transformedHullPoints as Float32Array[];
    if (!this.transformedHullDirty) return out;
    const skinSize = (this._skin as Skin).size;
    const halfXPixel = 1 / skinSize[0] / 2;
    const halfYPixel = 1 / skinSize[1] / 2;
    const tm = m4.multiply(this.uniforms.u_modelMatrix, hullProjection);
    const hull = this.convexHullPoints as number[][];
    for (let i = 0; i < hull.length; i++) {
      const point = hull[i] as number[];
      const dst = out[i] as Float32Array;
      dst[0] = 0.5 + -(point[0] as number) / skinSize[0] - halfXPixel;
      dst[1] = (point[1] as number) / skinSize[1] - 0.5 + halfYPixel;
      dst[2] = 0;
      m4.transformPoint(tm, dst, dst);
    }
    this.transformedHullDirty = false;
    return out;
  }

  updateMatrix(): void {
    if (this.transformDirty) this.calculateTransform();
    if (this.inverseTransformDirty) {
      const inverse = this.inverseMatrix;
      m4.copy(this.uniforms.u_modelMatrix, inverse);
      inverse[10] = 1;
      m4.inverse(inverse, inverse);
      this.inverseTransformDirty = false;
    }
  }

  updateCPURenderAttributes(): void {
    this.updateMatrix();
    const skin = this._skin;
    if (skin) {
      const scale = this.scale;
      skin.updateSilhouette(scale);
      this.touchMode = skin.useNearest(scale, this) ? 1 : 2;
    } else {
      this.touchMode = 0;
    }
  }

  /** Uji titik panggung terhadap silhouette (mode dipilih updateCPURenderAttributes). */
  isTouching(vec: ArrayLike<number>): boolean {
    const skin = this._skin;
    if (this.touchMode === 0 || !skin) return false;
    const local = getLocalPosition(this, vec);
    return this.touchMode === 1 ? skin.isTouchingNearest(local) : skin.isTouchingLinear(local);
  }

  private skinWasAltered(): void {
    this.rotationCenterDirty = true;
    this.skinScaleDirty = true;
    this.setConvexHullDirty();
    this.setTransformDirty();
  }

  static color4fFromID(id: number): number[] {
    const n = id - ID_NONE;
    return [((n >> 0) & 255) / 255.0, ((n >> 8) & 255) / 255.0, ((n >> 16) & 255) / 255.0, 1.0];
  }

  static color3bToID(r: number, g: number, b: number): number {
    let id = (r & 255) << 0;
    id |= (g & 255) << 8;
    id |= (b & 255) << 16;
    return id + ID_NONE;
  }

  /** Warna premultiplied 0..255 drawable di titik panggung (Drawable.sampleColor4b). */
  static sampleColor4b(vec: ArrayLike<number>, drawable: Drawable, dst: Uint8ClampedArray, effectMask?: number): Uint8ClampedArray {
    const local = getLocalPosition(drawable, vec);
    if ((local[0] as number) < 0 || (local[1] as number) < 0 || (local[0] as number) > 1 || (local[1] as number) > 1) {
      dst[0] = 0;
      dst[1] = 0;
      dst[2] = 0;
      dst[3] = 0;
      return dst;
    }
    const skin = drawable.skin;
    if (!skin) return dst.fill(0);
    const color = skin.silhouette.colorAtNearest(local, dst);
    if (drawable.enabledEffects === 0) return color;
    return transformColor(drawable, color, effectMask);
  }
}

/** Titik panggung -> koordinat tekstur lokal drawable (+ efek distorsi). Hasil berbagi buffer. */
export function getLocalPosition(drawable: Drawable, vec: ArrayLike<number>): Float32Array {
  const local = isTouchingPosition;
  const v0 = vec[0] as number;
  const v1 = vec[1] as number;
  const m = drawable.inverseMatrix;
  const d = v0 * (m[3] as number) + v1 * (m[7] as number) + (m[15] as number);
  local[0] = 0.5 - (v0 * (m[0] as number) + v1 * (m[4] as number) + (m[12] as number)) / d;
  local[1] = (v0 * (m[1] as number) + v1 * (m[5] as number) + (m[13] as number)) / d + 0.5;
  if (Math.abs(local[0] as number) < FLOATING_POINT_ERROR_ALLOWANCE) local[0] = 0;
  if (Math.abs(local[1] as number) < FLOATING_POINT_ERROR_ALLOWANCE) local[1] = 0;
  if (
    drawable.enabledEffects !== 0 &&
    (local[0] as number) >= 0 &&
    (local[0] as number) < 1 &&
    (local[1] as number) >= 0 &&
    (local[1] as number) < 1
  ) {
    transformPoint(drawable, local, local);
  }
  return local;
}
