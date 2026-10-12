/**
 * Editor field teks/angka di atas blok (FieldTextInput / FieldNumber / FieldAngle / FieldNote).
 * Sentuh: papan angka layar (keyboard iOS tidak punya minus), dial sudut, dan piano.
 */
import type { Block } from "@kody/engine";
import type { ArgSpec } from "../types";
import type { BlocksWorkspace } from "./editor";
import { msg } from "./i18n";
import { angleDial, numpad, piano } from "./widgets";

export type FieldSpec = Exclude<ArgSpec, { type: "input_value" } | { type: "input_statement" } | { type: "field_image" }>;

function rootLocal(ws: BlocksWorkspace, clientX: number, clientY: number): { x: number; y: number } {
  const r = ws.root.getBoundingClientRect();
  return { x: clientX - r.left, y: clientY - r.top };
}

export function openTextEditor(ws: BlocksWorkspace, spec: FieldSpec, block: Block, name: string, rect: DOMRect, commit: (v: string) => void): void {
  const doc = ws.doc;
  const input = doc.createElement("input");
  input.type = "text";
  input.className = "kb-field-editor";
  input.autocomplete = "off";
  input.spellcheck = false;
  const original = String(block.fields[name]?.value ?? "");
  input.value = original;
  const local = rootLocal(ws, rect.left, rect.top);
  input.style.left = `${local.x}px`;
  input.style.top = `${local.y}px`;
  input.style.minWidth = `${Math.max(rect.width, 40)}px`;
  input.style.height = `${Math.max(rect.height, 32)}px`;
  input.style.borderRadius = `${Math.max(rect.height, 32) / 2}px`;
  const restrictor = numberRestrictor(spec, block.opcode);
  const touch = ws.gesture.lastPointerType === "touch" || ws.gesture.lastPointerType === "pen";
  const extras: HTMLElement[] = [];
  let done = false;
  const finish = (save: boolean): void => {
    if (done) return;
    done = true;
    input.remove();
    for (const el of extras) el.remove();
    doc.removeEventListener("pointerdown", outside, true);
    if (save && input.value !== original) commit(input.value);
  };
  const outside = (e: Event): void => {
    const t = e.target instanceof Node ? e.target : null;
    if (t && (input.contains(t) || extras.some((el) => el.contains(t)))) return;
    finish(true);
  };
  if (restrictor) {
    input.inputMode = "decimal";
    input.addEventListener("beforeinput", (e) => {
      const data = (e as InputEvent).data;
      if (data && ![...data].every((ch) => restrictor.test(ch))) e.preventDefault();
    });
  }
  const below = rootLocal(ws, rect.left, rect.bottom + 8);
  if (spec.type === "field_angle") {
    const dial = angleDial(doc, Number(original), (deg) => {
      input.value = String(deg);
    });
    extras.push(dial);
  } else if (spec.type === "field_note") {
    const keys = piano(doc, Number(original), (note) => {
      input.value = String(note);
      finish(true);
    });
    extras.push(keys);
  }
  if (restrictor && touch) {
    // Keyboard iOS "decimal" tidak punya tombol minus: pakai papan angka sendiri, sembunyikan keyboard OS.
    input.inputMode = "none";
    const pad = numpad(doc, original, {
      allowDecimal: restrictor.test("."),
      allowNegative: restrictor.test("-"),
      labels: { backspace: msg(ws.locale, "NUMPAD_BACKSPACE"), done: msg(ws.locale, "NUMPAD_DONE") },
      onInput: (v) => {
        input.value = v;
      },
      onDone: () => finish(true),
    });
    extras.push(pad);
  }
  let top = below.y;
  for (const el of extras) {
    el.style.left = "0px";
    el.style.top = "0px";
    ws.root.appendChild(el);
    el.addEventListener("pointerdown", (e) => e.stopPropagation());
    const rw = ws.root.clientWidth || 10000;
    const rh = ws.root.clientHeight || 10000;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    el.style.left = `${Math.max(4, Math.min(below.x, rw - w - 4))}px`;
    // Tidak muat di bawah: taruh di atas field.
    const y = top + h > rh ? Math.max(4, local.y - 8 - h) : top;
    el.style.top = `${y}px`;
    top = y + h + 8;
  }
  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") finish(true);
    else if (e.key === "Escape") finish(false);
  });
  // Dengan papan angka layar, blur terjadi saat tombol diketuk: simpan lewat ketuk di luar / Selesai.
  if (extras.length) setTimeout(() => doc.addEventListener("pointerdown", outside, true), 0);
  else input.addEventListener("blur", () => finish(true));
  input.addEventListener("pointerdown", (e) => e.stopPropagation());
  ws.root.appendChild(input);
  input.focus({ preventScroll: true });
  input.select();
  // iOS Safari tidak selalu menyeleksi lewat select().
  try {
    input.setSelectionRange(0, input.value.length);
  } catch {
    /* tipe input tanpa seleksi */
  }
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
