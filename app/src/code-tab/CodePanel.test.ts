// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { dropTargetAt, toolboxDefaults } from "./CodePanel";
import type { IRuntime, ITarget } from "@kody/engine";

describe("dropTargetAt (seret skrip ke sprite)", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  function mount(): { sprite: HTMLElement; thumb: HTMLElement; self: HTMLElement } {
    document.body.innerHTML = `
      <ul>
        <li class="kb-sprite-item" data-target-id="spr2"><button><span class="thumb">x</span></button></li>
        <li class="kb-sprite-item" data-target-id="spr1"><button>me</button></li>
      </ul>`;
    const sprite = document.querySelector<HTMLElement>('[data-target-id="spr2"]')!;
    return { sprite, thumb: sprite.querySelector<HTMLElement>(".thumb")!, self: document.querySelector<HTMLElement>('[data-target-id="spr1"] button')! };
  }

  it("menemukan sprite di bawah jari/kursor lewat elemen anaknya", () => {
    const { sprite, thumb } = mount();
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => thumb });
    expect(dropTargetAt(document, 10, 10, "spr1")).toBe(sprite);
  });

  it("mengabaikan sprite yang sedang diedit dan area kosong", () => {
    const { self } = mount();
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => self });
    expect(dropTargetAt(document, 10, 10, "spr1")).toBeNull();
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => document.body });
    expect(dropTargetAt(document, 10, 10, "spr1")).toBeNull();
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => null });
    expect(dropTargetAt(document, 10, 10, "spr1")).toBeNull();
  });
});

describe("toolboxDefaults", () => {
  it("kostum/latar kedua dan suara terakhir seperti scratch-gui", () => {
    const named = (...n: string[]) => n.map((name) => ({ name }));
    const target = { getCostumes: () => named("a", "b"), getSounds: () => named("s1", "s2"), x: 3, y: 4 } as unknown as ITarget;
    const runtime = { getTargetForStage: () => ({ getCostumes: () => named("bg") }) } as unknown as IRuntime;
    expect(toolboxDefaults(runtime, target)).toEqual({ costumeName: "b", backdropName: "bg", soundName: "s2", x: 3, y: 4 });
  });
});
