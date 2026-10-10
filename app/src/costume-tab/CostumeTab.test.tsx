// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildLibrary } from "../library/catalog-build";
import type { LibraryLoader } from "../library/library-loader";
import { CostumeTab } from "./CostumeTab";
import { createMemoryAssetHost } from "./memory-host";
import { makeCostume } from "./new-asset";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const built = buildLibrary();
const loader: LibraryLoader = {
  loadCatalog: async () => built.catalog,
  loadAsset: async (md5ext) => {
    const data = built.files.get(md5ext);
    if (!data) throw new Error("tidak ada");
    return { assetId: md5ext.split(".")[0] ?? "", dataFormat: md5ext.split(".")[1] ?? "", data };
  },
  assetUrl: (m) => `/assets/library/${m}`,
};

const svg = (name: string) => {
  const c = makeCostume(name, "svg", new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>`), 1, 5, 5);
  return { ...c.state, asset: c.asset };
};

let root: Root;
let el: HTMLDivElement;

beforeEach(() => {
  el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
});

afterEach(() => {
  act(() => root.unmount());
  el.remove();
});

const flush = async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
};

describe("CostumeTab", () => {
  it("menampilkan daftar, memilih, dan menolak hapus costume terakhir", async () => {
    const host = createMemoryAssetHost({ id: "s1", name: "Kody", isStage: false, costumes: [svg("a"), svg("b")], currentCostume: 0, sounds: [] });
    const notify = vi.fn();
    act(() => root.render(<CostumeTab host={host} loader={loader} notify={notify} />));
    const tiles = () => Array.from(el.querySelectorAll<HTMLElement>(".kb-assetlist__tile"));
    expect(tiles().map((t) => t.querySelector(".kb-assetlist__name")?.textContent)).toEqual(["a", "b"]);
    act(() => tiles()[1]?.click());
    expect(host.target.currentCostume).toBe(1);
    expect(tiles()[1]?.getAttribute("aria-selected")).toBe("true");

    act(() => el.querySelector<HTMLButtonElement>(".kb-assetlist__delete")?.click());
    expect(host.target.costumes.map((c) => c.name)).toEqual(["a"]);
    act(() => el.querySelector<HTMLButtonElement>(".kb-assetlist__delete")?.click());
    expect(host.target.costumes).toHaveLength(1);
    expect(notify).toHaveBeenCalledWith("warning", expect.stringContaining("terakhir"));
  });

  it("Alt+Panah mengurutkan; menu klik kanan menduplikat", async () => {
    const host = createMemoryAssetHost({ id: "s1", name: "Kody", isStage: false, costumes: [svg("a"), svg("b")], currentCostume: 0, sounds: [] });
    act(() => root.render(<CostumeTab host={host} loader={loader} />));
    const first = el.querySelector<HTMLElement>(".kb-assetlist__tile");
    act(() => first?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", altKey: true, bubbles: true })));
    expect(host.target.costumes.map((c) => c.name)).toEqual(["b", "a"]);
    const tile = el.querySelector<HTMLElement>(".kb-assetlist__tile");
    act(() => tile?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 5, clientY: 5 })));
    const dup = Array.from(el.querySelectorAll<HTMLButtonElement>(".kb-contextmenu button")).find((b) => b.textContent === "duplikat");
    await act(async () => {
      dup?.click();
    });
    expect(host.target.costumes.map((c) => c.name)).toEqual(["b", "b2", "a"]);
  });

  it("memilih dari pustaka menambah costume dan memilihnya", async () => {
    const host = createMemoryAssetHost({ id: "stage", name: "Stage", isStage: true, costumes: [svg("latar1")], currentCostume: 0, sounds: [] });
    act(() => root.render(<CostumeTab host={host} loader={loader} />));
    act(() => el.querySelector<HTMLButtonElement>(".kb-addmenu__main")?.click());
    await flush();
    const cards = el.querySelectorAll<HTMLButtonElement>(".kb-library__card");
    expect(cards.length).toBe(built.catalog.backdrops.length);
    const search = el.querySelector<HTMLInputElement>(".kb-library__search input");
    expect(search).toBeTruthy();
    await act(async () => {
      cards[0]?.click();
    });
    await flush();
    expect(host.target.costumes).toHaveLength(2);
    expect(host.target.currentCostume).toBe(1);
    expect(host.target.costumes[1]?.name).toBe(built.catalog.backdrops[0]?.name);
    expect(el.querySelector(".kb-library")).toBeNull();
  });

  it("paint editor menampilkan nama costume dan rename lewat host", async () => {
    const host = createMemoryAssetHost({ id: "s1", name: "Kody", isStage: false, costumes: [svg("a"), svg("b")], currentCostume: 0, sounds: [] });
    act(() => root.render(<CostumeTab host={host} loader={loader} />));
    const input = el.querySelector<HTMLInputElement>(".kb-paint__name input");
    expect(input?.value).toBe("a");
    expect(el.querySelectorAll(".kb-paint__tool")).toHaveLength(9);
    act(() => {
      if (!input) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "b");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => {
      input?.focus();
      input?.blur();
    });
    expect(host.target.costumes[0]?.name).toBe("b2");
  });
});
