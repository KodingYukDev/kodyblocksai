/**
 * Aksi editor: context menu (blok, workspace, palet), Duplicate (ikut kursor), Delete Block (heal),
 * edit field (teks/angka, dropdown, warna), tombol palet (Make a Variable/List/Block),
 * ganti nama/hapus variabel, pesan siaran baru, laporan nilai reporter.
 */
import type { Block, EditorWorkspaceEvent, IBlocksContainer, ScratchValue, VariableType } from "@kody/engine";
import type { ArgSpec } from "../types";
import type { BlocksWorkspace } from "./editor";
import { allPlacements } from "./connections";
import { showAlert, showConfirm, showPrompt } from "./dialogs";
import { dynamicMenuOptions } from "./dynamic-menus";
import { msg } from "./i18n";
import { layoutStack } from "./layout";
import { blockingProcedure, copyTree, definitionProccode, deleteBlockEvents, findCallers } from "./ops";
import { showProcedureDialog } from "./procedure-dialog";
import { createDefinitionBlocks, procedureExists } from "./procedures";
import { editProcedureEvents } from "./procedure-edit";
import { readProcedureMutation } from "./block-info";
import { orderedTopBlocks } from "./cleanup";
import { countDeleteBlocks, getTopBlocks, type BlockMap } from "./tree";
import { resolveDraggable } from "./gesture";
import { BlockReducer } from "./reducer";
import {
  DELETE_VARIABLE_ID,
  NEW_BROADCAST_MESSAGE_ID,
  RENAME_VARIABLE_ID,
  resolveBroadcastName,
  validateVariableName,
  varCreateEvent,
  variableDropdownOptions,
} from "./variables";
import { colourPicker, contextMenu, dropdownMenu, reportBubble, type MenuOption } from "./widgets";

type Region = "workspace" | "flyout" | "other";
type FieldSpec = Exclude<ArgSpec, { type: "input_value" } | { type: "input_statement" } | { type: "field_image" }>;

const VAR_TYPES: Record<string, VariableType> = { VARIABLE: "", LIST: "list", BROADCAST_OPTION: "broadcast_msg" };

export class EditorActions {
  constructor(private readonly ws: BlocksWorkspace) {}

  private get L() {
    return this.ws.locale;
  }

  private rootLocal(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.ws.root.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  }

  // ---------------------------------------------------------------------------
  // Context menu
  // ---------------------------------------------------------------------------

  showContextMenu(region: Region, blockId: string | null, clientX: number, clientY: number): void {
    const ws = this.ws;
    const options = region === "flyout" ? this.flyoutMenu(blockId) : blockId ? this.blockMenu(blockId, clientX, clientY) : this.workspaceMenu();
    if (!options.length) return;
    const pos = this.rootLocal(clientX, clientY);
    ws.overlay.show(contextMenu(ws.doc, options, () => ws.overlay.hide()), pos.x, pos.y);
  }

  private workspaceMenu(): MenuOption[] {
    const ws = this.ws;
    const blocks = ws.blocks();
    const tops = getTopBlocks(blocks);
    const deleteCount = Object.values(blocks).filter((b) => !b.shadow).length;
    return [
      { text: msg(this.L, "UNDO"), enabled: ws.undoStack.canUndo(), callback: () => ws.undo() },
      { text: msg(this.L, "REDO"), enabled: ws.undoStack.canRedo(), callback: () => ws.redo() },
      { text: msg(this.L, "CLEAN_UP"), enabled: tops.length > 1, callback: () => ws.cleanUp() },
      {
        text: deleteCount === 1 ? msg(this.L, "DELETE_BLOCK") : msg(this.L, "DELETE_X_BLOCKS", String(deleteCount)),
        enabled: deleteCount > 0,
        callback: () => void this.deleteAll(deleteCount),
      },
    ];
  }

  private async deleteAll(count: number): Promise<void> {
    if (count >= 2 && !(await showConfirm(this.ws.root, this.L, msg(this.L, "DELETE_ALL_BLOCKS", String(count))))) return;
    const blocks = this.ws.blocks();
    const events: EditorWorkspaceEvent[] = [];
    // Define yang masih dipanggil tetap dihapus bersama pemanggilnya (semua blok dihapus).
    for (const id of orderedTopBlocks(blocks)) events.push({ type: "delete", blockId: id });
    this.ws.apply(events);
  }

  private blockMenu(rawId: string, clientX: number, clientY: number): MenuOption[] {
    const ws = this.ws;
    const blocks = ws.blocks();
    const id = resolveDraggable(blocks, rawId);
    const block = id ? blocks[id] : undefined;
    if (!id || !block) return this.workspaceMenu();
    const L = this.L;
    const count = countDeleteBlocks(blocks, id);
    const del: MenuOption = {
      text: count === 1 ? msg(L, "DELETE_BLOCK") : msg(L, "DELETE_X_BLOCKS", String(count)),
      enabled: true,
      callback: () => void this.deleteBlock(id),
    };
    const dup: MenuOption = { text: msg(L, "DUPLICATE"), enabled: true, callback: () => this.duplicate(id, clientX, clientY) };
    if (block.opcode === "procedures_definition") {
      return [del, { text: msg(L, "EDIT_PROCEDURE"), enabled: true, callback: () => void this.editProcedure(id) }];
    }
    const out: MenuOption[] = [dup, del];
    if (block.opcode === "procedures_call") {
      out.push({ text: msg(L, "EDIT_PROCEDURE"), enabled: true, callback: () => void this.editProcedure(id) });
    }
    const varField = block.opcode === "data_variable" ? "VARIABLE" : block.opcode === "data_listcontents" ? "LIST" : null;
    if (varField) {
      // contextMenu_getVariableBlock: ganti ke variabel lain dengan tipe sama.
      const type = VAR_TYPES[varField] ?? "";
      for (const v of ws.variablesOfType(type)) {
        out.push({ text: v.name, enabled: true, callback: () => ws.apply([{ type: "change", blockId: id, element: "field", name: varField, value: v.id }]) });
      }
    }
    return out;
  }

  private flyoutMenu(blockId: string | null): MenuOption[] {
    if (!blockId) return [];
    const ws = this.ws;
    const b = ws.flyoutContent.blocks[blockId];
    if (!b) return [];
    const L = this.L;
    if (b.opcode === "data_variable" || b.opcode === "data_listcontents") {
      const fieldName = b.opcode === "data_variable" ? "VARIABLE" : "LIST";
      const f = b.fields[fieldName];
      const varId = f?.id;
      if (!varId) return [];
      const isList = fieldName === "LIST";
      return [
        { text: msg(L, isList ? "RENAME_LIST" : "RENAME_VARIABLE"), enabled: true, callback: () => void this.renameVariable(varId) },
        { text: msg(L, isList ? "DELETE_LIST" : "DELETE_VARIABLE", String(f?.value ?? "")), enabled: true, callback: () => this.deleteVariable(varId) },
      ];
    }
    if (b.opcode === "procedures_call") {
      const proto = Object.values(ws.blocks()).find(
        (x) => x.opcode === "procedures_prototype" && x.mutation?.proccode === b.mutation?.proccode,
      );
      const defId = proto?.parent ?? null;
      return defId ? [{ text: msg(L, "EDIT_PROCEDURE"), enabled: true, callback: () => void this.editProcedure(defId) }] : [];
    }
    return [];
  }

  // ---------------------------------------------------------------------------
  // Hapus / duplikat
  // ---------------------------------------------------------------------------

  async deleteBlock(id: string): Promise<void> {
    const ws = this.ws;
    const blocks = ws.blocks();
    const block = blocks[id];
    if (!block) return;
    if (block.opcode === "procedures_definition") {
      const code = definitionProccode(blocks, id);
      if (code !== null && findCallers(blocks, code, id).length > 0) {
        await showAlert(ws.root, this.L, msg(this.L, "PROCEDURE_USED"));
        return;
      }
      // deleteProcedureDefCallback: seluruh stack define dihapus.
      ws.apply([{ type: "delete", blockId: id }]);
      return;
    }
    const placements = allPlacements(ws.deps(blocks));
    const pos = placements.find((p) => p.layout.id === id);
    const nextPos = block.next ? placements.find((p) => p.layout.id === block.next) : undefined;
    const events = deleteBlockEvents(blocks, id, pos ? { x: pos.x, y: pos.y } : { x: 0, y: 0 }, nextPos ? { x: nextPos.x, y: nextPos.y } : null);
    if (ws.selected === id) ws.selected = null;
    ws.apply(events);
  }

  /** duplicateAndDragCallback: salin blok + bawahnya dengan id baru, lalu ikut kursor. */
  duplicate(id: string, clientX: number, clientY: number): void {
    const ws = this.ws;
    const blocks = ws.blocks();
    const pos = allPlacements(ws.deps(blocks)).find((p) => p.layout.id === id);
    const xy = pos ? { x: pos.x, y: pos.y } : { x: 0, y: 0 };
    const copy = copyTree(blocks, id, ws.newId, xy, true);
    const root = copy[0];
    if (!root) return;
    const forward: EditorWorkspaceEvent[] = [{ type: "create", blocks: copy }];
    const inverse = ws.applyRaw(forward);
    ws.gesture.beginDrag(root.id, null, clientX, clientY, forward, inverse, true);
  }

  /** Salin blok palet ke workspace (Flyout.placeNewBlock_) + buat pesan siaran default bila perlu. */
  instantiateFromFlyout(rootId: string, xy: { x: number; y: number }): { events: EditorWorkspaceEvent[]; topId: string | null } {
    const ws = this.ws;
    const copy = copyTree(ws.flyoutContent.blocks, rootId, ws.newId, xy, false);
    const root = copy[0];
    if (!root) return { events: [], topId: null };
    const events: EditorWorkspaceEvent[] = [];
    for (const b of copy) {
      for (const [name, f] of Object.entries(b.fields)) {
        const type = VAR_TYPES[name];
        if (type === undefined || f.id) continue;
        const existing = ws.variablesOfType(type).find((v) => v.name === String(f.value));
        if (existing) {
          f.id = existing.id;
        } else {
          const vid = ws.newId();
          f.id = vid;
          events.push(varCreateEvent(vid, String(f.value), type, false, false));
        }
      }
    }
    events.push({ type: "create", blocks: copy });
    return { events, topId: root.id };
  }

  // ---------------------------------------------------------------------------
  // Field
  // ---------------------------------------------------------------------------

  private fieldSpec(block: Block, name: string): FieldSpec | null {
    if (block.opcode === "argument_reporter_string_number" || block.opcode === "argument_reporter_boolean") return null;
    const def = this.ws.lookup(block.opcode);
    const spec = def?.args.flat().find((a): a is FieldSpec => "name" in a && a.name === name && a.type.startsWith("field_"));
    if (spec) return spec;
    const f = block.fields[name];
    if (!f) return null;
    if (VAR_TYPES[name] !== undefined) return { type: "field_variable", name, variableTypes: [VAR_TYPES[name] ?? ""] };
    return { type: "field_input", name };
  }

  isEditableField(blocks: BlockMap, blockId: string, name: string): boolean {
    const b = blocks[blockId];
    if (!b) return false;
    const spec = this.fieldSpec(b, name);
    return !!spec && spec.type !== "field_label_serializable" && spec.type !== "field_variable_getter";
  }

  editField(region: "workspace" | "flyout", blockId: string, name: string, anchor: Element): void {
    const ws = this.ws;
    const flyoutBlocks = ws.runtime.flyoutBlocks;
    const container: IBlocksContainer | null = region === "flyout" ? flyoutBlocks : ws.container;
    const block = region === "flyout" ? ws.flyoutContent.blocks[blockId] : ws.blocks()[blockId];
    if (!block) return;
    const spec = this.fieldSpec(block, name);
    if (!spec || spec.type === "field_label_serializable" || spec.type === "field_variable_getter") return;
    const rect = anchor.getBoundingClientRect();
    const pos = this.rootLocal(rect.left, rect.bottom + 4);
    const commit = (value: string | number): void => {
      const ev: EditorWorkspaceEvent = { type: "change", blockId, element: "field", name, value };
      if (region === "flyout") {
        const f = block.fields[name];
        if (f) {
          const vt = VAR_TYPES[name];
          if (vt !== undefined) {
            const v = ws.variablesOfType(vt).find((x) => x.id === value);
            f.id = String(value);
            f.value = v?.name ?? String(value);
          } else {
            f.value = value;
          }
        }
        try {
          flyoutBlocks.applyEditorEvent(ev);
        } catch {
          /* engine belum siap */
        }
        ws.renderFlyout();
      } else {
        ws.apply([ev], { refreshFlyout: false });
      }
    };
    const colours = ws.infoOf(block).colours;
    if (spec.type === "field_dropdown" || spec.type === "field_variable") {
      let options: [string, string][];
      const current = spec.type === "field_variable" ? String(block.fields[name]?.id ?? "") : String(block.fields[name]?.value ?? "");
      if (spec.type === "field_variable") {
        const type = VAR_TYPES[name] ?? spec.variableTypes[0] ?? "";
        options = variableDropdownOptions(ws.variablesOfType(type), type, ws.fieldText(block, name, container), this.L);
      } else {
        options = dynamicMenuOptions(ws.menuContext(container), block, name) ?? (spec.options === "dynamic" ? [] : spec.options);
      }
      const menu = dropdownMenu(ws.doc, options, current, colours, (value) => {
        ws.overlay.hide();
        if (value === RENAME_VARIABLE_ID) void this.renameVariable(current);
        else if (value === DELETE_VARIABLE_ID) this.deleteVariable(current);
        else if (value === NEW_BROADCAST_MESSAGE_ID) void this.newBroadcast(commit);
        else if (value !== current) commit(value);
      });
      ws.overlay.show(menu, pos.x, pos.y);
      return;
    }
    if (spec.type === "field_colour_slider") {
      const L = this.L;
      const labels: [string, string, string] = L === "id" ? ["Warna", "Saturasi", "Kecerahan"] : ["Color", "Saturation", "Brightness"];
      const picker = colourPicker(ws.doc, String(block.fields[name]?.value ?? "#ff0000"), labels, (hex, final) => {
        if (final) commit(hex);
      });
      ws.overlay.show(picker, pos.x, pos.y);
      return;
    }
    this.textEditor(spec, block, name, rect, commit);
  }

  private textEditor(spec: FieldSpec, block: Block, name: string, rect: DOMRect, commit: (v: string) => void): void {
    const ws = this.ws;
    const input = ws.doc.createElement("input");
    input.type = "text";
    input.className = "kb-field-editor";
    const original = String(block.fields[name]?.value ?? "");
    input.value = original;
    const local = this.rootLocal(rect.left, rect.top);
    input.style.left = `${local.x}px`;
    input.style.top = `${local.y}px`;
    input.style.minWidth = `${Math.max(rect.width, 40)}px`;
    input.style.height = `${rect.height}px`;
    input.style.borderRadius = `${rect.height / 2}px`;
    const restrictor = numberRestrictor(spec, block.opcode);
    if (restrictor) {
      input.inputMode = "decimal";
      input.addEventListener("beforeinput", (e) => {
        const data = (e as InputEvent).data;
        if (data && ![...data].every((ch) => restrictor.test(ch))) e.preventDefault();
      });
    }
    let done = false;
    const finish = (save: boolean): void => {
      if (done) return;
      done = true;
      input.remove();
      if (save && input.value !== original) commit(input.value);
    };
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") finish(true);
      else if (e.key === "Escape") finish(false);
    });
    input.addEventListener("blur", () => finish(true));
    input.addEventListener("pointerdown", (e) => e.stopPropagation());
    ws.root.appendChild(input);
    input.focus();
    input.select();
  }

  // ---------------------------------------------------------------------------
  // Variabel, list, pesan, procedure
  // ---------------------------------------------------------------------------

  async flyoutButton(key: string): Promise<void> {
    if (key === "CREATE_VARIABLE") await this.createVariable("");
    else if (key === "CREATE_LIST") await this.createVariable("list");
    else if (key === "CREATE_PROCEDURE") await this.createProcedure();
  }

  async createVariable(type: VariableType): Promise<void> {
    const ws = this.ws;
    const L = this.L;
    const isList = type === "list";
    const isStage = !!ws.target?.isStage;
    const res = await showPrompt(ws.root, L, {
      title: msg(L, isList ? "LIST_MODAL_TITLE" : "VARIABLE_MODAL_TITLE"),
      label: msg(L, isList ? "NEW_LIST_TITLE" : "NEW_VARIABLE_TITLE"),
      showScope: !isStage,
      showCloud: !isList && !!ws.extras.allowCloudVariables,
      validate: (name, scope, cloud) => {
        const additional = scope === "local" ? [] : ws.runtime.getAllVarNamesOfType(type);
        const r = validateVariableName(name, type, ws.variablesOfType(type), additional, cloud, L);
        return r.ok ? null : r.error;
      },
    });
    if (!res) return;
    const additional = res.scope === "local" ? [] : ws.runtime.getAllVarNamesOfType(type);
    const r = validateVariableName(res.name, type, ws.variablesOfType(type), additional, res.isCloud, L);
    if (!r.ok) return;
    const id = ws.newId();
    ws.apply([varCreateEvent(id, r.name, type, res.scope === "local" && !isStage, res.isCloud)]);
    // Variabel baru langsung dicentang (flyout.setCheckboxState(id, true)).
    ws.toggleMonitor(id, true);
  }

  async renameVariable(varId: string): Promise<void> {
    const ws = this.ws;
    const v = ws.inverseDeps().getVariable(varId);
    if (!v) return;
    const isList = v.type === "list";
    const L = this.L;
    const res = await showPrompt(ws.root, L, {
      title: msg(L, isList ? "RENAME_LIST_MODAL_TITLE" : "RENAME_VARIABLE_MODAL_TITLE"),
      label: msg(L, isList ? "RENAME_LIST_TITLE" : "RENAME_VARIABLE_TITLE", v.name),
      defaultValue: v.name,
      validate: (name) => {
        const trimmed = name.trim();
        if (!trimmed || trimmed === v.name) return null;
        const others = ws.variablesOfType(v.type).filter((x) => x.id !== v.id);
        const r = validateVariableName(trimmed, v.type, others, v.isLocal ? [] : ws.runtime.getAllVarNamesOfType(v.type), false, L);
        return r.ok ? null : r.error;
      },
    });
    const name = res?.name.trim();
    if (!name || name === v.name) return;
    ws.apply([{ type: "var_rename", varId, newName: v.isCloud && !name.startsWith("☁ ") ? `☁ ${name}` : name }]);
  }

  /** Workspace.deleteVariableById: hapus semua pemakaian (heal) lalu variabelnya. */
  deleteVariable(varId: string): void {
    const ws = this.ws;
    const blocks = ws.blocks();
    const events: EditorWorkspaceEvent[] = [];
    const uses = Object.values(blocks).filter((b) => Object.values(b.fields).some((f) => f.id === varId) && !b.shadow);
    let state: BlockMap = blocks;
    for (const use of uses) {
      if (!state[use.id]) continue;
      const evs = deleteBlockEvents(state, use.id, { x: use.x ?? 0, y: use.y ?? 0 }, null);
      events.push(...evs);
      state = simulate(state, evs);
    }
    events.push({ type: "var_delete", varId });
    ws.apply(events);
  }

  private async newBroadcast(commit: (value: string) => void): Promise<void> {
    const ws = this.ws;
    const L = this.L;
    const res = await showPrompt(ws.root, L, { title: msg(L, "BROADCAST_MODAL_TITLE"), label: msg(L, "NEW_BROADCAST_MESSAGE_TITLE") });
    if (!res) return;
    const resolved = resolveBroadcastName(res.name, ws.variablesOfType("broadcast_msg"));
    if (!resolved) return;
    if (resolved.existingId) {
      commit(resolved.existingId);
      return;
    }
    const id = ws.newId();
    ws.apply([varCreateEvent(id, resolved.name, "broadcast_msg", false, false)]);
    commit(id);
  }

  async createProcedure(): Promise<void> {
    const ws = this.ws;
    const proc = await showProcedureDialog(ws.root, { locale: this.L, newId: ws.newId });
    if (!proc || procedureExists(ws.blocks(), proc.proccode)) return;
    // Pojok kiri atas area terlihat + 30 (createProcedureCallbackFactory_).
    const xy = { x: (-ws.view.scrollX + 30) / ws.view.scale, y: (-ws.view.scrollY + 30) / ws.view.scale };
    ws.apply([{ type: "create", blocks: createDefinitionBlocks(proc, ws.newId, xy) }]);
  }

  /** Context menu "Edit" pada define/pemanggil: buka dialog dengan isi prototype lalu perbarui semua. */
  async editProcedure(blockId: string): Promise<void> {
    const ws = this.ws;
    const blocks = ws.blocks();
    const b = blocks[blockId];
    let defId: string | null = null;
    if (b?.opcode === "procedures_definition") defId = blockId;
    else if (b?.opcode === "procedures_call") {
      const code = readProcedureMutation(b).proccode;
      const proto = Object.values(blocks).find((x) => x.opcode === "procedures_prototype" && readProcedureMutation(x).proccode === code);
      defId = proto?.parent ?? null;
    }
    const protoId = defId ? blocks[defId]?.inputs.custom_block?.block : null;
    const proto = protoId ? blocks[protoId] : undefined;
    if (!defId || !proto) return;
    const initial = readProcedureMutation(proto);
    const next = await showProcedureDialog(ws.root, { locale: this.L, newId: ws.newId, initial });
    if (!next) return;
    if (next.proccode !== initial.proccode && procedureExists(ws.blocks(), next.proccode)) return;
    const events = editProcedureEvents(ws.blocks(), defId, next, ws.newId);
    if (!events.length) return;
    ws.applyRaw(events);
    // Kebalikan edit procedure tidak bisa dinyatakan dengan event (VM mengabaikan hapus shadow): riwayat dikosongkan.
    ws.undoStack.clear();
    ws.changed(true);
  }

  // ---------------------------------------------------------------------------
  // Lain-lain
  // ---------------------------------------------------------------------------

  /** Gelembung nilai di bawah blok yang diklik (workspace.reportValue). */
  reportValue(id: string, value: ScratchValue): void {
    const ws = this.ws;
    const el =
      Array.from(ws.root.querySelectorAll("[data-flyout-root]")).find((e) => e.getAttribute("data-flyout-root") === id) ??
      Array.from(ws.canvas.querySelectorAll(".kb-stack")).find((e) => e.getAttribute("data-top-id") === id);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pos = this.rootLocal(r.left, r.bottom + 6);
    ws.overlay.show(reportBubble(ws.doc, String(value)), pos.x, pos.y);
  }

  /** onTargetsUpdate scratch-gui: isi x/y default blok gerak di palet dengan posisi sprite. */
  updateFlyoutPositions(): void {
    const ws = this.ws;
    const t = ws.target;
    if (!t || t.isStage) return;
    const x = String(Math.round(t.x));
    const y = String(Math.round(t.y));
    let changed = false;
    for (const item of ws.flyoutContent.items) {
      if (item.kind !== "block") continue;
      const b = ws.flyoutContent.blocks[item.rootId];
      if (!b || !["motion_gotoxy", "motion_glidesecstoxy", "motion_setx", "motion_sety"].includes(b.opcode)) continue;
      for (const [inputName, val] of [["X", x], ["Y", y]] as const) {
        const sid = b.inputs[inputName]?.shadow;
        const s = sid ? ws.flyoutContent.blocks[sid] : undefined;
        const f = s?.fields.NUM;
        if (s && f && String(f.value) !== val) {
          f.value = val;
          changed = true;
          try {
            ws.runtime.flyoutBlocks.applyEditorEvent({ type: "change", blockId: s.id, element: "field", name: "NUM", value: val });
          } catch {
            /* engine belum siap */
          }
        }
      }
    }
    if (changed) ws.renderFlyout();
  }

  stackHeight(id: string): number {
    return layoutStack(this.ws.deps(), id).height;
  }

  canDelete(blocks: BlockMap, id: string): boolean {
    return blockingProcedure(blocks, id) === null;
  }
}

/** Terapkan event ke salinan peta (untuk merangkai beberapa delete berurutan). */
function simulate(blocks: BlockMap, events: EditorWorkspaceEvent[]): BlockMap {
  const reducer = new BlockReducer(Object.values(blocks));
  for (const ev of events) reducer.apply(ev);
  return reducer.blocks;
}

/** FieldNumber.getNumRestrictor: digit, '.' bila desimal, '-' bila negatif, 'e' bila desimal. */
export function numberRestrictor(spec: FieldSpec, shadowOpcode: string): RegExp | null {
  let min: number | undefined;
  let precision: number | undefined;
  if (spec.type === "field_number") {
    min = spec.min;
    precision = spec.precision;
  } else if (spec.type !== "field_angle") {
    return null;
  }
  if (shadowOpcode === "math_positive_number") min = 0;
  if (shadowOpcode === "math_whole_number") {
    min = 0;
    precision = 1;
  }
  if (shadowOpcode === "math_integer") precision = 1;
  const decimal = precision === undefined || Number.isNaN(precision) || precision === 0 || Math.floor(precision) !== precision;
  const negative = min === undefined || Number.isNaN(min) || min < 0;
  let pattern = "[\\d]";
  if (decimal) pattern += "|[\\.]";
  if (negative) pattern += "|[-]";
  if (decimal) pattern += "|[eE]";
  return new RegExp(pattern);
}
