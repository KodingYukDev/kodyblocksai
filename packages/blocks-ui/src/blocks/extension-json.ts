/**
 * ExtensionInfo (getInfo() Scratch 3) -> definisi JSON blok + item toolbox.
 * Port dari scratch-vm 4.8.102 src/engine/runtime.js (BSD-3-Clause):
 * _convertBlockForScratchBlocks, _convertPlaceholders, _constructInlineImageJson,
 * _buildMenuForScratchBlocks, _convertMenuItems, ArgumentTypeMap. Lihat THIRD_PARTY.md.
 */
import type { ArgumentType, ExtensionBlock, ExtensionInfo, ExtensionMenu, ExtensionMenuItem } from "@kody/engine";
import type { ToolboxBlock } from "../types";
import {
  OUTPUT_SHAPE_HEXAGONAL,
  OUTPUT_SHAPE_ROUND,
  OUTPUT_SHAPE_SQUARE,
  type DropdownOptions,
  type ScratchArgJson,
  type ScratchBlockJson,
} from "./json-types";

/** Ikon loop di kanan bawah (scratch-vm: './static/blocks-media/repeat.svg'). */
export const LOOP_ICON_SRC = "media/repeat.svg";

const ARGUMENT_TYPE_MAP: Partial<Record<ArgumentType, { shadow?: { type: string; fieldName: string }; check?: string; fieldType?: string }>> = {
  angle: { shadow: { type: "math_angle", fieldName: "NUM" } },
  color: { shadow: { type: "colour_picker", fieldName: "COLOUR" } },
  number: { shadow: { type: "math_number", fieldName: "NUM" } },
  string: { shadow: { type: "text", fieldName: "TEXT" } },
  Boolean: { check: "Boolean" },
  matrix: { shadow: { type: "matrix", fieldName: "MATRIX" } },
  note: { shadow: { type: "note", fieldName: "NOTE" } },
  image: { fieldType: "field_image" },
};

export type DynamicMenuResolver = (menuName: string, functionName: string) => (string | ExtensionMenuItem)[];

export interface ConvertedExtension {
  /** opcode lengkap (`${id}_${opcode}` dan `${id}_menu_${menu}`) -> JSON. */
  blocks: Record<string, ScratchBlockJson>;
  /** Urutan palet: blok (dengan shadow default) atau pemisah (gap 36). */
  palette: (ToolboxBlock | { separator: true })[];
}

export function extensionMenuId(menuName: string, extensionId: string): string {
  return `${extensionId}_menu_${xmlEscape(menuName)}`;
}

function xmlEscape(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c] ?? c);
}

export function convertMenuItems(
  menuName: string,
  menu: ExtensionMenu,
  resolveDynamic?: DynamicMenuResolver,
): DropdownOptions {
  const items = typeof menu.items === "string" ? (resolveDynamic?.(menuName, menu.items) ?? []) : menu.items;
  return items.map((item): [string, string] => (typeof item === "string" ? [item, item] : [item.text, item.value]));
}

function buildMenuBlock(menuName: string, menu: ExtensionMenu, info: ExtensionInfo, resolve?: DynamicMenuResolver): ScratchBlockJson {
  return {
    message0: "%1",
    inputsInline: true,
    output: "String",
    colour: info.color1,
    colourSecondary: info.color2,
    colourTertiary: info.color3,
    outputShape: menu.acceptReporters ? OUTPUT_SHAPE_ROUND : OUTPUT_SHAPE_SQUARE,
    args0: [{ type: "field_dropdown", name: menuName, options: convertMenuItems(menuName, menu, resolve) }],
  };
}

interface PlaceholderContext {
  json: ScratchBlockJson;
  outLineNum: number;
  toolbox: ToolboxBlock;
}

function convertPlaceholder(
  ctx: PlaceholderContext,
  block: ExtensionBlock,
  info: ExtensionInfo,
  rawPlaceholder: string,
  resolve?: DynamicMenuResolver,
): string {
  const placeholder = rawPlaceholder.replace(/[<"&]/, "_");
  const argInfo = block.arguments?.[placeholder];
  const typeInfo = (argInfo && ARGUMENT_TYPE_MAP[argInfo.type]) || {};
  let argJson: ScratchArgJson;
  if (typeInfo.fieldType === "field_image") {
    argJson = { type: "field_image", src: argInfo?.dataURI ?? "", width: 24, height: 24, flip_rtl: argInfo?.flipRTL ?? false };
  } else {
    argJson = { type: "input_value", name: placeholder };
    const defaultValue = argInfo?.defaultValue === undefined ? "" : String(argInfo.defaultValue);
    if (typeInfo.check) argJson.check = typeInfo.check;
    let valueName: string | null;
    let shadowType: string | null;
    let fieldName: string | null;
    const menu = argInfo?.menu ? info.menus?.[argInfo.menu] : undefined;
    if (argInfo?.menu && menu) {
      if (menu.acceptReporters) {
        valueName = placeholder;
        shadowType = extensionMenuId(argInfo.menu, info.id);
        fieldName = argInfo.menu;
      } else {
        argJson = { type: "field_dropdown", name: placeholder, options: convertMenuItems(argInfo.menu, menu, resolve) };
        valueName = null;
        shadowType = null;
        fieldName = placeholder;
      }
    } else {
      valueName = placeholder;
      shadowType = typeInfo.shadow?.type ?? null;
      fieldName = typeInfo.shadow?.fieldName ?? null;
    }
    if (valueName && shadowType) {
      const inputs = (ctx.toolbox.inputs ??= {});
      inputs[valueName] = { shadow: shadowType, field: fieldName ?? "", value: defaultValue && fieldName ? defaultValue : "" };
    } else if (!valueName && fieldName && defaultValue) {
      (ctx.toolbox.fields ??= {})[fieldName] = defaultValue;
    }
  }
  const key = `args${ctx.outLineNum}`;
  const args = (ctx.json[key] as ScratchArgJson[] | undefined) ?? [];
  ctx.json[key] = args;
  args.push(argJson);
  return `%${args.length}`;
}

function convertBlock(block: ExtensionBlock, info: ExtensionInfo, resolve?: DynamicMenuResolver): { json: ScratchBlockJson; toolbox: ToolboxBlock } {
  const opcode = `${info.id}_${block.opcode}`;
  const json: ScratchBlockJson = {
    inputsInline: true,
    category: info.name,
    colour: info.color1,
    colourSecondary: info.color2,
    colourTertiary: info.color3,
  };
  const toolbox: ToolboxBlock = { opcode };
  const iconURI = block.blockIconURI ?? info.blockIconURI;
  if (iconURI) {
    json.extensions = ["scratch_extension"];
    json.message0 = "%1 %2";
    json.args0 = [{ type: "field_image", src: iconURI, width: 40, height: 40 }, { type: "field_vertical_separator" }];
  }
  let branchCount = block.branchCount ?? 0;
  switch (block.blockType) {
    case "command":
      json.outputShape = OUTPUT_SHAPE_SQUARE;
      json.previousStatement = null;
      if (!block.isTerminal) json.nextStatement = null;
      break;
    case "reporter":
      json.output = "String";
      json.outputShape = OUTPUT_SHAPE_ROUND;
      break;
    case "Boolean":
      json.output = "Boolean";
      json.outputShape = OUTPUT_SHAPE_HEXAGONAL;
      break;
    case "hat":
    case "event":
      json.outputShape = OUTPUT_SHAPE_SQUARE;
      json.nextStatement = null;
      break;
    case "conditional":
    case "loop":
      branchCount = branchCount || 1;
      json.outputShape = OUTPUT_SHAPE_SQUARE;
      json.previousStatement = null;
      if (!block.isTerminal) json.nextStatement = null;
      break;
    case "button":
      break;
  }

  const texts = Array.isArray(block.text) ? block.text : [block.text];
  let inText = 0;
  let inBranch = 0;
  let outLine = 0;
  while (inText < texts.length || inBranch < branchCount) {
    if (inText < texts.length) {
      const ctx: PlaceholderContext = { json, outLineNum: outLine, toolbox };
      const converted = (texts[inText] ?? "").replace(/\[(.+?)]/g, (_m, p: string) => convertPlaceholder(ctx, block, info, p, resolve));
      const key = `message${outLine}`;
      const prev = json[key];
      json[key] = typeof prev === "string" ? prev + converted : converted;
      ++inText;
      ++outLine;
    }
    if (inBranch < branchCount) {
      json[`message${outLine}`] = "%1";
      json[`args${outLine}`] = [{ type: "input_statement", name: `SUBSTACK${inBranch > 0 ? inBranch + 1 : ""}` }];
      ++inBranch;
      ++outLine;
    }
  }

  if (block.blockType === "reporter") {
    if (!block.disableMonitor && !toolbox.inputs) json.checkboxInFlyout = true;
  } else if (block.blockType === "loop") {
    json[`lastDummyAlign${outLine}`] = "RIGHT";
    json[`message${outLine}`] = "%1";
    json[`args${outLine}`] = [{ type: "field_image", src: LOOP_ICON_SRC, width: 24, height: 24, alt: "*", flip_rtl: true }];
  }
  return { json, toolbox };
}

/**
 * Konversi satu ekstensi. `target` menyaring blok dengan `filter` seperti getBlocksXML; blok
 * `hideFromPalette` tetap didefinisikan (agar project lama tetap tampil) tetapi tidak di palet.
 */
export function convertExtension(
  info: ExtensionInfo,
  opts: { isStage?: boolean; resolveDynamicMenu?: DynamicMenuResolver } = {},
): ConvertedExtension {
  const blocks: Record<string, ScratchBlockJson> = {};
  const palette: ConvertedExtension["palette"] = [];
  for (const [name, menu] of Object.entries(info.menus ?? {})) {
    blocks[extensionMenuId(name, info.id)] = buildMenuBlock(name, menu, info, opts.resolveDynamicMenu);
  }
  for (const block of info.blocks) {
    if (block === "---") {
      palette.push({ separator: true });
      continue;
    }
    if (block.blockType === "button") continue;
    const { json, toolbox } = convertBlock(block, info, opts.resolveDynamicMenu);
    blocks[toolbox.opcode] = json;
    if (block.hideFromPalette) continue;
    if (opts.isStage !== undefined && block.filter && !block.filter.includes(opts.isStage ? "stage" : "sprite")) continue;
    palette.push(toolbox);
  }
  return { blocks, palette };
}
