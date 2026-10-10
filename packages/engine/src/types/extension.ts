/**
 * Extension API - padanan getInfo() ekstensi Scratch 3 (extension-support/*).
 * Dipakai packages/ext-pen, packages/ext-music, packages/ai.
 * Engine mendaftarkan opcode `${id}_${block.opcode}` dan menu shadow `${id}_menu_${menuName}`
 * (field menu bernama sama dengan menuName), persis scratch-vm.
 */
import type { ScratchValue } from "./project-model";
import type { BlockPackage, HatMetadata, IRuntime, PrimitiveFn } from "./runtime";

/** Nilai string persis extension-support/argument-type.js. */
export type ArgumentType =
  | "angle"
  | "Boolean"
  | "color"
  | "number"
  | "string"
  | "matrix"
  | "note"
  | "image"
  | "costume"
  | "sound";

/** Nilai string persis extension-support/block-type.js. */
export type ExtensionBlockType =
  | "Boolean"
  | "button"
  | "command"
  | "conditional"
  | "event"
  | "hat"
  | "loop"
  | "reporter";

export type TargetFilter = "sprite" | "stage";

export interface ExtensionArgument {
  type: ArgumentType;
  defaultValue?: ScratchValue;
  /** Nama menu di ExtensionInfo.menus. */
  menu?: string;
  /** Untuk type "image". */
  dataURI?: string;
  flipRTL?: boolean;
}

export interface ExtensionBlock {
  opcode: string;
  blockType: ExtensionBlockType;
  /** Teks blok dengan placeholder [ARG], mis. "set pen [COLOR_PARAM] to [VALUE]". */
  text: string | string[];
  arguments?: Record<string, ExtensionArgument>;
  /** Nama method handler kalau beda dari opcode. */
  func?: string;
  isTerminal?: boolean;
  isEdgeActivated?: boolean;
  shouldRestartExistingThreads?: boolean;
  /** Untuk conditional/loop. */
  branchCount?: number;
  disableMonitor?: boolean;
  filter?: TargetFilter[];
  blockIconURI?: string;
  hideFromPalette?: boolean;
}

export interface ExtensionMenuItem {
  text: string;
  value: string;
}

export interface ExtensionMenu {
  /** true = menu jadi shadow yang boleh ditutup reporter (field + input). */
  acceptReporters?: boolean;
  /** Item statis, atau nama method dinamis (dipanggil dengan targetId) seperti Scratch. */
  items: (string | ExtensionMenuItem)[] | string;
}

export interface ExtensionInfo {
  id: string;
  name: string;
  /** Warna blok utama/sekunder/tersier (Scratch: color1, color2, color3). */
  color1: string;
  color2: string;
  color3: string;
  menuIconURI?: string;
  blockIconURI?: string;
  docsURI?: string;
  blocks: (ExtensionBlock | "---")[];
  menus?: Record<string, ExtensionMenu>;
}

/**
 * Modul ekstensi. getPrimitives() memakai kunci opcode TANPA prefix id (mis. "penDown");
 * runtime menambahkan prefix. Menu dinamis: method dengan nama di ExtensionMenu.items.
 */
export interface ExtensionModule extends BlockPackage {
  getInfo(): ExtensionInfo;
  getPrimitives(): Record<string, PrimitiveFn>;
  getHats?(): Record<string, HatMetadata>;
  /** Menu dinamis: nama -> fungsi(targetId) yang mengembalikan item. */
  getDynamicMenus?(): Record<string, (targetId: string | null) => (string | ExtensionMenuItem)[]>;
  /** Dipanggil saat project ditutup / ekstensi dicabut. */
  dispose?(): void;
}

export type ExtensionFactory = (runtime: IRuntime) => ExtensionModule;

/** Ekstensi bawaan yang dikenal app (id -> loader lazy). */
export interface ExtensionCatalogEntry {
  id: string;
  name: string;
  description: string;
  iconURL?: string;
  /** Diisi app; dynamic import agar bundel AI tidak dimuat sebelum dipakai. */
  load: () => Promise<ExtensionFactory>;
  /** Butuh kamera / mikrofon / internet - ditampilkan di galeri ekstensi. */
  requires?: ("camera" | "microphone" | "internet")[];
}
