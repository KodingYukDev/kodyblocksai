/**
 * Undo/redo workspace. Setiap aksi pengguna = satu grup event (padanan Blockly.Events group).
 * Kebalikan tiap event dihitung dari keadaan blok TEPAT SEBELUM event diterapkan,
 * sehingga undo cukup menerapkan daftar kebalikan dalam urutan terbalik.
 * Stack dikosongkan saat ganti target (scratch-gui: workspace.clearUndo() di onWorkspaceUpdate).
 */
import type { Block, CommentState, EditorWorkspaceEvent, VariableType } from "@kody/engine";

export type BlockGetter = (id: string) => Block | undefined;

export interface VarInfo {
  id: string;
  name: string;
  type: VariableType;
  isLocal: boolean;
  isCloud: boolean;
}

export interface InverseDeps {
  getBlock: BlockGetter;
  getVariable(id: string): VarInfo | undefined;
  /** Komentar target (untuk undo komentar). */
  getComment?(id: string): CommentState | undefined;
}

/** Batas jumlah grup (Blockly.Workspace.prototype.MAX_UNDO). */
export const MAX_UNDO = 1024;

const VAR_FIELDS = new Set(["VARIABLE", "LIST", "BROADCAST_OPTION"]);

function snapshotTree(get: BlockGetter, rootId: string): Block[] {
  const out: Block[] = [];
  const seen = new Set<string>();
  const visit = (id: string | null): void => {
    if (!id || seen.has(id)) return;
    const b = get(id);
    if (!b) return;
    seen.add(id);
    out.push(JSON.parse(JSON.stringify(b)) as Block);
    for (const name of Object.keys(b.inputs)) {
      const inp = b.inputs[name];
      if (!inp) continue;
      visit(inp.block);
      if (inp.shadow !== inp.block) visit(inp.shadow);
    }
    visit(b.next);
  };
  visit(rootId);
  return out;
}

function parentLinkOf(get: BlockGetter, id: string): { parent: string; input: string | null } | null {
  const b = get(id);
  if (!b?.parent) return null;
  const p = get(b.parent);
  if (!p) return null;
  if (p.next === id) return { parent: p.id, input: null };
  for (const name of Object.keys(p.inputs)) {
    if (p.inputs[name]?.block === id) return { parent: p.id, input: name };
  }
  return null;
}

/** Event kebalikan untuk satu event, dihitung sebelum event diterapkan. */
export function inverseOf(ev: EditorWorkspaceEvent, deps: InverseDeps): EditorWorkspaceEvent[] {
  const get = deps.getBlock;
  switch (ev.type) {
    case "create": {
      const root = ev.blocks[0];
      return root ? [{ type: "delete", blockId: root.id }] : [];
    }
    case "delete": {
      const b = get(ev.blockId);
      if (!b || b.shadow) return [];
      const blocks = snapshotTree(get, ev.blockId);
      const link = parentLinkOf(get, ev.blockId);
      const root = blocks[0];
      if (!root) return [];
      root.parent = null;
      root.topLevel = true;
      const out: EditorWorkspaceEvent[] = [{ type: "create", blocks }];
      if (link) {
        const back: EditorWorkspaceEvent = { type: "move", blockId: ev.blockId, newParent: link.parent };
        if (link.input) back.newInput = link.input;
        out.push(back);
      }
      return out;
    }
    case "move": {
      const b = get(ev.blockId);
      if (!b || b.shadow) return [];
      const back: Extract<EditorWorkspaceEvent, { type: "move" }> = { type: "move", blockId: ev.blockId };
      if (ev.newParent) {
        back.oldParent = ev.newParent;
        if (ev.newInput) back.oldInput = ev.newInput;
      }
      if (ev.oldParent) {
        back.newParent = ev.oldParent;
        if (ev.oldInput) back.newInput = ev.oldInput;
      }
      if (b.topLevel && !b.parent) back.newCoordinate = { x: b.x ?? 0, y: b.y ?? 0 };
      else if (!ev.oldParent && ev.newParent) back.newCoordinate = { x: b.x ?? 0, y: b.y ?? 0 };
      const out: EditorWorkspaceEvent[] = [back];
      if (ev.newParent && ev.newInput) {
        // Lepas reporter dari input: shadow yang tadinya tampil harus kembali menutup input.
        const shadow = get(ev.newParent)?.inputs[ev.newInput]?.shadow ?? null;
        if (shadow && shadow !== ev.blockId) out.push({ type: "move", blockId: shadow, newParent: ev.newParent, newInput: ev.newInput });
      }
      return out;
    }
    case "change": {
      const b = get(ev.blockId);
      if (!b) return [];
      if (ev.element === "field" && ev.name) {
        const f = b.fields[ev.name];
        if (!f) return [];
        const value = VAR_FIELDS.has(ev.name) && f.id ? f.id : f.value;
        return [{ type: "change", blockId: ev.blockId, element: "field", name: ev.name, value }];
      }
      if (ev.element === "mutation") {
        return [{ type: "change", blockId: ev.blockId, element: "mutation", value: JSON.parse(JSON.stringify(b.mutation ?? null)) }];
      }
      return [];
    }
    case "var_create":
      return [{ type: "var_delete", varId: ev.varId }];
    case "var_delete": {
      const v = deps.getVariable(ev.varId);
      return v ? [{ type: "var_create", varId: v.id, varName: v.name, varType: v.type, isLocal: v.isLocal, isCloud: v.isCloud }] : [];
    }
    case "var_rename": {
      const v = deps.getVariable(ev.varId);
      return v ? [{ type: "var_rename", varId: v.id, newName: v.name }] : [];
    }
    case "comment_create":
      return [{ type: "comment_delete", commentId: ev.commentId }];
    case "comment_delete": {
      const c = deps.getComment?.(ev.commentId);
      return c
        ? [{ type: "comment_create", commentId: c.id, blockId: c.blockId, text: c.text, x: c.x, y: c.y, width: c.width, height: c.height, minimized: c.minimized }]
        : [];
    }
    case "comment_change": {
      const c = deps.getComment?.(ev.commentId);
      if (!c) return [];
      const back: Extract<EditorWorkspaceEvent, { type: "comment_change" }> = { type: "comment_change", commentId: c.id };
      if (ev.text !== undefined) back.text = c.text;
      if (ev.minimized !== undefined) back.minimized = c.minimized;
      if (ev.width !== undefined && ev.height !== undefined) {
        back.width = c.width;
        back.height = c.height;
      }
      return [back];
    }
    case "comment_move": {
      const c = deps.getComment?.(ev.commentId);
      return c ? [{ type: "comment_move", commentId: c.id, x: c.x, y: c.y }] : [];
    }
    default:
      return [];
  }
}

export interface UndoGroup {
  forward: EditorWorkspaceEvent[];
  inverse: EditorWorkspaceEvent[];
}

export class UndoStack {
  private undoList: UndoGroup[] = [];
  private redoList: UndoGroup[] = [];

  push(group: UndoGroup): void {
    if (!group.forward.length) return;
    this.undoList.push(group);
    if (this.undoList.length > MAX_UNDO) this.undoList.shift();
    this.redoList = [];
  }

  canUndo(): boolean {
    return this.undoList.length > 0;
  }

  canRedo(): boolean {
    return this.redoList.length > 0;
  }

  /** Grup yang harus di-undo (terapkan group.inverse). */
  popUndo(): UndoGroup | undefined {
    const g = this.undoList.pop();
    if (g) this.redoList.push(g);
    return g;
  }

  popRedo(): UndoGroup | undefined {
    const g = this.redoList.pop();
    if (g) this.undoList.push(g);
    return g;
  }

  clear(): void {
    this.undoList = [];
    this.redoList = [];
  }
}

/**
 * Terapkan event berurutan ke sink sambil menghitung kebalikannya.
 * Kebalikan dikembalikan sudah dalam urutan terbalik (siap diterapkan untuk undo).
 */
export function applyWithInverse(
  events: readonly EditorWorkspaceEvent[],
  deps: InverseDeps,
  apply: (ev: EditorWorkspaceEvent) => void,
): EditorWorkspaceEvent[] {
  const inverse: EditorWorkspaceEvent[][] = [];
  for (const ev of events) {
    inverse.push(inverseOf(ev, deps));
    apply(ev);
  }
  return inverse.reverse().flat();
}
