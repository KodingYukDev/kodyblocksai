/**
 * Widget overlay: context menu, dropdown (DropDownDiv), pemilih warna (field_colour_slider),
 * papan angka layar (FieldNumber numpad untuk sentuh), dial sudut (FieldAngle), piano (FieldNote),
 * gelembung nilai reporter (reportValue). Semua teks diisi via textContent.
 */
import type { CategoryColours } from "../types";
import { Color } from "@kody/engine";
import { html, svg } from "./dom";

export interface MenuOption {
  text: string;
  enabled: boolean;
  callback: () => void;
}

/** Satu overlay aktif sekaligus (Blockly.hideChaff). */
export class Overlay {
  private current: HTMLElement | null = null;
  private onClose: (() => void) | null = null;
  private readonly docListener = (e: Event): void => {
    if (this.current && e.target instanceof Node && this.current.contains(e.target)) return;
    this.hide();
  };

  constructor(private readonly root: HTMLElement) {}

  get isOpen(): boolean {
    return this.current !== null;
  }

  show(el: HTMLElement, x: number, y: number, onClose?: () => void): void {
    this.hide();
    this.current = el;
    this.onClose = onClose ?? null;
    el.style.left = "0px";
    el.style.top = "0px";
    this.root.appendChild(el);
    // Jaga agar tetap di dalam area root.
    const rw = this.root.clientWidth || 10000;
    const rh = this.root.clientHeight || 10000;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    el.style.left = `${Math.max(4, Math.min(x, rw - w - 4))}px`;
    el.style.top = `${Math.max(4, y + h > rh ? y - h : y)}px`;
    setTimeout(() => this.root.ownerDocument.addEventListener("pointerdown", this.docListener, true), 0);
  }

  hide(): void {
    if (!this.current) return;
    this.root.ownerDocument.removeEventListener("pointerdown", this.docListener, true);
    this.current.remove();
    this.current = null;
    const cb = this.onClose;
    this.onClose = null;
    cb?.();
  }
}

/**
 * Pilih item hanya bila pointerdown DAN pointerup terjadi di item yang sama. Tanpa ini, mengangkat
 * jari setelah long-press (menu muncul tepat di bawah jari) langsung memilih item pertama.
 */
function armedPick(item: HTMLElement, pick: () => void): void {
  let armed = false;
  item.addEventListener("pointerdown", (e) => {
    armed = true;
    e.stopPropagation();
  });
  for (const type of ["pointerleave", "pointercancel"]) {
    item.addEventListener(type, () => {
      armed = false;
    });
  }
  item.addEventListener("pointerup", (e) => {
    e.stopPropagation();
    if (!armed) return;
    armed = false;
    pick();
  });
  item.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick();
    }
  });
}

export function contextMenu(doc: Document, options: MenuOption[], close: () => void): HTMLElement {
  const menu = html(doc, "div", { class: "kb-menu", role: "menu" });
  for (const opt of options) {
    const item = html(doc, "div", { class: `kb-menu-item${opt.enabled ? "" : " kb-disabled"}`, role: "menuitem", tabindex: "-1" }, menu, opt.text);
    if (!opt.enabled) {
      item.setAttribute("aria-disabled", "true");
      continue;
    }
    armedPick(item, () => {
      close();
      opt.callback();
    });
  }
  return menu;
}

export function dropdownMenu(
  doc: Document,
  options: readonly [string, string][],
  selected: string,
  colours: CategoryColours,
  onPick: (value: string) => void,
): HTMLElement {
  const menu = html(doc, "div", { class: "kb-dropdown", role: "listbox" });
  menu.style.background = colours.primary;
  menu.style.border = `1px solid ${colours.tertiary}`;
  for (const [text, value] of options) {
    const item = html(doc, "div", { class: `kb-dropdown-item${value === selected ? " kb-checked" : ""}`, role: "option", tabindex: "-1" }, menu, text);
    item.setAttribute("aria-selected", String(value === selected));
    armedPick(item, () => onPick(value));
  }
  return menu;
}

/** Pemilih warna Scratch: slider Color / Saturation / Brightness (0..100). */
export function colourPicker(doc: Document, value: string, labels: [string, string, string], onChange: (hex: string, final: boolean) => void): HTMLElement {
  const box = html(doc, "div", { class: "kb-colour" });
  const hsv = Color.rgbToHsv(Color.hexToRgb(value) ?? { r: 255, g: 0, b: 0 });
  const state = [Math.round((hsv.h / 360) * 100), Math.round(hsv.s * 100), Math.round(hsv.v * 100)];
  const swatch = html(doc, "div", {}, box);
  swatch.style.cssText = `height:24px;border-radius:12px;margin-bottom:4px;background:${value}`;
  const emit = (final: boolean): void => {
    const [h = 0, s = 0, v = 0] = state;
    const hex = Color.rgbToHex(Color.hsvToRgb({ h: (h / 100) * 360, s: s / 100, v: v / 100 }));
    swatch.style.background = hex;
    onChange(hex, final);
  };
  labels.forEach((label, i) => {
    html(doc, "label", {}, box, label);
    const input = html(doc, "input", { type: "range", min: "0", max: "100", step: "1", value: String(state[i] ?? 0) }, box);
    input.addEventListener("input", () => {
      state[i] = Number(input.value);
      emit(false);
    });
    input.addEventListener("change", () => emit(true));
  });
  return box;
}

export function reportBubble(doc: Document, value: string): HTMLElement {
  return html(doc, "div", { class: "kb-report" }, undefined, value);
}

export interface NumpadOptions {
  allowDecimal: boolean;
  allowNegative: boolean;
  labels: { backspace: string; done: string };
  /** Dipanggil setiap nilai berubah lewat tombol. */
  onInput(value: string): void;
  onDone(): void;
}

/**
 * Papan angka layar (scratch-blocks FieldNumber.showNumPad_): dipakai di tablet supaya anak bisa
 * mengetik angka termasuk minus dan titik tanpa keyboard iOS/Android yang tidak punya tombol minus.
 * Tombol pertama yang ditekan mengganti seluruh isi (nilai lama terseleksi).
 */
export function numpad(doc: Document, initial: string, opts: NumpadOptions): HTMLElement {
  const box = html(doc, "div", { class: "kb-numpad", role: "group" });
  let value = initial;
  let fresh = true;
  const keys = ["7", "8", "9", "4", "5", "6", "1", "2", "3", opts.allowDecimal ? "." : "", "0", opts.allowNegative ? "-" : ""];
  const press = (key: string): void => {
    if (key === "back") {
      value = fresh ? "" : value.slice(0, -1);
    } else if (key === "-") {
      value = fresh ? "-" : value.startsWith("-") ? value.slice(1) : `-${value}`;
    } else if (key === ".") {
      if (fresh) value = "0.";
      else if (!value.includes(".")) value += value === "" || value === "-" ? "0." : ".";
    } else {
      value = fresh ? key : value === "0" ? key : value === "-0" ? `-${key}` : value + key;
    }
    fresh = false;
    opts.onInput(value);
  };
  const button = (label: string, key: string, cls = ""): void => {
    const b = html(doc, "button", { type: "button", class: `kb-numpad-key${cls}`, tabindex: "-1", "data-key": key }, box, label);
    // Jangan ambil fokus dari input (blur = simpan).
    b.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    b.addEventListener("click", (e) => {
      e.preventDefault();
      if (key === "done") opts.onDone();
      else press(key);
    });
  };
  for (const k of keys) {
    if (k) button(k === "-" ? "\u2212" : k, k);
    else html(doc, "span", { class: "kb-numpad-gap" }, box);
  }
  button("\u232b", "back", " kb-numpad-back");
  box.lastElementChild?.setAttribute("aria-label", opts.labels.backspace);
  button(opts.labels.done, "done", " kb-numpad-done");
  return box;
}

/** Dial sudut (FieldAngle): seret jarum, terkunci tiap 15 derajat seperti Scratch. 90 = kanan. */
export function angleDial(doc: Document, value: number, onChange: (deg: number) => void): HTMLElement {
  const box = html(doc, "div", { class: "kb-angle" });
  const size = 140;
  const c = size / 2;
  const r = c - 12;
  const s = svg(doc, "svg", { viewBox: `0 0 ${size} ${size}`, width: size, height: size }, box);
  svg(doc, "circle", { cx: c, cy: c, r, fill: "#fff", stroke: "#cfd8dc", "stroke-width": 2 }, s);
  for (let d = 0; d < 360; d += 15) {
    const a = ((d - 90) * Math.PI) / 180;
    const inner = d % 90 === 0 ? r - 10 : r - 5;
    svg(doc, "line", { x1: c + Math.cos(a) * inner, y1: c + Math.sin(a) * inner, x2: c + Math.cos(a) * r, y2: c + Math.sin(a) * r, stroke: "#b0bec5", "stroke-width": 1 }, s);
  }
  const hand = svg(doc, "line", { x1: c, y1: c, x2: c, y2: c - r, stroke: "#4c97ff", "stroke-width": 3, "stroke-linecap": "round" }, s);
  const knob = svg(doc, "circle", { cx: c, cy: c - r, r: 10, fill: "#4c97ff", class: "kb-angle-knob" }, s);
  svg(doc, "circle", { cx: c, cy: c, r: 4, fill: "#4c97ff" }, s);
  const draw = (deg: number): void => {
    const a = ((deg - 90) * Math.PI) / 180;
    const x = c + Math.cos(a) * r;
    const y = c + Math.sin(a) * r;
    hand.setAttribute("x2", String(x));
    hand.setAttribute("y2", String(y));
    knob.setAttribute("cx", String(x));
    knob.setAttribute("cy", String(y));
  };
  draw(Number.isFinite(value) ? value : 90);
  const fromPointer = (e: PointerEvent): number => {
    const rect = s.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    let deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    deg = Math.round(deg / 15) * 15;
    if (deg > 180) deg -= 360;
    return deg;
  };
  let active: number | null = null;
  s.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    active = e.pointerId;
    try {
      s.setPointerCapture(e.pointerId);
    } catch {
      /* jsdom */
    }
    const deg = fromPointer(e);
    draw(deg);
    onChange(deg);
  });
  s.addEventListener("pointermove", (e) => {
    if (active !== e.pointerId) return;
    const deg = fromPointer(e);
    draw(deg);
    onChange(deg);
  });
  const end = (e: PointerEvent): void => {
    if (active === e.pointerId) active = null;
  };
  s.addEventListener("pointerup", end);
  s.addEventListener("pointercancel", end);
  return box;
}

const NOTE_NAMES_ID = ["Do", "Do#", "Re", "Re#", "Mi", "Fa", "Fa#", "Sol", "Sol#", "La", "La#", "Si"];

/** Piano satu oktaf (FieldNote) dengan tombol oktaf turun/naik. Nilai = nomor nada MIDI 0..130. */
export function piano(doc: Document, value: number, onPick: (note: number) => void): HTMLElement {
  const box = html(doc, "div", { class: "kb-piano" });
  let octave = Math.min(9, Math.max(0, Math.floor((Number.isFinite(value) ? value : 60) / 12)));
  const head = html(doc, "div", { class: "kb-piano-head" }, box);
  const down = html(doc, "button", { type: "button", class: "kb-piano-oct", "aria-label": "oktaf turun" }, head, "\u25c0");
  const label = html(doc, "span", { class: "kb-piano-label" }, head);
  const up = html(doc, "button", { type: "button", class: "kb-piano-oct", "aria-label": "oktaf naik" }, head, "\u25b6");
  const keys = html(doc, "div", { class: "kb-piano-keys" }, box);
  const renderKeys = (): void => {
    label.textContent = `Oktaf ${octave}`;
    while (keys.firstChild) keys.removeChild(keys.firstChild);
    for (let i = 0; i <= 12; i++) {
      const note = octave * 12 + i;
      if (note > 130) break;
      const black = [1, 3, 6, 8, 10].includes(i % 12);
      const k = html(doc, "button", { type: "button", class: `kb-piano-key${black ? " kb-piano-black" : ""}${note === value ? " kb-selected" : ""}`, "data-note": String(note) }, keys, NOTE_NAMES_ID[i % 12] ?? "");
      k.addEventListener("pointerdown", (e) => e.stopPropagation());
      k.addEventListener("click", () => onPick(note));
    }
  };
  for (const [btn, d] of [[down, -1], [up, 1]] as const) {
    btn.addEventListener("pointerdown", (e) => e.stopPropagation());
    btn.addEventListener("click", () => {
      octave = Math.min(10, Math.max(0, octave + d));
      renderKeys();
    });
  }
  renderKeys();
  return box;
}
