/**
 * Model pohon blok untuk renderer (bebas DOM). Bisa dibangun manual (tes, flyout) atau dari
 * `target.blocks` engine lewat `fromProjectBlocks`.
 */
import type { Block, BlockMutation } from "@kody/engine";

export interface RenderField {
  value: string | number;
  /** Teks tampilan bila beda dari value (mis. nama variabel / label opsi dinamis). */
  text?: string;
}

export interface RenderBlock {
  id?: string;
  opcode: string;
  shadow?: boolean;
  fields?: Record<string, RenderField | string | number>;
  /**
   * Input bernama. Untuk input nilai: blok yang TERLIHAT (reporter yang menutupi shadow, atau shadow-nya).
   * Untuk input statement: blok pertama tumpukan di dalamnya.
   */
  inputs?: Record<string, RenderBlock | null | undefined>;
  next?: RenderBlock | null;
  mutation?: Partial<BlockMutation> | null;
}

export function fieldValue(f: RenderField | string | number | undefined): RenderField | undefined {
  if (f === undefined) return undefined;
  if (typeof f === "object") return f;
  return { value: f };
}

/** Batas kedalaman untuk menolak data project siklik / sangat dalam (input tak tepercaya). */
const MAX_DEPTH = 2000;

/**
 * Bangun RenderBlock dari blok di memori (bentuk scratch-vm: inputs {name, block, shadow}).
 * Input yang ditutupi reporter memakai `block`; jika kosong memakai `shadow`.
 */
export function fromProjectBlocks(blocks: Readonly<Record<string, Block>>, topId: string): RenderBlock | null {
  const visiting = new Set<string>();

  const build = (id: string | null, depth: number): RenderBlock | null => {
    if (id === null || depth > MAX_DEPTH || visiting.has(id)) return null;
    const b = blocks[id];
    if (!b) return null;
    visiting.add(id);
    const out: RenderBlock = { id: b.id, opcode: b.opcode, shadow: b.shadow };
    const fields: Record<string, RenderField> = {};
    for (const [name, f] of Object.entries(b.fields)) fields[name] = { value: f.value };
    out.fields = fields;
    const inputs: Record<string, RenderBlock | null> = {};
    for (const [name, input] of Object.entries(b.inputs)) {
      inputs[name] = build(input.block ?? input.shadow, depth + 1) ?? build(input.shadow, depth + 1);
    }
    out.inputs = inputs;
    if (b.mutation) out.mutation = b.mutation;
    out.next = build(b.next, depth + 1);
    visiting.delete(id);
    return out;
  };

  return build(topId, 0);
}
