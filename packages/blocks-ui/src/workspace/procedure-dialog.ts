/**
 * Dialog "Make a Block" (scratch-gui custom-procedures.jsx): pratinjau blok merah muda yang bisa
 * diedit langsung, tombol tambah input angka/teks, input boolean, label, dan centang
 * "Run without screen refresh" (warp). Hasil berupa ProcPart[] -> partsToProcedure.
 */
import type { ProcedureParts } from "./block-info";
import { html } from "./dom";
import { msg, type Locale } from "./i18n";
import { buttons, modalShell } from "./dialogs";
import { partsToProcedure, procedureToParts, type ProcPart } from "./procedures";

export interface ProcedureDialogOptions {
  locale: Locale;
  newId(): string;
  /** Untuk "Edit": isi awal dari mutation prototype. */
  initial?: ProcedureParts;
}

export function showProcedureDialog(root: HTMLElement, opts: ProcedureDialogOptions): Promise<ProcedureParts | null> {
  const L = opts.locale;
  return new Promise((resolve) => {
    const doc = root.ownerDocument;
    const { body, close } = modalShell(root, msg(L, "MAKE_A_BLOCK_TITLE"), true);
    const parts: ProcPart[] = opts.initial ? procedureToParts(opts.initial) : [{ kind: "label", text: msg(L, "PROCEDURE_DEFAULT_NAME") }];
    let warp = opts.initial?.warp ?? false;
    const preview = html(doc, "div", { class: "kb-proc-preview" }, body);
    const block = html(doc, "div", { class: "kb-proc-block" }, preview);
    let focusIndex = -1;

    const render = (): void => {
      while (block.firstChild) block.removeChild(block.firstChild);
      parts.forEach((part, index) => {
        const wrap = html(doc, "div", { class: `kb-proc-part ${part.kind === "label" ? "kb-proc-label" : part.argType === "b" ? "kb-proc-bool" : "kb-proc-text"}` }, block);
        const value = part.kind === "label" ? part.text : part.name;
        const input = html(doc, "input", { type: "text", value, "aria-label": value, size: String(Math.max(4, value.length + 1)) }, wrap);
        input.addEventListener("input", () => {
          input.size = Math.max(4, input.value.length + 1);
          const p = parts[index];
          if (!p) return;
          if (p.kind === "label") p.text = input.value;
          else p.name = input.value;
        });
        input.addEventListener("focus", () => {
          focusIndex = index;
        });
        if (parts.length > 1) {
          const rm = html(doc, "button", { class: "kb-proc-remove", type: "button", "aria-label": msg(L, "REMOVE") }, wrap, "×");
          rm.addEventListener("pointerdown", (e) => e.preventDefault());
          rm.addEventListener("click", () => {
            parts.splice(index, 1);
            render();
          });
        }
        if (index === focusIndex) setTimeout(() => input.focus(), 0);
      });
    };

    const add = (part: ProcPart): void => {
      parts.push(part);
      focusIndex = parts.length - 1;
      render();
    };

    const adders = html(doc, "div", { class: "kb-proc-adders" }, body);
    const mk = (key: Parameters<typeof msg>[1], fn: () => void): void => {
      const b = html(doc, "button", { type: "button" }, adders, msg(L, key));
      b.addEventListener("click", fn);
    };
    mk("ADD_INPUT_NUMBER_TEXT", () => add({ kind: "input", argType: "s", name: msg(L, "INPUT_NUMBER_TEXT_DEFAULT"), id: opts.newId() }));
    mk("ADD_INPUT_BOOLEAN", () => add({ kind: "input", argType: "b", name: msg(L, "INPUT_BOOLEAN_DEFAULT"), id: opts.newId() }));
    mk("ADD_LABEL", () => add({ kind: "label", text: msg(L, "LABEL_DEFAULT") }));

    const row = html(doc, "div", { class: "kb-dialog-options" }, body);
    const label = html(doc, "label", {}, row);
    const check = html(doc, "input", { type: "checkbox" }, label);
    check.checked = warp;
    check.addEventListener("change", () => {
      warp = check.checked;
    });
    label.appendChild(doc.createTextNode(msg(L, "RUN_WITHOUT_SCREEN_REFRESH")));

    const finish = (result: ProcedureParts | null): void => {
      close();
      resolve(result);
    };
    buttons(
      body,
      L,
      () => finish(null),
      () => {
        const proc = partsToProcedure(parts, warp);
        finish(proc.proccode.trim() ? proc : null);
      },
    );
    render();
  });
}
