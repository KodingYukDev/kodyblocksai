// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemoryAssetHost } from "../costume-tab/memory-host";
import { makeSound } from "../costume-tab/new-asset";
import type { LibraryLoader } from "../library/library-loader";
import { setAudioContext } from "./sound-media";
import { SoundTab } from "./SoundTab";
import { decodeWav, encodeWav } from "./wav";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** AudioContext palsu secukupnya untuk PreviewPlayer. */
class FakeCtx {
  currentTime = 0;
  sampleRate = 22050;
  destination = {};
  resume = async () => undefined;
  createBuffer(_c: number, length: number, rate: number) {
    return { duration: length / rate, copyToChannel: () => undefined };
  }
  createBufferSource() {
    return { buffer: null, connect: () => undefined, start: () => undefined, stop: () => undefined, onended: null };
  }
}

const loader: LibraryLoader = {
  loadCatalog: async () => {
    throw new Error("tidak dipakai");
  },
  loadAsset: async () => {
    throw new Error("tidak dipakai");
  },
  assetUrl: (m) => m,
};

const tone = (name: string, n = 4410) => {
  const s = makeSound(name, "wav", encodeWav(Float32Array.from({ length: n }, (_, i) => 0.5 * Math.sin(i / 5)), 22050), 22050, n);
  return { ...s.state, asset: s.asset };
};

let root: Root;
let el: HTMLDivElement;

beforeEach(() => {
  setAudioContext(new FakeCtx() as unknown as AudioContext);
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

describe("SoundTab", () => {
  it("daftar suara, durasi, dan aturan seleksi saat hapus", async () => {
    const host = createMemoryAssetHost({ id: "s1", name: "Kody", isStage: false, costumes: [], currentCostume: 0, sounds: [tone("a"), tone("b"), tone("c")] });
    act(() => root.render(<SoundTab host={host} loader={loader} />));
    await flush();
    const tiles = () => Array.from(el.querySelectorAll<HTMLElement>(".kb-assetlist__tile"));
    expect(tiles()).toHaveLength(3);
    expect(tiles()[0]?.querySelector(".kb-assetlist__detail")?.textContent).toBe("0,20 dtk");
    act(() => tiles()[2]?.click());
    expect(el.querySelector<HTMLInputElement>(".kb-paint__name input")?.value).toBe("c");
    act(() => el.querySelector<HTMLButtonElement>(".kb-assetlist__delete")?.click());
    await flush();
    expect(host.target.sounds.map((s) => s.name)).toEqual(["a", "b"]);
    expect(tiles()[1]?.getAttribute("aria-selected")).toBe("true");
  });

  it("efek 'Lebih Keras' disimpan ke host sebagai WAV baru dengan nama tetap", async () => {
    const host = createMemoryAssetHost({ id: "s1", name: "Kody", isStage: false, costumes: [], currentCostume: 0, sounds: [tone("pop")] });
    act(() => root.render(<SoundTab host={host} loader={loader} />));
    await flush();
    const before = host.target.sounds[0]?.assetId;
    const louder = Array.from(el.querySelectorAll<HTMLButtonElement>(".kb-sound__effect")).find((b) => b.textContent === "Lebih Keras");
    expect(louder?.disabled).toBe(false);
    await act(async () => {
      louder?.click();
    });
    await flush();
    const after = host.target.sounds[0];
    expect(after?.name).toBe("pop");
    expect(after?.assetId).not.toBe(before);
    const pcm = decodeWav(after?.asset?.data ?? new Uint8Array());
    let peak = 0;
    for (const v of pcm.samples.subarray(500, 3000)) peak = Math.max(peak, Math.abs(v));
    expect(peak).toBeCloseTo(0.625, 2);
    // undo mengembalikan isi lama
    await act(async () => {
      el.querySelector<HTMLButtonElement>('.kb-sound__top button[aria-label="Urungkan"]')?.click();
    });
    await flush();
    const undone = decodeWav(host.target.sounds[0]?.asset?.data ?? new Uint8Array());
    let p2 = 0;
    for (const v of undone.samples.subarray(500, 3000)) p2 = Math.max(p2, Math.abs(v));
    expect(p2).toBeCloseTo(0.5, 2);
  });

  it("tanpa suara menampilkan petunjuk", async () => {
    const host = createMemoryAssetHost({ id: "s1", name: "Kody", isStage: false, costumes: [], currentCostume: 0, sounds: [] });
    act(() => root.render(<SoundTab host={host} loader={loader} />));
    expect(el.querySelector(".kb-assettab__hint")?.textContent).toContain("Belum ada suara");
  });
});
