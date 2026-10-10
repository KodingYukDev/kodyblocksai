/**
 * Kontrak tab Kostum & Suara dengan host (app-shell). UI tab hanya membaca EditingTargetView dan
 * memanggil AssetEditorHost; host meneruskan ke runtime (padanan vm.addCostume, vm.updateSvg, dst).
 * Implementasi referensi tanpa runtime: memory-host.ts (dipakai tes & pratinjau).
 */
import type { AssetData, CostumeState, SoundState } from "@kody/engine";

export interface CostumeView {
  name: string;
  assetId: string;
  md5ext: string;
  dataFormat: CostumeState["dataFormat"];
  bitmapResolution: number;
  rotationCenterX: number;
  rotationCenterY: number;
  asset: AssetData | null;
  /** Ukuran piksel dari renderer (costume.size scratch-vm), bila diketahui. */
  size?: [number, number];
}

export interface SoundView {
  name: string;
  assetId: string;
  md5ext: string;
  dataFormat: SoundState["dataFormat"];
  rate: number;
  sampleCount: number;
  asset: AssetData | null;
}

export interface EditingTargetView {
  id: string;
  name: string;
  isStage: boolean;
  costumes: readonly CostumeView[];
  currentCostume: number;
  sounds: readonly SoundView[];
}

/** Costume baru lengkap dengan isi file. Dibuat oleh upload, paint, kamera, atau pustaka. */
export interface NewCostume {
  state: CostumeState;
  asset: AssetData;
}

export interface NewSound {
  state: SoundState;
  asset: AssetData;
}

export interface AssetEditorHost {
  getEditingTarget(): EditingTargetView | null;
  /** Listener dipanggil setiap target/costume/sound berubah (untuk useSyncExternalStore). */
  subscribe(listener: () => void): () => void;

  // --- costume (vm.*) ---
  setCostume(index: number): void;
  /** Tambah di akhir lalu pilih yang terakhir (vm.addCostume / addBackdrop untuk stage). */
  addCostumes(costumes: readonly NewCostume[]): Promise<void>;
  duplicateCostume(index: number): Promise<void>;
  /** Mengembalikan false bila ditolak (mis. costume terakhir). */
  deleteCostume(index: number): boolean;
  renameCostume(index: number, newName: string): void;
  reorderCostume(from: number, to: number): boolean;
  /** Simpan hasil paint editor (vm.updateSvg / vm.updateBitmap). Nama costume tetap. */
  updateCostume(index: number, costume: NewCostume): Promise<void>;

  // --- sound ---
  addSounds(sounds: readonly NewSound[]): Promise<void>;
  duplicateSound(index: number): Promise<void>;
  deleteSound(index: number): boolean;
  renameSound(index: number, newName: string): void;
  reorderSound(from: number, to: number): boolean;
  /** Simpan hasil editor suara (vm.updateSoundBuffer). */
  updateSound(index: number, sound: NewSound): Promise<void>;
}

/** Pemberitahuan ke pengguna (dipetakan host ke "ui:alert" pada AppBus). */
export type NotifyFn = (level: "info" | "success" | "warning" | "error", message: string) => void;

/** Penanda perangkat aktif (dipetakan host ke "ai:device-active" agar indikator kamera/mikrofon tampil). */
export type DeviceActiveFn = (device: "camera" | "microphone", active: boolean) => void;
