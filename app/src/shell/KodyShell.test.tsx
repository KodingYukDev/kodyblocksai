// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_MONITOR } from "@kody/engine";
import { createAppBus } from "../app-events";
import { createMemoryAutosaveStore, type ShellAutosaveStore } from "./autosave";
import { KodyShell, type KodyShellProps } from "./KodyShell";
import { createMockController, type MockController } from "./mock-controller";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
});

function render(ctrl: MockController, bus = createAppBus(), extra: Partial<KodyShellProps> = {}) {
  act(() => {
    root.render(
      <KodyShell
        controller={ctrl}
        bus={bus}
        panels={{ code: <div data-testid="code">kode</div> }}
        confirm={() => true}
        autosaveStore={null}
        {...extra}
      />,
    );
  });
  return bus;
}

const q = <T extends Element = HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`tidak ada ${sel}`);
  return el;
};
const byLabel = (label: string): HTMLElement => q(`[aria-label="${label}"]`);
const click = (el: Element): void => {
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};
const typeInto = (input: HTMLInputElement, value: string): void => {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const pressEnter = (input: HTMLInputElement): void => {
  act(() => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
};

describe("KodyShell", () => {
  it("menu bar 48px dengan logo, tab Kode/Kostum/Suara, panel kode tampil", () => {
    render(createMockController());
    expect(q(".kb-menu-bar img").getAttribute("alt")).toBe("KodyBlocks");
    const tabs = [...document.querySelectorAll('[role="tab"]')].map((t) => t.textContent);
    expect(tabs).toEqual(["Kode", "Kostum", "Suara"]);
    expect(q('[data-testid="code"]').textContent).toBe("kode");
    expect(q(".kb-shell").className).toContain("kb-shell--wide");
  });

  it("tab berpindah dan memancarkan event; label Latar untuk stage", () => {
    const ctrl = createMockController();
    const bus = render(ctrl);
    const seen = vi.fn();
    bus.on("editor:tab-changed", seen);
    click([...document.querySelectorAll('[role="tab"]')][2]!);
    expect(seen).toHaveBeenCalledWith({ tab: "sounds" });
    expect(q('[role="tab"][aria-selected="true"]').textContent).toBe("Suara");
    act(() => ctrl.selectTarget("stage"));
    expect([...document.querySelectorAll('[role="tab"]')][1]!.textContent).toBe("Latar");
  });

  it("bendera hijau, stop, dan turbo dari menu Edit", () => {
    const ctrl = createMockController();
    render(ctrl);
    click(byLabel("Jalankan"));
    expect(ctrl.calls.some((c) => c.method === "greenFlag")).toBe(true);
    expect(q(".kb-flag").className).toContain("kb-flag--active");
    click(byLabel("Berhenti"));
    expect(ctrl.calls.some((c) => c.method === "stopAll")).toBe(true);
    click([...document.querySelectorAll(".kb-menu-bar__item")].find((b) => b.textContent?.includes("Edit"))!);
    click([...document.querySelectorAll('[role="menuitem"]')].find((b) => b.textContent?.includes("Turbo"))!);
    expect(ctrl.getSnapshot().turbo).toBe(true);
    expect(q(".kb-turbo-indicator").textContent).toContain("Mode Turbo");
  });

  it("judul project diedit di tempat dan dikirim saat Enter", () => {
    const bus = render(createMockController());
    const seen = vi.fn();
    bus.on("project:title-changed", seen);
    const input = byLabel("Judul project") as HTMLInputElement;
    typeInto(input, "Game Robot");
    pressEnter(input);
    expect(seen).toHaveBeenCalledWith({ title: "Game Robot" });
    expect(input.value).toBe("Game Robot");
  });

  it("menu Belajar AI hanya tampil bila ada handler, dan memanggilnya", () => {
    render(createMockController());
    expect(document.querySelector('[aria-label="Belajar AI"]')).toBeNull();
    const lab = vi.fn();
    const tutorials = vi.fn();
    render(createMockController(), createAppBus(), { onOpenAiLab: lab, onOpenTutorials: tutorials });
    click(byLabel("Belajar AI"));
    const items = [...document.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent);
    expect(items.some((x) => x?.includes("Tutorial"))).toBe(true);
    click([...document.querySelectorAll('[role="menuitem"]')].find((b) => b.textContent?.includes("Latih AI"))!);
    expect(lab).toHaveBeenCalled();
    expect(tutorials).not.toHaveBeenCalled();
  });

  it("ukuran panggung kecil/normal/layar penuh + Esc", () => {
    const bus = render(createMockController());
    const modes: string[] = [];
    bus.on("stage:size-mode", ({ mode }) => modes.push(mode));
    const canvas = q<HTMLCanvasElement>(".kb-stage__canvas");
    expect(canvas.style.width).toBe("480px");
    click(byLabel("Panggung kecil"));
    expect(canvas.style.width).toBe("240px");
    click(byLabel("Layar penuh"));
    expect(q(".kb-stage-pane").className).toContain("kb-stage-pane--fullscreen");
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(modes).toEqual(["small", "fullscreen", "small"]);
    expect(canvas.style.width).toBe("240px");
  });

  it("ponsel: panggung di atas, panel sprite pindah ke tab Sprite", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 375 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    render(createMockController());
    expect(q(".kb-shell").className).toContain("kb-shell--phone");
    expect(q(".kb-shell").className).toContain("kb-shell--stacked");
    const w = parseInt(q<HTMLCanvasElement>(".kb-stage__canvas").style.width, 10);
    expect(w).toBeLessThanOrEqual(375 - 18);
    // Panel sprite tidak di kolom panggung, tetapi tersedia lewat tab.
    expect(q(".kb-shell__stage-column").querySelector(".kb-target-pane")).toBeNull();
    const spritesTab = [...document.querySelectorAll('[role="tab"]')].find((b) => b.textContent === "Sprite")!;
    click(spritesTab);
    expect(q("#kb-tabpanel-sprites").querySelector(".kb-target-pane")).not.toBeNull();
    // Tombol ukuran panggung tetap ada di ponsel.
    expect(document.querySelector('[aria-label="Panggung kecil"]')).not.toBeNull();
  });

  it("tablet potret: panggung dan panel sprite berdampingan di atas kode", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 768 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 1024 });
    render(createMockController());
    expect(q(".kb-shell").className).toContain("kb-shell--split");
    expect(q(".kb-shell__stage-column").querySelector(".kb-target-pane")).not.toBeNull();
    expect([...document.querySelectorAll('[role="tab"]')].some((b) => b.textContent === "Sprite")).toBe(false);
  });

  it("tombol panah di layar mengirim keydown/keyup ke runtime", () => {
    const mm = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes("coarse"),
      media: query,
      addEventListener() {},
      removeEventListener() {},
    })) as unknown as typeof window.matchMedia;
    try {
      const ctrl = createMockController();
      render(ctrl);
      click(byLabel("Tombol panah di layar"));
      const left = byLabel("Panah kiri");
      // jsdom belum punya PointerEvent: MouseEvent bertipe pointer* + pointerId sudah cukup untuk React.
      const pointer = (type: string): Event => {
        const ev = new MouseEvent(type, { bubbles: true, cancelable: true });
        Object.defineProperty(ev, "pointerId", { value: 7 });
        return ev;
      };
      act(() => {
        left.dispatchEvent(pointer("pointerdown"));
      });
      act(() => {
        left.dispatchEvent(pointer("pointerup"));
      });
      const keys = ctrl.calls.filter((c) => c.method === "postKeyboard").map((c) => c.args[0]);
      expect(keys).toEqual([
        { key: "ArrowLeft", isDown: true },
        { key: "ArrowLeft", isDown: false },
      ]);
    } finally {
      window.matchMedia = mm;
      try {
        window.localStorage.removeItem("kb.keypad");
      } catch {
        // abaikan
      }
    }
  });

  it("simpan otomatis: perubahan disimpan, ditawarkan saat dibuka lagi, dan bisa dipulihkan", async () => {
    vi.useFakeTimers();
    try {
      const store = createMemoryAutosaveStore();
      let emit: () => void = () => {};
      const subscribe = (l: () => void) => {
        emit = l;
        return () => {
          emit = () => {};
        };
      };
      const ctrl = createMockController();
      render(ctrl, createAppBus(), { autosaveStore: store, subscribeProjectChanges: subscribe });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      act(() => emit());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4000);
      });
      expect(store.record?.dirty).toBe(true);
      expect(store.record?.title).toBe("Project KodyBlocks");

      // Buka ulang: dialog pulihkan muncul, "Lanjutkan" memuat bytes simpanan.
      act(() => root.unmount());
      root = createRoot(container);
      const ctrl2 = createMockController();
      render(ctrl2, createAppBus(), { autosaveStore: store as ShellAutosaveStore });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });
      expect(document.body.textContent).toContain("Lanjutkan project terakhir?");
      await act(async () => {
        [...document.querySelectorAll("button")].find((b) => b.textContent === "Lanjutkan")!.click();
        await vi.advanceTimersByTimeAsync(10);
      });
      expect(ctrl2.calls.some((c) => c.method === "loadProjectFile")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("info sprite: x dikirim sebagai angka saat blur, teks bukan angka diabaikan", () => {
    const ctrl = createMockController();
    render(ctrl);
    const x = byLabel("x") as HTMLInputElement;
    typeInto(x, "42.6");
    act(() => {
      x.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(ctrl.calls.filter((c) => c.method === "postSpriteInfo").at(-1)?.args[0]).toEqual({ x: 42.6 });
    expect(x.value).toBe("43");
    typeInto(x, "abc");
    pressEnter(x);
    expect(ctrl.calls.filter((c) => c.method === "postSpriteInfo")).toHaveLength(1);
  });

  it("info sprite nonaktif saat stage dipilih; rename lewat kolom nama", () => {
    const ctrl = createMockController();
    render(ctrl);
    const name = byLabel("Nama") as HTMLInputElement;
    typeInto(name, "Robot");
    pressEnter(name);
    expect(ctrl.getSnapshot().targets[1]?.name).toBe("Robot");
    act(() => ctrl.selectTarget("stage"));
    expect((byLabel("x") as HTMLInputElement).disabled).toBe(true);
    expect((byLabel("x") as HTMLInputElement).value).toBe("");
  });

  it("tampil/sembunyi & arah dari popover", () => {
    const ctrl = createMockController();
    render(ctrl);
    click(byLabel("Sembunyikan sprite"));
    expect(ctrl.getSnapshot().targets[1]?.visible).toBe(false);
    act(() => {
      byLabel("Arah").dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });
    click(byLabel("Kiri/Kanan"));
    expect(ctrl.getSnapshot().targets[1]?.rotationStyle).toBe("left-right");
    const dir = q<HTMLInputElement>('input[aria-label="Arah"]');
    typeInto(dir, "-90");
    pressEnter(dir);
    expect(ctrl.getSnapshot().targets[1]?.direction).toBe(-90);
  });

  it("grid sprite: pilih, hapus, menu konteks duplikat", () => {
    const ctrl = createMockController();
    ctrl.patch({
      targets: [...ctrl.getSnapshot().targets, { ...ctrl.getSnapshot().targets[1]!, id: "bola", name: "Bola" }],
    });
    render(ctrl);
    click(q('.kb-sprite-grid button[aria-label="Bola"]'));
    expect(ctrl.getSnapshot().editingTargetId).toBe("bola");
    act(() => {
      q('.kb-sprite-grid button[aria-label="Kody"]').dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, clientX: 10, clientY: 10 }),
      );
    });
    click([...document.querySelectorAll(".kb-context-menu__item")].find((b) => b.textContent === "duplikat")!);
    expect(ctrl.calls.some((c) => c.method === "duplicateSprite" && c.args[0] === "kody")).toBe(true);
    click(byLabel("hapus Bola"));
    expect(ctrl.getSnapshot().targets.map((t) => t.id)).toEqual(["stage", "kody"]);
  });

  it("tambah sprite gagal (belum tersedia) memunculkan alert", async () => {
    const ctrl = createMockController();
    ctrl.addSprite = async () => {
      const e = new Error("x");
      e.name = "FeatureUnavailableError";
      throw e;
    };
    render(ctrl);
    await act(async () => {
      q('.kb-sprite-selector__actions .kb-action-menu__button--main').dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(q(".kb-alert").textContent).toContain("belum tersedia");
  });

  it("alert dari bus app tampil", () => {
    const bus = render(createMockController());
    act(() => bus.emit("ui:alert", { level: "warning", message: "Kamera aktif" }));
    expect(q(".kb-alert--warning").textContent).toContain("Kamera aktif");
  });

  it("tanya & tunggu: jawaban dikirim dengan Enter", () => {
    const ctrl = createMockController({ question: "Siapa namamu?" });
    render(ctrl);
    expect(q(".kb-question__label").textContent).toBe("Siapa namamu?");
    const input = q<HTMLInputElement>(".kb-question__input");
    typeInto(input, "Budi");
    pressEnter(input);
    expect(ctrl.calls.find((c) => c.method === "answerQuestion")?.args).toEqual(["Budi"]);
    expect(document.querySelector(".kb-question")).toBeNull();
  });

  it("keyboard dokumen diteruskan ke runtime, input teks diabaikan", () => {
    const ctrl = createMockController();
    render(ctrl);
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: " ", keyCode: 32, bubbles: true }));
    });
    expect(ctrl.calls.find((c) => c.method === "postKeyboard")?.args[0]).toEqual({ key: " ", isDown: true });
    const before = ctrl.calls.length;
    act(() => {
      byLabel("x").dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    });
    expect(ctrl.calls.slice(before).some((c) => c.method === "postKeyboard")).toBe(false);
  });

  it("monitor variabel tampil dengan label & nilai; klik ganda ganti mode", () => {
    const ctrl = createMockController({
      monitors: [{ ...DEFAULT_MONITOR, id: "v1", opcode: "data_variable", params: { VARIABLE: "skor" }, value: 0.1 + 0.2, x: 10, y: 20 }],
    });
    render(ctrl);
    expect(q(".kb-monitor-label").textContent).toBe("skor");
    expect(q(".kb-monitor-value").textContent).toBe("0.3");
    expect(q<HTMLElement>(".kb-monitor").style.left).toBe("10px");
    act(() => {
      q(".kb-monitor").dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    expect(ctrl.getSnapshot().monitors[0]?.mode).toBe("large");
  });

  it("monitor slider mengubah variabel; monitor list menambah item", () => {
    const ctrl = createMockController({
      monitors: [
        { ...DEFAULT_MONITOR, id: "v1", opcode: "data_variable", params: { VARIABLE: "n" }, value: 5, mode: "slider" },
        { ...DEFAULT_MONITOR, id: "l1", opcode: "data_listcontents", params: { LIST: "isi" }, value: ["a"], mode: "list" },
      ],
    });
    ctrl.variables.set("stage:l1", ["a"]);
    render(ctrl);
    const slider = q<HTMLInputElement>(".kb-monitor-slider");
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(slider, "7");
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(ctrl.calls.find((c) => c.method === "setVariableValue")?.args).toEqual([null, "v1", 7]);
    expect(q(".kb-list-header").textContent).toBe("isi");
    expect(q(".kb-list-length").textContent).toBe("panjang 1");
    click(byLabel("Tambah item"));
    expect(ctrl.variables.get("stage:l1")).toEqual(["a", ""]);
    // Monitor otomatis diberi posisi oleh tata letak lalu disimpan ke runtime.
    expect(ctrl.calls.some((c) => c.method === "updateMonitor" && (c.args[0] as { x?: number }).x === 5)).toBe(true);
  });

  it("menu File > Simpan mengunduh .sb3 dengan judul", async () => {
    const ctrl = createMockController();
    const bus = render(ctrl);
    const saved = vi.fn();
    bus.on("project:saved", saved);
    const createObjectURL = vi.fn(() => "blob:x");
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    let downloaded = "";
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      downloaded = this.download;
    };
    click([...document.querySelectorAll(".kb-menu-bar__item")].find((b) => b.textContent?.includes("File"))!);
    await act(async () => {
      [...document.querySelectorAll('[role="menuitem"]')]
        .find((b) => b.textContent?.includes("Simpan"))!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    HTMLAnchorElement.prototype.click = origClick;
    expect(downloaded).toBe("Project KodyBlocks.sb3");
    expect(saved).toHaveBeenCalled();
  });
});
