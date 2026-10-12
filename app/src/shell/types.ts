/**
 * Kontrak antara shell UI (app/src/shell, stage-pane, sprite-pane) dan "pengendali" yang menyambungkannya
 * ke runtime. UI hanya membaca ShellSnapshot dan memanggil ShellController; tidak menyentuh IRuntime langsung.
 * Implementasi nyata: runtime-controller.ts (di atas IRuntime). Tes & pratinjau: mock-controller.ts.
 */
import type { KeyboardData, MonitorRecord, MouseData, RotationStyle, ScratchValue } from "@kody/engine";

/** Ringkasan satu target (stage atau sprite asli) untuk panel sprite & info sprite. */
export interface TargetView {
  id: string;
  name: string;
  isStage: boolean;
  x: number;
  y: number;
  size: number;
  direction: number;
  visible: boolean;
  draggable: boolean;
  rotationStyle: RotationStyle;
  currentCostume: number;
  costumeCount: number;
  costumeName: string;
  /** URL gambar costume aktif (data:/blob:) atau null. */
  thumbnailUrl: string | null;
}

/** Padanan data vm.postSpriteInfo (scratch-vm RenderedTarget.postSpriteInfo). */
export interface SpriteInfoPatch {
  x?: number;
  y?: number;
  direction?: number;
  size?: number;
  visible?: boolean;
  draggable?: boolean;
  rotationStyle?: RotationStyle;
  force?: boolean;
}

export interface ShellSnapshot {
  /** Stage dulu, lalu sprite asli dalam urutan runtime.targets (tanpa clone). */
  targets: readonly TargetView[];
  editingTargetId: string | null;
  running: boolean;
  turbo: boolean;
  monitors: readonly MonitorRecord[];
  /** Pertanyaan "tanya dan tunggu" yang sedang aktif (null = tidak ada). */
  question: string | null;
}

/** Cara menambah sprite / backdrop (menu aksi bulat seperti scratch-gui). */
export type AddMethod = "library" | "paint" | "upload" | "surprise";

/** File yang dibaca dari input pengguna. */
export interface PickedFile {
  name: string;
  bytes: Uint8Array;
  type: string;
}

export interface ShellController {
  getSnapshot(): ShellSnapshot;
  /** Untuk useSyncExternalStore: listener dipanggil setiap snapshot berubah. */
  subscribe(listener: () => void): () => void;

  // --- eksekusi ---
  greenFlag(): void;
  stopAll(): void;
  setTurbo(enabled: boolean): void;

  // --- target ---
  selectTarget(targetId: string): void;
  /** Mengubah target yang sedang diedit (atau target yang sedang diseret). */
  postSpriteInfo(patch: SpriteInfoPatch): void;
  renameSprite(targetId: string, newName: string): void;
  duplicateSprite(targetId: string): Promise<void>;
  deleteSprite(targetId: string): void;
  /** Ekspor sprite sebagai .sprite3 (vm.exportSprite). Opsional: tidak ada di mock. */
  exportSprite?(targetId: string): Promise<{ data: Uint8Array; fileName: string }>;
  addSprite(method: AddMethod, files?: readonly PickedFile[]): Promise<void>;
  addBackdrop(method: AddMethod, files?: readonly PickedFile[]): Promise<void>;

  // --- monitor ---
  updateMonitor(partial: Partial<MonitorRecord> & { id: string }): void;
  /** Nilai variabel saat ini (list disalin). targetId null = stage. */
  getVariableValue(targetId: string | null, variableId: string): ScratchValue | ScratchValue[] | undefined;
  setVariableValue(targetId: string | null, variableId: string, value: ScratchValue | ScratchValue[]): void;
  getVariableName(targetId: string | null, variableId: string): string | undefined;

  // --- panggung ---
  answerQuestion(answer: string): void;
  postMouse(data: MouseData): void;
  postKeyboard(data: KeyboardData): void;
  postWheel(deltaY: number): void;
  /** Id target pada titik panggung (koordinat Scratch), null kalau kosong. */
  pickTarget(stageX: number, stageY: number): string | null;
  /** Posisi & sifat drag target mana pun (termasuk clone). */
  getTargetDragInfo(targetId: string): { x: number; y: number; draggable: boolean; isStage: boolean } | null;
  startDrag(targetId: string): void;
  stopDrag(targetId: string): void;
  /** Bawa sprite ke depan (dipanggil saat mulai drag, seperti scratch-gui). */
  goToFront(targetId: string): void;
  /** Kanvas panggung dipasang/dilepas; host membuat renderer di atasnya. */
  attachStageCanvas(canvas: HTMLCanvasElement | null): void;
  /** Ukuran CSS kanvas berubah (renderer.resize). */
  resizeStage(width: number, height: number): void;

  // --- project ---
  newProject(): Promise<void>;
  loadProjectFile(file: PickedFile): Promise<void>;
  saveProjectFile(): Promise<Uint8Array>;
}
