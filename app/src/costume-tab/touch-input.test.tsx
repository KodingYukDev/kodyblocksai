// @vitest-environment jsdom
/** Sentuhan tablet: menu tambah (ketuk dulu untuk membuka) dan daftar asset (tahan = menu, tahan+geser = urutkan). */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AddMenu } from "./AddMenu";
import { AssetList } from "./AssetList";
import { tabStrings } from "./strings";
import { LONG_PRESS_MS } from "./use-touch-reorder";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
  vi.useRealTimers();
});

function pointer(target: Element, type: string, pointerType: "touch" | "mouse" | "pen", x = 0, y = 0): void {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(ev, "pointerType", { value: pointerType });
  Object.defineProperty(ev, "pointerId", { value: 1 });
  act(() => {
    target.dispatchEvent(ev);
  });
}

function click(target: Element): void {
  act(() => {
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

describe("AddMenu di tablet", () => {
  const setup = () => {
    const main = vi.fn();
    const paint = vi.fn();
    act(() =>
      root.render(
        <AddMenu
          main={{ key: "lib", title: "Pustaka", icon: "L", onClick: main }}
          items={[{ key: "paint", title: "Gambar", icon: "P", onClick: paint }]}
        />,
      ),
    );
    return { main, paint, button: el.querySelector(".kb-addmenu__main")! };
  };

  it("ketukan pertama membuka pilihan, ketukan kedua menjalankan aksi utama", () => {
    const { main, paint, button } = setup();
    pointer(button, "pointerover", "touch");
    pointer(button, "pointerenter", "touch");
    pointer(button, "pointerdown", "touch");
    click(button);
    expect(main).not.toHaveBeenCalled();
    const item = el.querySelector(".kb-addmenu__item");
    expect(item).not.toBeNull();
    click(item!);
    expect(paint).toHaveBeenCalledTimes(1);
    // Menu tertutup setelah memilih; ketuk lagi = buka lagi, ketuk sekali lagi = aksi utama.
    pointer(button, "pointerdown", "touch");
    click(button);
    pointer(button, "pointerdown", "touch");
    click(button);
    expect(main).toHaveBeenCalledTimes(1);
  });

  it("mouse: klik langsung menjalankan aksi utama (perilaku desktop tetap)", () => {
    const { main, button } = setup();
    pointer(button, "pointerdown", "mouse");
    click(button);
    expect(main).toHaveBeenCalledTimes(1);
  });

  it("ketuk di luar menutup menu", () => {
    const { button } = setup();
    pointer(button, "pointerdown", "touch");
    click(button);
    expect(el.querySelector(".kb-addmenu__list")).not.toBeNull();
    pointer(document.body, "pointerdown", "touch");
    expect(el.querySelector(".kb-addmenu__list")).toBeNull();
  });
});

describe("AssetList di tablet", () => {
  const t = tabStrings("id");
  const items = ["kostum1", "kostum2", "kostum3"].map((name) => ({ key: name, name }));

  const setup = () => {
    const cb = { onSelect: vi.fn(), onDuplicate: vi.fn(), onDelete: vi.fn(), onExport: vi.fn(), onReorder: vi.fn() };
    act(() => root.render(<AssetList items={items} selectedIndex={0} strings={t} ariaLabel="Kostum" addMenu={null} {...cb} />));
    const tiles = [...el.querySelectorAll<HTMLElement>(".kb-assetlist__tile")];
    return { cb, tiles };
  };

  it("tahan lalu lepas membuka menu duplikat/ekspor/hapus tanpa klik ganda", () => {
    vi.useFakeTimers();
    const { cb, tiles } = setup();
    const tile = tiles[1]!;
    pointer(tile, "pointerdown", "touch", 10, 60);
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS + 10);
    });
    pointer(tile, "pointerup", "touch", 10, 60);
    click(tile);
    expect(cb.onSelect).toHaveBeenCalledTimes(1); // dari menu, bukan dari klik sisa
    const menu = el.querySelector(".kb-contextmenu");
    expect(menu).not.toBeNull();
    const dup = [...menu!.querySelectorAll("button")].find((b) => b.textContent === t.duplicate)!;
    click(dup);
    expect(cb.onDuplicate).toHaveBeenCalledWith(1);
  });

  it("tahan lalu geser ke tile lain mengurutkan ulang", () => {
    vi.useFakeTimers();
    const { cb, tiles } = setup();
    // jsdom tidak punya elementFromPoint (tanpa layout): jari berada di atas tile ketiga.
    const doc = document as unknown as Record<string, unknown>;
    const original = doc.elementFromPoint;
    doc.elementFromPoint = () => tiles[2]!;
    pointer(tiles[0]!, "pointerdown", "touch", 10, 10);
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS + 10);
    });
    pointer(tiles[0]!, "pointermove", "touch", 10, 120);
    pointer(tiles[0]!, "pointerup", "touch", 10, 120);
    expect(cb.onReorder).toHaveBeenCalledWith(0, 2);
    expect(el.querySelector(".kb-contextmenu")).toBeNull();
    if (original) doc.elementFromPoint = original;
    else delete doc.elementFromPoint;
  });

  it("geser sebelum waktu tahan habis = gulir biasa (tidak ada menu/urut ulang)", () => {
    vi.useFakeTimers();
    const { cb, tiles } = setup();
    pointer(tiles[0]!, "pointerdown", "touch", 10, 10);
    pointer(tiles[0]!, "pointermove", "touch", 10, 60);
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS + 10);
    });
    pointer(tiles[0]!, "pointerup", "touch", 10, 60);
    expect(cb.onReorder).not.toHaveBeenCalled();
    expect(el.querySelector(".kb-contextmenu")).toBeNull();
  });
});
