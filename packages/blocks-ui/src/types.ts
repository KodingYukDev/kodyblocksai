/**
 * Definisi blok visual (padanan Blockly JSON scratch-blocks: message0/args0) dan antarmuka editor.
 * Engine tidak bergantung paket ini.
 */
import type { BlockShape, IRuntime, OpcodeCategory } from "@kody/engine";

export type ArgSpec =
  | { type: "input_value"; name: string; check?: "Boolean" | "Number" | "String" | null }
  | { type: "input_statement"; name: string }
  | { type: "field_dropdown"; name: string; options: [string, string][] | "dynamic" }
  | { type: "field_variable"; name: string; variableTypes: ("" | "list" | "broadcast_msg")[] }
  | { type: "field_variable_getter"; name: string; variableType: "" | "list" }
  | { type: "field_number"; name: string; value?: number; min?: number; max?: number; precision?: number }
  | { type: "field_angle"; name: string; value?: number }
  | { type: "field_input"; name: string; text?: string }
  | { type: "field_colour_slider"; name: string; colour?: string }
  | { type: "field_note"; name: string; value?: number }
  | { type: "field_matrix"; name: string; value?: string }
  | { type: "field_image"; src: string; width: number; height: number; flipRtl?: boolean }
  | { type: "field_label_serializable"; name: string };

export interface CategoryColours {
  primary: string;
  secondary: string;
  tertiary: string;
  quaternary: string;
}

export interface BlockDefinition {
  opcode: string;
  category: OpcodeCategory;
  shape: BlockShape;
  /** Pesan dengan placeholder %1, %2 ... sesuai args0 (bisa >1 baris untuk C-block: message1, message2). */
  messages: string[];
  args: ArgSpec[][];
  /** Override warna (ekstensi); default dari kategori. */
  colours?: CategoryColours;
  /** Reporter yang menampilkan checkbox monitor di flyout. */
  checkboxInFlyout?: boolean;
  /** Output reporter: "Boolean" atau "String/Number". */
  output?: "Boolean" | "String" | "Number" | null;
  /** Untuk hat dengan topi bergaya "cat" (Scratch: hat biasa). */
  isHat?: boolean;
  /** Ikon ekstensi di kiri blok. */
  iconURI?: string;
}

/** Item toolbox (urutan & shadow default persis toolbox-xml scratch-gui). */
export interface ToolboxBlock {
  opcode: string;
  /** Shadow default per input: nama input -> [opcode shadow, nilai field]. */
  inputs?: Record<string, { shadow: string; field: string; value: string | number }>;
  fields?: Record<string, string>;
  gap?: number;
}

export interface ToolboxCategory {
  id: string;
  name: string;
  colours: CategoryColours;
  iconURI?: string;
  blocks: (ToolboxBlock | { label: string } | { button: string; callbackKey: string })[];
  /** Kategori dinamis: "VARIABLE" | "PROCEDURE" (diisi dari target). */
  custom?: "VARIABLE" | "PROCEDURE";
}

export interface BlocksEditorProps {
  runtime: IRuntime;
  /** Target yang sedang diedit. */
  targetId: string | null;
  locale: "id" | "en";
  /** Skala zoom awal (scratch-gui: 0.675). */
  initialScale?: number;
  /** Dipanggil setiap workspace berubah (untuk autosave). */
  onChange?: () => void;
  /** Kategori ekstensi tambahan (pen, music, AI). */
  extensionCategories?: ToolboxCategory[];
}

/** Kontroler workspace imperatif (dipakai app untuk aksi menu: clean up, undo, dll). */
export interface WorkspaceController {
  undo(): void;
  redo(): void;
  cleanUp(): void;
  zoom(delta: number): void;
  resetZoom(): void;
  scrollToCategory(categoryId: string): void;
  /** Muat ulang dari target.blocks (ganti target / load project). */
  reload(): void;
  dispose(): void;
}
