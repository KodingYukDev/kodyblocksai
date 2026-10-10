/**
 * Kolom kategori kiri (Blockly.Toolbox.CategoryMenu scratch-blocks): lingkaran berwarna + label,
 * kategori terpilih berlatar #e9eef2. Klik -> scroll palet ke kategori.
 */
import { html } from "../workspace/dom";
import type { FlyoutSection } from "./content";

export class CategoryMenu {
  readonly el: HTMLElement;
  private items = new Map<string, HTMLElement>();
  private selected: string | null = null;

  constructor(
    doc: Document,
    private readonly onSelect: (categoryId: string) => void,
  ) {
    this.el = html(doc, "div", { class: "kb-ws-categories", role: "tablist" });
  }

  setSections(sections: readonly FlyoutSection[]): void {
    const doc = this.el.ownerDocument;
    while (this.el.firstChild) this.el.removeChild(this.el.firstChild);
    this.items.clear();
    for (const s of sections) {
      const item = html(doc, "div", { class: "kb-ws-cat", role: "tab", "data-category": s.categoryId, tabindex: "0" }, this.el);
      if (s.iconURI) {
        const icon = html(doc, "div", { class: "kb-ws-cat-icon" }, item);
        icon.style.backgroundImage = `url("${s.iconURI.replace(/"/g, "%22")}")`;
      } else {
        const bubble = html(doc, "div", { class: "kb-ws-cat-bubble" }, item);
        bubble.style.backgroundColor = s.colours.primary;
        bubble.style.borderColor = s.colours.tertiary;
      }
      html(doc, "div", { class: "kb-ws-cat-label" }, item, s.name);
      const pick = (): void => {
        this.select(s.categoryId);
        this.onSelect(s.categoryId);
      };
      item.addEventListener("click", pick);
      item.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          pick();
        }
      });
      this.items.set(s.categoryId, item);
    }
    if (this.selected && this.items.has(this.selected)) this.select(this.selected);
    else if (sections[0]) this.select(sections[0].categoryId);
  }

  select(categoryId: string | null): void {
    if (!categoryId || (categoryId === this.selected && this.items.get(categoryId)?.classList.contains("kb-selected"))) return;
    for (const [id, el] of this.items) {
      const on = id === categoryId;
      el.classList.toggle("kb-selected", on);
      el.setAttribute("aria-selected", on ? "true" : "false");
    }
    this.selected = categoryId;
    this.items.get(categoryId)?.scrollIntoView?.({ block: "nearest" });
  }

  get selectedId(): string | null {
    return this.selected;
  }
}
