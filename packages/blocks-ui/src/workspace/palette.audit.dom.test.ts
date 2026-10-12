// @vitest-environment jsdom
/**
 * Audit palet dengan engine sungguhan: setiap blok di palet sprite & panggung punya definisi,
 * tergambar, bisa dibawa ke workspace (event create diterima engine tanpa galat), dan setiap field
 * yang bisa diedit membuka editornya. Juga: ganti nama variabel memperbarui teks blok (cache layout).
 */
import { afterEach, describe, expect, it } from "vitest";
import type { Block, ITarget } from "@kody/engine";
import { makeKit } from "@kody/engine/testing/test-kit";
import { createWorkspace } from "./index";
import type { BlocksWorkspace } from "./editor";
import { getDescendants } from "./tree";

function setup(onStage = false) {
  const kit = makeKit();
  const sprite = kit.addSprite("Kody");
  kit.addSprite("Bola");
  const target: ITarget = onStage ? kit.stage : sprite;
  kit.runtime.setEditingTarget(target);
  const errors: unknown[] = [];
  kit.runtime.on("RUNTIME_ERROR", (e) => errors.push(e));
  const host = document.createElement("div");
  document.body.appendChild(host);
  const ws = createWorkspace(host, { runtime: kit.runtime, targetId: target.id, locale: "id" }) as unknown as BlocksWorkspace;
  return { kit, ws, host, target, errors };
}

/** Cari elemen dengan atribut bernilai persis (jsdom tidak punya CSS.escape). */
function find(host: HTMLElement, selector: string, attrs: Record<string, string>): Element | null {
  return Array.from(host.querySelectorAll(selector)).find((el) => Object.entries(attrs).every(([k, v]) => el.getAttribute(k) === v)) ?? null;
}

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
});

// Audit penuh di jsdom lambat (ratusan blok + DOM): beri waktu lebih.
const SLOW = 90_000;

for (const onStage of [false, true]) {
  describe(`audit palet ${onStage ? "panggung" : "sprite"}`, { timeout: SLOW }, () => {
    it("semua blok palet punya definisi dan tergambar", () => {
      const env = setup(onStage);
      cleanup = () => (env.ws.dispose(), env.host.remove());
      const roots = env.ws.flyoutContent.items.flatMap((it) => (it.kind === "block" ? [it.rootId] : []));
      expect(roots.length).toBeGreaterThan(onStage ? 60 : 100);
      const missing: string[] = [];
      for (const root of roots) {
        for (const id of getDescendants(env.ws.flyoutContent.blocks, root)) {
          const op = env.ws.flyoutContent.blocks[id]?.opcode ?? "?";
          if (!env.ws.lookup(op)) missing.push(op);
        }
        expect(find(env.host, "[data-flyout-root]", { "data-flyout-root": root }), root).not.toBeNull();
      }
      expect([...new Set(missing)]).toEqual([]);
    });

    it("setiap blok palet bisa dibawa ke workspace dan field-nya bisa diedit", () => {
      const env = setup(onStage);
      cleanup = () => (env.ws.dispose(), env.host.remove());
      const roots = env.ws.flyoutContent.items.flatMap((it) => (it.kind === "block" ? [it.rootId] : []));
      const created: string[] = [];
      roots.forEach((root, i) => {
        const { events, topId } = env.ws.actions.instantiateFromFlyout(root, { x: 0, y: i * 80 });
        expect(topId, root).not.toBeNull();
        env.ws.apply(events);
        if (topId) created.push(topId);
      });
      expect(env.errors).toEqual([]);
      const container = env.target.blocks;
      for (const id of created) {
        expect(container.getBlock(id), id).toBeTruthy();
        expect(find(env.host, ".kb-main-svg [data-top-id]", { "data-top-id": id }), id).not.toBeNull();
      }
      // Field yang bisa diedit membuka editor yang sesuai.
      const blocks = env.ws.blocks();
      const failures: string[] = [];
      let opened = 0;
      for (const b of Object.values(blocks) as Block[]) {
        for (const name of Object.keys(b.fields)) {
          if (!env.ws.actions.isEditableField(blocks, b.id, name)) continue;
          const anchor = find(env.host, ".kb-main-svg [data-field]", { "data-block-id": b.id, "data-field": name });
          if (!anchor) {
            failures.push(`${b.opcode}.${name}: field tidak tergambar`);
            continue;
          }
          try {
            env.ws.actions.editField("workspace", b.id, name, anchor);
          } catch (e) {
            failures.push(`${b.opcode}.${name}: ${String(e)}`);
            continue;
          }
          const editor = env.host.querySelector(".kb-dropdown, .kb-colour, .kb-field-editor");
          if (!editor) failures.push(`${b.opcode}.${name}: editor tidak muncul`);
          else opened++;
          if (editor?.classList.contains("kb-dropdown") && !editor.querySelector(".kb-dropdown-item")) failures.push(`${b.opcode}.${name}: dropdown kosong`);
          // Tutup editor tanpa menyimpan.
          env.ws.overlay.hide();
          const input = env.host.querySelector<HTMLInputElement>(".kb-field-editor");
          input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
          env.host.querySelectorAll(".kb-numpad, .kb-angle, .kb-piano").forEach((el) => el.remove());
        }
      }
      expect(failures).toEqual([]);
      expect(opened).toBeGreaterThan(50);
      // Rapikan + undo seluruh rapikan.
      const before = JSON.stringify(Object.values(env.ws.blocks()).filter((b) => b.topLevel).map((b) => [b.id, b.x, b.y]));
      env.ws.cleanUp();
      env.ws.undo();
      const after = JSON.stringify(Object.values(env.ws.blocks()).filter((b) => b.topLevel).map((b) => [b.id, b.x, b.y]));
      expect(after).toBe(before);
      expect(env.errors).toEqual([]);
    });
  });
}

describe("variabel di workspace", { timeout: SLOW }, () => {
  it("ganti nama variabel memperbarui teks blok yang sudah tergambar", () => {
    const env = setup();
    cleanup = () => (env.ws.dispose(), env.host.remove());
    env.ws.apply([{ type: "var_create", varId: "v1", varName: "skor", varType: "", isLocal: false, isCloud: false }]);
    const root = env.ws.flyoutContent.items.find((it) => it.kind === "block" && env.ws.flyoutContent.blocks[it.rootId]?.opcode === "data_variable");
    expect(root).toBeTruthy();
    const { events, topId } = env.ws.actions.instantiateFromFlyout(root && root.kind === "block" ? root.rootId : "", { x: 10, y: 10 });
    env.ws.apply(events);
    const text = () => find(env.host, ".kb-main-svg [data-top-id]", { "data-top-id": topId ?? "" })?.textContent ?? "";
    expect(text()).toContain("skor");
    env.ws.apply([{ type: "var_rename", varId: "v1", newName: "nilai" }]);
    expect(text()).toContain("nilai");
    expect(text()).not.toContain("skor");
    env.ws.undo();
    expect(text()).toContain("skor");
  });
});
