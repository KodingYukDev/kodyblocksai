/**
 * Dialog modal ala scratch-gui (prompt.jsx): judul berwarna, satu input nama, opsi
 * "Untuk semua sprite / Hanya sprite ini" + awan untuk variabel, tombol Batal/OK.
 * Juga alert/confirm sederhana pengganti window.alert/confirm milik scratch-blocks.
 */
import { html } from "./dom";
import { msg, type Locale } from "./i18n";

export interface PromptOptions {
  title: string;
  label: string;
  defaultValue?: string;
  /** Tampilkan pilihan lingkup (variabel/list baru di sprite). */
  showScope?: boolean;
  /** Tampilkan checkbox variabel awan. */
  showCloud?: boolean;
  /** Validasi sinkron: kembalikan pesan galat atau null kalau valid. */
  validate?: (name: string, scope: "global" | "local", isCloud: boolean) => string | null;
}

export interface PromptResult {
  name: string;
  scope: "global" | "local";
  isCloud: boolean;
}

function modalShell(root: HTMLElement, title: string, wide = false): { modal: HTMLElement; body: HTMLElement; close: () => void } {
  const doc = root.ownerDocument;
  const modal = html(doc, "div", { class: "kb-modal" }, root);
  const dialog = html(doc, "div", { class: `kb-dialog${wide ? " kb-dialog-wide" : ""}`, role: "dialog", "aria-modal": "true", "aria-label": title }, modal);
  html(doc, "div", { class: "kb-dialog-header" }, dialog, title);
  const body = html(doc, "div", { class: "kb-dialog-body" }, dialog);
  modal.addEventListener("pointerdown", (e) => e.stopPropagation());
  return { modal, body, close: () => modal.remove() };
}

export function buttons(body: HTMLElement, locale: Locale, onCancel: () => void, onOk: () => void): HTMLButtonElement {
  const doc = body.ownerDocument;
  const row = html(doc, "div", { class: "kb-dialog-buttons" }, body);
  const cancel = html(doc, "button", { class: "kb-btn-cancel", type: "button" }, row, msg(locale, "CANCEL"));
  const ok = html(doc, "button", { class: "kb-btn-ok", type: "button" }, row, msg(locale, "OK"));
  cancel.addEventListener("click", onCancel);
  ok.addEventListener("click", onOk);
  return ok;
}

export function showPrompt(root: HTMLElement, locale: Locale, opts: PromptOptions): Promise<PromptResult | null> {
  return new Promise((resolve) => {
    const doc = root.ownerDocument;
    const { body, close } = modalShell(root, opts.title);
    html(doc, "p", {}, body, opts.label);
    const input = html(doc, "input", { type: "text", value: opts.defaultValue ?? "", maxlength: "256" }, body);
    let scope: "global" | "local" = "global";
    let cloud: HTMLInputElement | null = null;
    if (opts.showScope) {
      const row = html(doc, "div", { class: "kb-dialog-options" }, body);
      for (const [value, key] of [["global", "FOR_ALL_SPRITES"], ["local", "FOR_THIS_SPRITE_ONLY"]] as const) {
        const label = html(doc, "label", {}, row);
        const radio = html(doc, "input", { type: "radio", name: "kb-scope", value }, label);
        if (value === "global") radio.checked = true;
        radio.addEventListener("change", () => {
          scope = value;
          if (cloud) cloud.disabled = value === "local";
        });
        label.appendChild(doc.createTextNode(msg(locale, key)));
      }
    }
    if (opts.showCloud) {
      const row = html(doc, "div", { class: "kb-dialog-options" }, body);
      const label = html(doc, "label", {}, row);
      cloud = html(doc, "input", { type: "checkbox" }, label);
      label.appendChild(doc.createTextNode(msg(locale, "CLOUD_VARIABLE")));
    }
    const error = html(doc, "div", { class: "kb-dialog-error", role: "alert" }, body);
    const finish = (result: PromptResult | null): void => {
      close();
      resolve(result);
    };
    const ok = (): void => {
      const isCloud = !!cloud?.checked && scope === "global";
      const problem = opts.validate?.(input.value, scope, isCloud) ?? null;
      if (problem) {
        error.textContent = problem;
        return;
      }
      finish({ name: input.value, scope, isCloud });
    };
    buttons(body, locale, () => finish(null), ok);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") ok();
      else if (e.key === "Escape") finish(null);
    });
    setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
  });
}

export function showAlert(root: HTMLElement, locale: Locale, text: string): Promise<void> {
  return new Promise((resolve) => {
    const { body, close } = modalShell(root, "KodyBlocks");
    html(root.ownerDocument, "p", {}, body, text);
    const ok = buttons(body, locale, () => (close(), resolve()), () => (close(), resolve()));
    ok.previousElementSibling?.remove();
    setTimeout(() => ok.focus(), 0);
  });
}

export function showConfirm(root: HTMLElement, locale: Locale, text: string): Promise<boolean> {
  return new Promise((resolve) => {
    const { body, close } = modalShell(root, "KodyBlocks");
    html(root.ownerDocument, "p", {}, body, text);
    const ok = buttons(body, locale, () => (close(), resolve(false)), () => (close(), resolve(true)));
    setTimeout(() => ok.focus(), 0);
  });
}

export { modalShell };
