/**
 * Tampilan palet (flyout) SVG: label kategori, tombol (Make a Variable, dst), blok, checkbox monitor.
 * Scroll vertikal (wheel / seret vertikal), animasi scroll-ke-kategori, sorot kategori saat scroll.
 * Interaksi pointer diteruskan ke editor lewat callback (editor yang memutuskan klik/seret).
 */
import { clear, svg } from "../workspace/dom";
import type { LayoutDeps } from "../workspace/layout";
import { paintStack } from "../workspace/painter";
import type { FlyoutContent } from "./content";
import {
  BUTTON_HEIGHT,
  CHECKBOX_SIZE,
  categoryAtScroll,
  FLYOUT_SCALE,
  layoutFlyout,
  scrollableHeight,
  scrollTargetForCategory,
  stepScroll,
  type FlyoutLayout,
} from "./layout";

const CHECK_PATH = `M${CHECKBOX_SIZE / 4} ${CHECKBOX_SIZE / 2}L${(5 * CHECKBOX_SIZE) / 12} ${(2 * CHECKBOX_SIZE) / 3}L${(3 * CHECKBOX_SIZE) / 4} ${CHECKBOX_SIZE / 3}`;

export interface FlyoutCallbacks {
  onButton(callbackKey: string): void;
  onCheckbox(rootId: string, checked: boolean): void;
  onCategoryScrolled(categoryId: string): void;
}

export class FlyoutView {
  readonly el: HTMLElement;
  readonly svgEl: SVGSVGElement;
  private readonly canvas: SVGGElement;
  private layout: FlyoutLayout | null = null;
  private scrollPx = 0;
  private scrollTarget: number | null = null;
  private animFrame = 0;
  private checkboxes = new Map<string, SVGGElement>();
  /** Posisi blok root (unit palet) untuk konversi ke workspace. */
  private rootPositions = new Map<string, { x: number; y: number }>();

  constructor(
    private readonly doc: Document,
    private readonly callbacks: FlyoutCallbacks,
  ) {
    this.el = doc.createElement("div");
    this.el.className = "kb-ws-flyout";
    this.svgEl = svg(doc, "svg", { class: "kb-flyout-svg" }, this.el);
    this.canvas = svg(doc, "g", {}, this.svgEl);
    this.el.addEventListener("wheel", (e) => {
      e.preventDefault();
      const mult = e.deltaMode === 1 ? 15 : 1;
      this.scrollTarget = null;
      this.setScroll(this.scrollPx + e.deltaY * mult);
    }, { passive: false });
  }

  get viewHeight(): number {
    return this.el.clientHeight || 600;
  }

  get scale(): number {
    return FLYOUT_SCALE;
  }

  get scroll(): number {
    return this.scrollPx;
  }

  render(content: FlyoutContent, deps: LayoutDeps, measureLabel: (t: string) => number, checked: (rootId: string) => boolean, glowing: ReadonlySet<string>): void {
    const doc = this.doc;
    clear(this.canvas);
    this.checkboxes.clear();
    this.rootPositions.clear();
    const layout = layoutFlyout(content, deps, measureLabel);
    this.layout = layout;
    for (const p of layout.placed) {
      const it = p.item;
      if (it.kind === "label") {
        const t = svg(doc, "text", { x: p.x, y: p.y + BUTTON_HEIGHT / 2, class: "kb-flyout-label", "dominant-baseline": "central" }, this.canvas);
        t.textContent = it.text;
      } else if (it.kind === "button") {
        const g = svg(doc, "g", { class: "kb-flyout-button", transform: `translate(${p.x},${p.y})`, "data-callback": it.callbackKey, role: "button", tabindex: "0" }, this.canvas);
        svg(doc, "rect", { width: p.width, height: BUTTON_HEIGHT, rx: 4, ry: 4 }, g);
        const t = svg(doc, "text", { x: p.width / 2, y: BUTTON_HEIGHT / 2, "text-anchor": "middle", "dominant-baseline": "central" }, g);
        t.textContent = it.text;
        g.addEventListener("click", () => this.callbacks.onButton(it.callbackKey));
        g.addEventListener("keydown", (e) => {
          if (e.key === "Enter") this.callbacks.onButton(it.callbackKey);
        });
      } else if (p.stack) {
        if (p.checkbox) {
          const cb = svg(doc, "g", { class: "kb-checkbox", transform: `translate(${p.checkbox.x},${p.checkbox.y})`, "data-checkbox": it.rootId, role: "checkbox" }, this.canvas);
          // Area sentuh lebih besar dari kotaknya (jari anak di tablet): melebar ke kiri/atas/bawah saja.
          // Tidak melebar ke kanan: penyesuaian sentuh Chrome Android memilih target "bisa diklik" terdekat,
          // jadi area yang mendekati blok membuat seret reporter dari tepi kirinya malah mencentang kotak.
          svg(doc, "rect", { class: "kb-hit", x: -10, y: -10, width: CHECKBOX_SIZE + 10, height: CHECKBOX_SIZE + 20 }, cb);
          svg(doc, "rect", { width: CHECKBOX_SIZE, height: CHECKBOX_SIZE, rx: 4, ry: 4 }, cb);
          svg(doc, "path", { d: CHECK_PATH }, cb);
          const isOn = checked(it.rootId);
          cb.classList.toggle("kb-checked", isOn);
          cb.setAttribute("aria-checked", String(isOn));
          cb.addEventListener("pointerdown", (e) => e.stopPropagation());
          cb.addEventListener("click", () => {
            const next = !cb.classList.contains("kb-checked");
            cb.classList.toggle("kb-checked", next);
            cb.setAttribute("aria-checked", String(next));
            this.callbacks.onCheckbox(it.rootId, next);
          });
          this.checkboxes.set(it.rootId, cb);
        }
        const g = paintStack({ doc }, p.stack, p.x, p.y);
        g.setAttribute("data-flyout-root", it.rootId);
        if (glowing.has(it.rootId)) g.classList.add("kb-glow");
        this.canvas.appendChild(g);
        this.rootPositions.set(it.rootId, { x: p.x, y: p.y });
      }
    }
    this.setScroll(this.scrollPx);
  }

  setChecked(rootId: string, on: boolean): void {
    const cb = this.checkboxes.get(rootId);
    if (!cb) return;
    cb.classList.toggle("kb-checked", on);
    cb.setAttribute("aria-checked", String(on));
  }

  setGlow(rootId: string, on: boolean, filterId: string): void {
    const g = Array.from(this.canvas.querySelectorAll("[data-flyout-root]")).find((el) => el.getAttribute("data-flyout-root") === rootId);
    if (!g) return;
    g.classList.toggle("kb-glow", on);
    if (on) g.setAttribute("filter", `url(#${filterId})`);
    else g.removeAttribute("filter");
  }

  /** Posisi layar (relatif elemen flyout) dari titik unit palet. */
  toLocal(fx: number, fy: number): { x: number; y: number } {
    return { x: fx * FLYOUT_SCALE, y: fy * FLYOUT_SCALE - this.scrollPx };
  }

  rootPosition(rootId: string): { x: number; y: number } | null {
    return this.rootPositions.get(rootId) ?? null;
  }

  private maxScroll(): number {
    if (!this.layout) return 0;
    return Math.max(0, scrollableHeight(this.layout, this.viewHeight) - this.viewHeight);
  }

  setScroll(px: number): void {
    this.scrollPx = Math.max(0, Math.min(px, this.maxScroll()));
    this.canvas.setAttribute("transform", `translate(0,${-this.scrollPx}) scale(${FLYOUT_SCALE})`);
    if (this.layout && this.scrollTarget === null) {
      const cat = categoryAtScroll(this.layout, this.scrollPx);
      if (cat) this.callbacks.onCategoryScrolled(cat);
    }
  }

  scrollBy(dy: number): void {
    this.scrollTarget = null;
    this.setScroll(this.scrollPx + dy);
  }

  /** Scroll beranimasi ke kategori (Toolbox.scrollToCategoryById). */
  scrollToCategory(categoryId: string): void {
    if (!this.layout) return;
    const target = scrollTargetForCategory(this.layout, categoryId, this.viewHeight);
    if (target === null) return;
    this.scrollTarget = target;
    const win = this.doc.defaultView;
    const step = (): void => {
      if (this.scrollTarget === null) return;
      const next = stepScroll(this.scrollPx, this.scrollTarget);
      if (next === null) {
        const final = this.scrollTarget;
        this.scrollTarget = null;
        this.setScroll(final);
        return;
      }
      this.setScroll(next);
      this.animFrame = win?.requestAnimationFrame(step) ?? 0;
    };
    if (win) {
      win.cancelAnimationFrame(this.animFrame);
      step();
    } else {
      this.scrollTarget = null;
      this.setScroll(target);
    }
  }

  dispose(): void {
    this.doc.defaultView?.cancelAnimationFrame(this.animFrame);
    this.el.remove();
  }
}
