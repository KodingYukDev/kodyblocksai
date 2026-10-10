/**
 * Target runtime = padanan RenderedTarget + Sprite scratch-vm.
 * Implementasi: packages/engine/src/target.ts (RenderedTarget) dan sprite.ts (Sprite).
 */
import type {
  CommentState,
  CostumeState,
  RotationStyle,
  ScratchValue,
  SoundState,
  TargetState,
  VariableState,
  VariableType,
  VideoState,
} from "./project-model";
import type { GraphicEffect, Rect, RGB } from "./renderer";
import type { IBlocksContainer, IRuntime } from "./runtime";

/** Data biner asset (isi file costume/sound) yang disimpan bersama project. */
export interface AssetData {
  assetId: string;
  dataFormat: string;
  data: Uint8Array;
}

export interface Costume extends CostumeState {
  /** Diisi IMediaLoader saat dimuat; -1 kalau belum ada renderer. */
  skinId: number;
  /** Ukuran native [w,h] setelah dibagi bitmapResolution. */
  size: [number, number];
  asset: AssetData | null;
}

export interface Sound extends SoundState {
  /** id dari IAudioEngine.decodeSound; "" kalau belum ada audio. */
  soundId: string;
  asset: AssetData | null;
}

/** Variabel runtime (scratch-vm Variable). value list = array yang dimutasi in-place oleh blok list. */
export interface Variable extends VariableState {
  /** Flag internal agar monitor list tahu ada perubahan (scratch-vm _monitorUpToDate). */
  _monitorUpToDate?: boolean;
}

export type TargetEventMap = {
  TARGET_MOVED: { target: ITarget; oldX: number; oldY: number; force: boolean };
  EVENT_TARGET_VISUAL_CHANGE: { target: ITarget };
};

/** Sprite = data bersama sprite asli + semua clone-nya. */
export interface ISprite {
  name: string;
  costumes: Costume[];
  sounds: Sound[];
  /** Blok bersama (clone memakai container yang sama). */
  blocks: IBlocksContainer;
  /** clones[0] adalah target asli. */
  clones: ITarget[];
  addCostumeAt(costume: Costume, index: number): void;
  deleteCostumeAt(index: number): Costume | null;
  addSound(sound: Sound, index?: number): void;
  deleteSoundAt(index: number): Sound | null;
}

export interface ITarget {
  readonly id: string;
  readonly runtime: IRuntime;
  readonly sprite: ISprite;
  readonly blocks: IBlocksContainer;
  readonly isStage: boolean;
  readonly isOriginal: boolean;
  variables: Record<string, Variable>;
  comments: Record<string, CommentState>;
  /** -1 kalau tidak ada renderer. */
  drawableId: number;

  x: number;
  y: number;
  direction: number;
  size: number;
  visible: boolean;
  draggable: boolean;
  rotationStyle: RotationStyle;
  currentCostume: number;
  volume: number;
  effects: Record<GraphicEffect, number>;
  // khusus stage
  tempo: number;
  videoTransparency: number;
  videoState: VideoState;
  textToSpeechLanguage: string | null;
  /** Sedang di-drag pengguna (scratch-vm dragging). */
  dragging: boolean;

  getName(): string;
  // --- posisi & tampilan (semua fencing/pembulatan persis RenderedTarget) ---
  setXY(x: number, y: number, force?: boolean): void;
  setDirection(direction: number): void;
  setSize(size: number): void;
  setVisible(visible: boolean): void;
  setDraggable(draggable: boolean): void;
  setRotationStyle(style: RotationStyle | string): void;
  setCostume(index: number): void;
  setEffect(effect: GraphicEffect, value: number): void;
  clearEffects(): void;
  /** Arah & skala yang dikirim ke renderer setelah rotationStyle diterapkan. */
  _getRenderedDirectionAndScale(): { direction: number; scale: [number, number] };
  keepInFence(newX: number, newY: number, fence?: Rect): [number, number];
  getBounds(): Rect | null;
  getBoundsForBubble(): Rect | null;
  getCostumes(): Costume[];
  getSounds(): Sound[];
  getCurrentCostume(): Costume | undefined;
  getCostumeIndexByName(name: string): number;

  // --- layer ---
  goToFront(): void;
  goToBack(): void;
  goForwardLayers(n: number): void;
  goBackwardLayers(n: number): void;
  goBehindOther(other: ITarget): void;
  getLayerOrder(): number;

  // --- sensing ---
  isTouchingObject(requestedObject: string): boolean;
  isTouchingSprite(spriteName: string): boolean;
  isTouchingEdge(): boolean;
  isTouchingPoint(stageX: number, stageY: number): boolean;
  isTouchingColor(rgb: RGB): boolean;
  colorIsTouchingColor(targetRgb: RGB, maskRgb: RGB): boolean;

  // --- variabel (lookup persis Target scratch-vm: lokal dulu, lalu stage) ---
  lookupVariableById(id: string): Variable | undefined;
  lookupVariableByNameAndType(name: string, type?: VariableType, skipStage?: boolean): Variable | null;
  lookupOrCreateVariable(id: string, name: string): Variable;
  lookupOrCreateList(id: string, name: string): Variable;
  lookupBroadcastMsg(id: string, name: string): Variable | undefined;
  lookupBroadcastByInputValue(name: string): Variable | undefined;
  createVariable(id: string, name: string, type: VariableType, isCloud?: boolean): void;
  renameVariable(id: string, newName: string): void;
  deleteVariable(id: string): void;
  getAllVariableNamesInScopeByType(type: VariableType, skipStage?: boolean): string[];

  // --- clone ---
  makeClone(): ITarget | null;
  /** Duplikat sprite (menu "duplicate" editor), bukan clone. */
  duplicate(): Promise<ITarget>;
  dispose(): void;

  // --- state ekstensi per target (scratch-vm _customState) ---
  getCustomState<T>(key: string): T | undefined;
  setCustomState<T>(key: string, value: T): void;

  // --- event ---
  on<K extends keyof TargetEventMap>(event: K, fn: (payload: TargetEventMap[K]) => void): () => void;

  /** Snapshot untuk serialisasi (clone tidak boleh diserialisasi). */
  toState(): TargetState;
}

/** Fungsi pembantu yang dibutuhkan engine untuk memuat costume/sound (diimplementasikan app dengan renderer + audio). */
export interface IMediaLoader {
  loadCostume(costume: CostumeState, asset: AssetData | null): Promise<Costume>;
  loadSound(sound: SoundState, asset: AssetData | null): Promise<Sound>;
}

/** Nilai list/scalar yang dibaca blok data. */
export type VariableValue = ScratchValue | ScratchValue[];
