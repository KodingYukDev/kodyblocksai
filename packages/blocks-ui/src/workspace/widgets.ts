/**
 * Widget overlay: context menu, dropdown (DropDownDiv), pemilih warna (field_colour_slider),
 * gelembung nilai reporter (reportValue). Semua teks diisi via textContent.
 */
import type { CategoryColours } from "../types";
import { Color } from "@kody/engine";
import { html } from "./dom";

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

export function contextMenu(doc: Document, options: MenuOption[], close: () => void): HTMLElement {
  const menu = html(doc, "div", { class: "kb-menu", role: "menu" });
  for (const opt of options) {
    const item = html(doc, "div", { class: `kb-menu-item${opt.enabled ? "" : " kb-disabled"}`, role: "menuitem" }, menu, opt.text);
    if (!opt.enabled) continue;
    item.addEventListener("pointerup", (e) => {
      e.stopPropagation();
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
    const item = html(doc, "div", { class: `kb-dropdown-item${value === selected ? " kb-checked" : ""}`, role: "option" }, menu, text);
    item.addEventListener("pointerup", (e) => {
      e.stopPropagation();
      onPick(value);
    });
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
