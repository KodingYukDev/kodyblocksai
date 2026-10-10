/**
 * Bentuk JSON definisi blok gaya scratch-blocks (`Blockly.Block.jsonInit`), dipakai sebagai format
 * internal definisi visual. Core diekstrak dari scratch-blocks 1.1.206 (generated/), ekstensi
 * dikonversi dari ExtensionInfo (extension-json.ts, port runtime._convertForScratchBlocks).
 */

/** Blockly.OUTPUT_SHAPE_*: 1 heksagon (boolean), 2 bulat (reporter), 3 kotak (menu ekstensi). */
export type OutputShape = 1 | 2 | 3;
export const OUTPUT_SHAPE_HEXAGONAL: OutputShape = 1;
export const OUTPUT_SHAPE_ROUND: OutputShape = 2;
export const OUTPUT_SHAPE_SQUARE: OutputShape = 3;

export type DropdownOptions = [string, string][];

export interface ScratchArgJson {
  type: string;
  name?: string;
  check?: string | string[] | null;
  align?: "LEFT" | "RIGHT" | "CENTRE";
  options?: DropdownOptions;
  text?: string;
  value?: string | number;
  src?: string;
  width?: number;
  height?: number;
  alt?: string;
  flip_rtl?: boolean;
  colour?: string;
  variable?: string;
  variableType?: string;
  variableTypes?: string[];
  min?: number;
  max?: number;
  precision?: number;
}

/** Subset kunci jsonInit yang dipakai scratch-blocks vertical. `messageN`/`argsN`/`lastDummyAlignN` dinamis. */
export interface ScratchBlockJson {
  id?: string;
  message0?: string;
  args0?: ScratchArgJson[];
  category?: string;
  extensions?: string[];
  colour?: string;
  colourSecondary?: string;
  colourTertiary?: string;
  colourQuaternary?: string;
  output?: string | boolean | null;
  outputShape?: OutputShape;
  previousStatement?: string | null;
  nextStatement?: string | null;
  inputsInline?: boolean;
  checkboxInFlyout?: boolean;
  [key: string]: unknown;
}

/** Ambil message/args/lastDummyAlign baris ke-n dengan tipe yang benar. */
export function jsonLine(
  json: ScratchBlockJson,
  n: number,
): { message: string; args: ScratchArgJson[]; lastDummyAlign?: "LEFT" | "RIGHT" | "CENTRE" } | null {
  const message = json[`message${n}`];
  if (typeof message !== "string") return null;
  const args = json[`args${n}`];
  const align = json[`lastDummyAlign${n}`];
  const line: { message: string; args: ScratchArgJson[]; lastDummyAlign?: "LEFT" | "RIGHT" | "CENTRE" } = {
    message,
    args: Array.isArray(args) ? (args as ScratchArgJson[]) : [],
  };
  if (align === "LEFT" || align === "RIGHT" || align === "CENTRE") line.lastDummyAlign = align;
  return line;
}
