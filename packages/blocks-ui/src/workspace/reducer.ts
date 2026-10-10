/**
 * Reducer event editor -> peta blok dengan semantik container blok scratch-vm (engine/blocks.js,
 * BSD-3, versi 4.8.102): create (abaikan id kembar), move (lepas dari induk lama, top-level atau
 * pasang ke next/input dengan mempertahankan shadow), delete (rekursif, abaikan shadow), change.
 * Dipakai untuk pratinjau insertion marker (tanpa menyentuh engine) dan oleh tes.
 */
import type { Block, EditorWorkspaceEvent } from "@kody/engine";

export class BlockReducer {
  readonly blocks: Record<string, Block> = {};
  readonly scripts: string[] = [];

  constructor(initial: Block[] = []) {
    for (const b of initial) this.create(JSON.parse(JSON.stringify(b)) as Block);
  }

  private addScript(id: string): void {
    if (!this.scripts.includes(id)) this.scripts.push(id);
    const b = this.blocks[id];
    if (b) b.topLevel = true;
  }

  private deleteScript(id: string): void {
    const i = this.scripts.indexOf(id);
    if (i >= 0) this.scripts.splice(i, 1);
    const b = this.blocks[id];
    if (b) b.topLevel = false;
  }

  create(block: Block): void {
    if (this.blocks[block.id]) return;
    this.blocks[block.id] = block;
    if (block.topLevel) this.addScript(block.id);
  }

  apply(ev: EditorWorkspaceEvent): void {
    switch (ev.type) {
      case "create":
        for (const b of ev.blocks) this.create(JSON.parse(JSON.stringify(b)) as Block);
        return;
      case "delete": {
        const b = this.blocks[ev.blockId];
        if (!b || b.shadow) return;
        this.deleteBlock(ev.blockId);
        return;
      }
      case "change": {
        const b = this.blocks[ev.blockId];
        if (!b) return;
        if (ev.element === "field" && ev.name && b.fields[ev.name]) {
          (b.fields[ev.name] as { value: unknown }).value = ev.value;
        } else if (ev.element === "mutation") {
          b.mutation = ev.value as Block["mutation"];
        }
        return;
      }
      case "move":
        this.move(ev);
        return;
      default:
        return;
    }
  }

  private move(e: Extract<EditorWorkspaceEvent, { type: "move" }>): void {
    const block = this.blocks[e.blockId];
    if (!block) return;
    if (e.newCoordinate) {
      block.x = e.newCoordinate.x;
      block.y = e.newCoordinate.y;
    }
    if (e.oldParent !== undefined && e.oldParent !== null) {
      const oldParent = this.blocks[e.oldParent];
      if (oldParent) {
        if (e.oldInput && oldParent.inputs[e.oldInput]?.block === e.blockId) {
          (oldParent.inputs[e.oldInput] as { block: string | null }).block = null;
        } else if (oldParent.next === e.blockId) {
          oldParent.next = null;
        }
      }
      block.parent = null;
    }
    if (e.newParent === undefined || e.newParent === null) {
      this.addScript(e.blockId);
    } else {
      this.deleteScript(e.blockId);
      const np = this.blocks[e.newParent];
      if (!np) return;
      if (!e.newInput) {
        np.next = e.blockId;
      } else {
        let oldShadow = np.inputs[e.newInput]?.shadow ?? null;
        if (block.shadow) oldShadow = e.blockId;
        np.inputs[e.newInput] = { name: e.newInput, block: e.blockId, shadow: oldShadow };
      }
      block.parent = e.newParent;
    }
  }

  private deleteBlock(id: string): void {
    const block = this.blocks[id];
    if (!block) return;
    if (block.next !== null) this.deleteBlock(block.next);
    for (const name of Object.keys(block.inputs)) {
      const inp = block.inputs[name];
      if (!inp) continue;
      if (inp.block !== null) this.deleteBlock(inp.block);
      if (inp.shadow !== null && inp.shadow !== inp.block) this.deleteBlock(inp.shadow);
    }
    this.deleteScript(id);
    delete this.blocks[id];
  }
}
