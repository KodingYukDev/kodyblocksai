// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiTutorials, type TutorialCatalog } from "./AiTutorials";
import { ErrorBoundary } from "./ErrorBoundary";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const button = (text: string): HTMLButtonElement => {
  const b = [...document.querySelectorAll("button")].find((x) => x.textContent?.includes(text));
  if (!b) throw new Error(`tidak ada tombol ${text}`);
  return b as HTMLButtonElement;
};

describe("ErrorBoundary", () => {
  it("menampilkan layar ramah anak saat anak komponen error, dan 'Coba lagi' memasang ulang", () => {
    let fail = true;
    function Boom() {
      if (fail) throw new Error("rusak");
      return <p>baik-baik saja</p>;
    }
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const onError = vi.fn();
    act(() =>
      root.render(
        <ErrorBoundary onError={onError}>
          <Boom />
        </ErrorBoundary>,
      ),
    );
    expect(container.textContent).toContain("Ups, Kody tersandung!");
    expect(container.textContent).toContain("rusak");
    expect(onError).toHaveBeenCalled();
    fail = false;
    act(() => button("Coba lagi").click());
    expect(container.textContent).toContain("baik-baik saja");
    err.mockRestore();
  });
});

describe("AiTutorials", () => {
  const catalog: TutorialCatalog = {
    examples: [
      {
        id: "bgk",
        title: "Batu Gunting Kertas",
        summary: "Latih AI mengenali tangan.",
        concept: "Klasifikasi gambar",
        level: "Pemula",
        minutes: 20,
        labTab: "image",
        trainClasses: ["batu", "gunting"],
        steps: ["Buka AI Lab", "Latih model"],
      },
    ],
    build: vi.fn(async () => new Uint8Array([1, 2])),
  };

  it("kartu -> detail -> buka contoh -> latih AI di tab yang benar", async () => {
    const onOpenExample = vi.fn(async () => true);
    const onOpenLab = vi.fn();
    const onClose = vi.fn();
    await act(async () => {
      root.render(<AiTutorials load={async () => catalog} onOpenExample={onOpenExample} onOpenLab={onOpenLab} onClose={onClose} />);
    });
    expect(container.textContent).toContain("20 menit");
    act(() => button("Batu Gunting Kertas").click());
    expect(container.textContent).toContain("Latih model");
    expect(container.textContent).toContain("gunting");
    await act(async () => {
      button("Buka contoh").click();
    });
    expect(catalog.build).toHaveBeenCalledWith("bgk");
    expect(onOpenExample).toHaveBeenCalled();
    expect(container.textContent).toContain("Contoh sudah terbuka");
    act(() => button("Latih AI").click());
    expect(onOpenLab).toHaveBeenCalledWith("image", ["batu", "gunting"]);
    act(() => button("Mulai coding").click());
    expect(onClose).toHaveBeenCalled();
  });

  it("katalog gagal dimuat -> pesan ramah", async () => {
    await act(async () => {
      root.render(<AiTutorials load={() => Promise.reject(new Error("x"))} onOpenExample={vi.fn()} onClose={vi.fn()} />);
    });
    expect(container.textContent).toContain("Tutorial belum bisa dimuat");
  });
});
