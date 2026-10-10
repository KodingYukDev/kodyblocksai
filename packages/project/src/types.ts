/** Tipe paket project. Model internal (ProjectModel) didefinisikan di @kody/engine. */
export type {
  AssetData,
  CostumeState,
  MonitorState,
  ProjectModel,
  SoundState,
  TargetState,
} from "@kody/engine";
export type * from "./sb3-types";

/** Penyimpanan asset: md5ext ("<md5>.<ext>") -> bytes. */
export interface AssetStore {
  get(md5ext: string): Uint8Array | undefined;
  set(md5ext: string, data: Uint8Array): void;
  has(md5ext: string): boolean;
  keys(): IterableIterator<string>;
}

/** AssetStore yang juga ReadonlyMap, sehingga bisa langsung ke runtime.loadProject(model, media, assets). */
export type AssetMap = AssetStore & ReadonlyMap<string, Uint8Array>;

export interface LoadedProject {
  model: import("@kody/engine").ProjectModel;
  assets: AssetMap;
  /** Peringatan non-fatal (asset hilang, opcode tak dikenal, dll). */
  warnings: string[];
}

/** Batas keamanan saat membuka file .sb3 dari pengguna. */
export const SB3_LIMITS = {
  /** Ukuran file .sb3 maksimum (byte). */
  maxFileBytes: 100 * 1024 * 1024,
  /** Ukuran project.json maksimum setelah unzip (byte). */
  maxProjectJsonBytes: 20 * 1024 * 1024,
  /** Jumlah entri zip maksimum. */
  maxZipEntries: 5000,
  /** Total byte setelah unzip (anti zip-bomb). */
  maxUncompressedBytes: 300 * 1024 * 1024,
} as const;

/** Batas struktur project.json (setelah lolos SB3_LIMITS). Melebihi = project ditolak. */
export const PROJECT_LIMITS = {
  maxTargets: 2000,
  maxBlocksPerTarget: 200_000,
  maxTotalBlocks: 500_000,
  maxVariablesPerTarget: 20_000,
  /** Scratch LIST_ITEM_LIMIT = 200000 untuk penambahan; saat memuat kita beri ruang 5x. */
  maxListItems: 1_000_000,
  maxCommentsPerTarget: 20_000,
  maxCostumesPerTarget: 10_000,
  maxSoundsPerTarget: 10_000,
  maxMonitors: 10_000,
  /** Batas panjang id/nama apa pun (blok, variabel, input, field). */
  maxIdLength: 1024,
  /** Batas teks komentar (skema sb3: maxLength 8000). */
  maxCommentText: 8000,
} as const;

export type IssueSeverity = "error" | "warning";

/** Satu temuan validasi/konversi. `path` gaya JSON pointer ringkas, mis. `targets[1].blocks.abc.opcode`. */
export interface ProjectIssue {
  severity: IssueSeverity;
  code: string;
  path: string;
  message: string;
}

/** Project ditolak; `issues` berisi semua error (dan peringatan) yang ditemukan. */
export class ProjectLoadError extends Error {
  readonly issues: ProjectIssue[];
  constructor(message: string, issues: ProjectIssue[] = []) {
    super(message);
    this.name = "ProjectLoadError";
    this.issues = issues;
  }
}

/** Kebijakan untuk opcode yang tidak ada di katalog `@kody/engine` opcodes.ts. */
export type UnknownOpcodePolicy = "reject" | "warn";

export interface DeserializeOptions {
  /** Default "reject": project dengan opcode tak dikenal ditolak beserta laporannya. */
  unknownOpcodes?: UnknownOpcodePolicy;
  /** Pembuat id (target & blok primitif). Default uid() scratch-vm. Untuk tes deterministik. */
  makeId?: () => string;
}

export interface LoadSb3Options extends DeserializeOptions {
  /** Hitung ulang md5 asset dari isinya (seperti scratch-vm createAsset). Default true. */
  rehashAssets?: boolean;
}
