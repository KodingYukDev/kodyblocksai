/**
 * Isi palet (flyout): mengubah ToolboxCategory[] (+ kategori dinamis Variables & My Blocks) menjadi
 * daftar item & blok flyout dalam format memori scratch-vm (untuk runtime.flyoutBlocks).
 * Perilaku: Toolbox.showAll_ (label di atas tiap kategori), DataCategory, Procedures.flyoutCategory,
 * id blok flyout seperti make-toolbox-xml scratch-gui (mis. `${targetId}_xposition`, id variabel).
 */
import type { Block, BlockField, VariableType } from "@kody/engine";
import type { ArgSpec, BlockDefinition, CategoryColours, ToolboxBlock, ToolboxCategory } from "../types";
import { getBlockInfo, type DefinitionLookup } from "../workspace/block-info";
import { msg, type Locale } from "../workspace/i18n";
import { createCallBlocks } from "../workspace/procedures";
import type { ProcedureParts } from "../workspace/block-info";
import type { VarModel } from "../workspace/variables";

export type FlyoutItem =
  | { kind: "label"; text: string; categoryId: string; gap: number }
  | { kind: "button"; text: string; callbackKey: string; gap: number }
  | { kind: "block"; rootId: string; gap: number; checkbox: boolean };

export interface FlyoutSection {
  categoryId: string;
  name: string;
  colours: CategoryColours;
  iconURI?: string;
  /** Index item label kategori. */
  itemIndex: number;
}

export interface FlyoutContent {
  blocks: Record<string, Block>;
  items: FlyoutItem[];
  sections: FlyoutSection[];
}

export interface FlyoutBuildContext {
  lookup: DefinitionLookup;
  locale: Locale;
  targetId: string | null;
  isStage: boolean;
  newId(): string;
  /** Variabel di workspace target (lokal + global) per tipe, sudah terurut nama. */
  variables(type: VariableType): VarModel[];
  procedures: readonly ProcedureParts[];
  /** Opsi dropdown dinamis (menu sprite/kostum/suara...) untuk nilai default; null = bukan menu dinamis. */
  dynamicOptions(opcode: string, fieldName: string, block: Block): [string, string][] | null;
}

/** GAP_Y (Flyout.MARGIN) dan jarak antar kategori (make-toolbox-xml categorySeparator). */
export const DEFAULT_GAP = 12;
export const CATEGORY_GAP = 36;

const VAR_FIELD_TYPES: Record<string, VariableType> = { VARIABLE: "", LIST: "list", BROADCAST_OPTION: "broadcast_msg" };

/** Id blok flyout persis make-toolbox-xml (dipakai sebagai id monitor). */
export function flyoutBlockId(opcode: string, targetId: string | null): string | null {
  const t = targetId ?? "";
  switch (opcode) {
    case "motion_xposition":
      return `${t}_xposition`;
    case "motion_yposition":
      return `${t}_yposition`;
    case "motion_direction":
      return `${t}_direction`;
    case "looks_costumenumbername":
      return `${t}_costumenumbername`;
    case "looks_size":
      return `${t}_size`;
    case "sound_volume":
      return `${t}_volume`;
    case "looks_backdropnumbername":
      return "backdropnumbername";
    case "sensing_answer":
      return "answer";
    case "sensing_loudness":
      return "loudness";
    case "sensing_timer":
      return "timer";
    case "sensing_current":
      return "current";
    default:
      return null;
  }
}

function base(id: string, opcode: string, extra: Partial<Block> = {}): Block {
  return { id, opcode, next: null, parent: null, inputs: {}, fields: {}, shadow: false, topLevel: false, ...extra };
}

function fieldArgs(def: BlockDefinition | undefined): ArgSpec[] {
  return def ? def.args.flat().filter((a) => a.type.startsWith("field_") && a.type !== "field_image") : [];
}

class Builder {
  readonly blocks: Record<string, Block> = {};
  readonly items: FlyoutItem[] = [];
  readonly sections: FlyoutSection[] = [];
  private readonly used = new Set<string>();

  constructor(private readonly ctx: FlyoutBuildContext) {}

  private uniqueId(preferred: string | null): string {
    let id = preferred && !this.used.has(preferred) ? preferred : this.ctx.newId();
    while (this.used.has(id)) id = this.ctx.newId();
    this.used.add(id);
    return id;
  }

  /** Isi semua field blok yang belum diberi nilai: opsi pertama dropdown, nilai default argumen. */
  private fillFields(block: Block, given: Record<string, string> = {}): void {
    const def = this.ctx.lookup(block.opcode);
    for (const spec of fieldArgs(def)) {
      if (!("name" in spec)) continue;
      const name = spec.name;
      const varType = spec.type === "field_variable" || spec.type === "field_variable_getter" ? (VAR_FIELD_TYPES[name] ?? (spec.type === "field_variable" ? spec.variableTypes[0] : spec.variableType) ?? "") : null;
      if (varType !== null) {
        block.fields[name] = this.variableField(name, varType, given[name]);
        continue;
      }
      if (given[name] !== undefined) {
        block.fields[name] = { name, value: given[name] ?? "" };
        continue;
      }
      let value: string | number = "";
      if (spec.type === "field_dropdown") {
        const opts = this.ctx.dynamicOptions(block.opcode, name, block) ?? (spec.options === "dynamic" ? [] : spec.options);
        value = opts[0]?.[1] ?? "";
      } else if (spec.type === "field_number" || spec.type === "field_angle" || spec.type === "field_note") {
        value = String(spec.value ?? 0);
      } else if (spec.type === "field_input") {
        value = spec.text ?? "";
      } else if (spec.type === "field_colour_slider") {
        value = spec.colour ?? "#ff0000";
      } else if (spec.type === "field_matrix") {
        value = spec.value ?? "0000000000000000000000000";
      }
      block.fields[name] = { name, value };
    }
    for (const [name, value] of Object.entries(given)) {
      if (!block.fields[name]) {
        const vt = VAR_FIELD_TYPES[name];
        block.fields[name] = vt !== undefined ? this.variableField(name, vt, value) : { name, value };
      }
    }
  }

  private variableField(name: string, type: VariableType, wanted: string | undefined): BlockField {
    const vars = this.ctx.variables(type);
    const hit = (wanted !== undefined ? vars.find((v) => v.name === wanted || v.id === wanted) : undefined) ?? vars[0];
    if (hit) return { name, value: hit.name, id: hit.id, variableType: type };
    // Belum ada (mis. pesan siaran pertama): nama default, id dibuat saat dipakai di workspace.
    const fallback = type === "broadcast_msg" ? "message1" : (wanted ?? "");
    return { name, value: wanted ?? fallback, id: null, variableType: type };
  }

  addToolboxBlock(tb: ToolboxBlock & { id?: string }, gap: number): void {
    const def = this.ctx.lookup(tb.opcode);
    const id = this.uniqueId(tb.id ?? flyoutBlockId(tb.opcode, this.ctx.targetId) ?? tb.opcode);
    const root = base(id, tb.opcode, { topLevel: true, x: 0, y: 0 });
    this.blocks[id] = root;
    for (const [inputName, sh] of Object.entries(tb.inputs ?? {})) {
      const sid = this.uniqueId(null);
      const shadow = base(sid, sh.shadow, { parent: id, shadow: true });
      this.blocks[sid] = shadow;
      const given: Record<string, string> = {};
      if (sh.field) given[sh.field] = String(sh.value);
      // `<field name="NUM"/>` kosong di make-toolbox-xml tetap kosong untuk shadow angka/teks;
      // untuk menu/warna "" berarti pakai opsi pertama / nilai default.
      const keepEmpty = sh.shadow === "text" || sh.shadow.startsWith("math_");
      if (sh.field && String(sh.value) === "" && !keepEmpty) delete given[sh.field];
      this.fillFields(shadow, given);
      root.inputs[inputName] = { name: inputName, block: sid, shadow: sid };
    }
    this.fillFields(root, tb.fields ?? {});
    const info = getBlockInfo(root, this.ctx.lookup);
    this.items.push({ kind: "block", rootId: id, gap, checkbox: info.checkboxInFlyout || !!def?.checkboxInFlyout });
  }

  addRaw(blocks: Block[], gap: number, checkbox = false): void {
    const root = blocks[0];
    if (!root) return;
    for (const b of blocks) {
      this.used.add(b.id);
      this.blocks[b.id] = b;
    }
    root.topLevel = true;
    root.x = 0;
    root.y = 0;
    this.items.push({ kind: "block", rootId: root.id, gap, checkbox });
  }

  setLastGap(gap: number): void {
    const last = this.items[this.items.length - 1];
    if (last) last.gap = gap;
  }

  category(cat: ToolboxCategory): void {
    this.sections.push({ categoryId: cat.id, name: cat.name, colours: cat.colours, iconURI: cat.iconURI, itemIndex: this.items.length });
    this.items.push({ kind: "label", text: cat.name, categoryId: cat.id, gap: DEFAULT_GAP });
    const start = this.items.length;
    if (cat.custom === "VARIABLE") this.dataCategory();
    else if (cat.custom === "PROCEDURE") this.procedureCategory();
    for (const entry of cat.blocks) {
      if ("opcode" in entry) this.addToolboxBlock(entry, entry.gap ?? DEFAULT_GAP);
      else if ("button" in entry) this.items.push({ kind: "button", text: entry.button, callbackKey: entry.callbackKey, gap: DEFAULT_GAP });
      else this.items.push({ kind: "label", text: entry.label, categoryId: cat.id, gap: DEFAULT_GAP });
    }
    if (this.items.length > start) this.setLastGap(CATEGORY_GAP);
  }

  private dataBlock(opcode: string, varName: string, v: VarModel, values: [string, string, string | number][] = [], gap = 8): void {
    const id = opcode === "data_variable" || opcode === "data_listcontents" ? this.uniqueId(v.id) : this.uniqueId(null);
    const root = base(id, opcode, { topLevel: true, x: 0, y: 0 });
    root.fields[varName] = { name: varName, value: v.name, id: v.id, variableType: v.type };
    this.blocks[id] = root;
    for (const [inputName, shadowType, value] of values) {
      const sid = this.uniqueId(null);
      const fieldName = shadowType === "text" ? "TEXT" : "NUM";
      this.blocks[sid] = base(sid, shadowType, { parent: id, shadow: true, fields: { [fieldName]: { name: fieldName, value: String(value) } } });
      root.inputs[inputName] = { name: inputName, block: sid, shadow: sid };
    }
    const checkbox = opcode === "data_variable" || opcode === "data_listcontents";
    this.items.push({ kind: "block", rootId: id, gap, checkbox });
  }

  /** Blockly.DataCategory. */
  private dataCategory(): void {
    const L = this.ctx.locale;
    const item = msg(L, "DEFAULT_LIST_ITEM");
    this.items.push({ kind: "button", text: msg(L, "NEW_VARIABLE"), callbackKey: "CREATE_VARIABLE", gap: DEFAULT_GAP });
    const vars = this.ctx.variables("");
    for (const v of vars) this.dataBlock("data_variable", "VARIABLE", v);
    const firstVar = vars[0];
    if (firstVar) {
      this.setLastGap(24);
      this.dataBlock("data_setvariableto", "VARIABLE", firstVar, [["VALUE", "text", 0]]);
      this.dataBlock("data_changevariableby", "VARIABLE", firstVar, [["VALUE", "math_number", 1]]);
      this.dataBlock("data_showvariable", "VARIABLE", firstVar);
      this.dataBlock("data_hidevariable", "VARIABLE", firstVar);
    }
    this.items.push({ kind: "button", text: msg(L, "NEW_LIST"), callbackKey: "CREATE_LIST", gap: DEFAULT_GAP });
    const lists = this.ctx.variables("list");
    for (const v of lists) this.dataBlock("data_listcontents", "LIST", v);
    const first = lists[0];
    if (first) {
      this.setLastGap(24);
      this.dataBlock("data_addtolist", "LIST", first, [["ITEM", "text", item]]);
      this.setLastGap(36);
      this.dataBlock("data_deleteoflist", "LIST", first, [["INDEX", "math_integer", 1]]);
      this.dataBlock("data_deletealloflist", "LIST", first);
      this.dataBlock("data_insertatlist", "LIST", first, [["INDEX", "math_integer", 1], ["ITEM", "text", item]]);
      this.dataBlock("data_replaceitemoflist", "LIST", first, [["INDEX", "math_integer", 1], ["ITEM", "text", item]]);
      this.setLastGap(36);
      this.dataBlock("data_itemoflist", "LIST", first, [["INDEX", "math_integer", 1]]);
      this.dataBlock("data_itemnumoflist", "LIST", first, [["ITEM", "text", item]]);
      this.dataBlock("data_lengthoflist", "LIST", first);
      this.dataBlock("data_listcontainsitem", "LIST", first, [["ITEM", "text", item]]);
      this.setLastGap(36);
      this.dataBlock("data_showlist", "LIST", first);
      this.dataBlock("data_hidelist", "LIST", first);
    }
  }

  /** Blockly.Procedures.flyoutCategory. */
  private procedureCategory(): void {
    this.items.push({ kind: "button", text: msg(this.ctx.locale, "NEW_PROCEDURE"), callbackKey: "CREATE_PROCEDURE", gap: DEFAULT_GAP });
    for (const p of this.ctx.procedures) {
      this.addRaw(createCallBlocks(p, () => this.uniqueId(null)), 16);
    }
  }
}

export function buildFlyoutContent(categories: readonly ToolboxCategory[], ctx: FlyoutBuildContext): FlyoutContent {
  const b = new Builder(ctx);
  for (const cat of categories) b.category(cat);
  return { blocks: b.blocks, items: b.items, sections: b.sections };
}

