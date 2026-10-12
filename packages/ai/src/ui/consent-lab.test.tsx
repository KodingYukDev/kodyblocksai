// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { TRAINED_STATE_KEYS } from "../classifier/storage";
import { TextClassifier } from "../classifier/text-nb";
import AiLab from "../lab/AiLab";
import { createFakeRuntime, fakeServices } from "../testing/fakes";
import type { TrainedClassifier } from "../types";
import { AiConsentDialog, createNetworkConsent } from "./NetworkConsent";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
function mount(node: React.ReactNode): HTMLDivElement {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(node));
  return host;
}
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
});

const click = (el: Element | null | undefined): void => {
  act(() => (el as HTMLElement).click());
};
const byText = (container: Element, text: string): HTMLElement | undefined =>
  [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === text) as HTMLElement | undefined;
function type(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("dialog persetujuan internet", () => {
  it("tanpa dialog terpasang: permintaan langsung ditolak (default menolak)", async () => {
    const consent = createNetworkConsent();
    await expect(consent.request("speech-recognition")).resolves.toBe(false);
  });

  it("dialog tampil, fokus awal di 'Jangan', Escape menolak, 'Boleh' mengizinkan", async () => {
    const consent = createNetworkConsent();
    const el = mount(<AiConsentDialog consent={consent} />);
    expect(el.querySelector("[data-testid=ai-consent]")).toBeNull();
    let p!: Promise<boolean>;
    act(() => {
      p = consent.request("speech-recognition");
    });
    const dialog = el.querySelector("[role=alertdialog]");
    expect(dialog?.textContent).toContain("internet");
    expect(document.activeElement?.textContent).toBe("Jangan");
    act(() => dialog?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    await expect(p).resolves.toBe(false);
    act(() => {
      p = consent.request("speech-synthesis");
    });
    click(byText(el, "Boleh, untuk sesi ini"));
    await expect(p).resolves.toBe(true);
    expect(el.querySelector("[data-testid=ai-consent]")).toBeNull();
  });

  it("dialog dilepas saat menunggu -> permintaan ditolak", async () => {
    const consent = createNetworkConsent();
    mount(<AiConsentDialog consent={consent} />);
    let p!: Promise<boolean>;
    act(() => {
      p = consent.request("speech-recognition");
    });
    act(() => root?.unmount());
    root = null;
    await expect(p).resolves.toBe(false);
  });
});

describe("AI Lab (UI)", () => {
  it("lima tab; tab Teks: tambah contoh, latih, model tersimpan, uji dengan bar kepercayaan", async () => {
    const fake = createFakeRuntime();
    fakeServices(fake);
    const el = mount(<AiLab runtime={fake.runtime} initialTab="text" />);
    expect([...el.querySelectorAll("[role=tab]")].map((t) => t.textContent)).toEqual(["Gambar", "Pose Tubuh", "Gestur Tangan", "Suara", "Teks"]);
    const train = (): HTMLButtonElement => byText(el, "Latih model") as HTMLButtonElement;
    expect(train().disabled).toBe(true);
    expect(el.textContent).toContain("butuh minimal 3 contoh");
    const inputs = (): HTMLInputElement[] => [...el.querySelectorAll<HTMLInputElement>("input[placeholder='Tulis contoh kalimat']")];
    const add = (i: number, text: string): void => {
      type(inputs()[i]!, text);
      act(() => inputs()[i]!.form?.requestSubmit());
    };
    for (const t of ["aku senang", "hore asyik", "bahagia sekali"]) add(0, t);
    for (const t of ["aku sedih", "kecewa berat", "ingin menangis"]) add(1, t);
    expect(el.textContent).toContain("hore asyik");
    expect(train().disabled).toBe(false);
    await act(async () => {
      train().click();
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(el.textContent).toContain("Model siap dipakai di blok");
    const saved = fake.stage.getCustomState<TrainedClassifier>(TRAINED_STATE_KEYS.text);
    expect(TextClassifier.fromTrained(saved).labels).toEqual(["Kelas 1", "Kelas 2"]);
    const test = el.querySelector<HTMLInputElement>("input[placeholder='Ketik kalimat untuk diuji']")!;
    type(test, "senang sekali");
    expect(el.querySelector(".kal-top")?.textContent).toBe("Kelas 1");
    expect(el.querySelectorAll("[role=meter]")).toHaveLength(2);
  });

  it("label kelas berbahaya ditampilkan sebagai teks, bukan HTML", () => {
    const fake = createFakeRuntime();
    fakeServices(fake);
    const el = mount(<AiLab runtime={fake.runtime} initialTab="text" />);
    const name = el.querySelector<HTMLInputElement>("input[aria-label='Nama kelas']")!;
    type(name, "<img src=x onerror=alert(1)>");
    act(() => name.blur());
    expect(el.querySelector("img[src=x]")).toBeNull();
  });

  it("menutup dengan contoh yang belum dilatih meminta konfirmasi; menutup AI Lab mematikan perangkat", async () => {
    const fake = createFakeRuntime();
    const { services } = fakeServices(fake);
    let closed = 0;
    const el = mount(<AiLab runtime={fake.runtime} initialTab="text" onClose={() => closed++} />);
    const input = el.querySelector<HTMLInputElement>("input[placeholder='Tulis contoh kalimat']")!;
    type(input, "halo");
    act(() => input.form?.requestSubmit());
    click(byText(el, "Tutup"));
    expect(closed).toBe(0);
    expect(el.textContent).toContain("belum dilatih");
    click(byText(el, "Tutup saja"));
    expect(closed).toBe(1);
    await act(async () => {
      await services.ensureCamera("aiLab");
    });
    expect(services.camera.enabled).toBe(true);
    act(() => root?.unmount());
    root = null;
    expect(services.camera.enabled).toBe(false);
  });

  it("tab Gambar & Suara bisa dibuka tanpa kamera/mikrofon menyala", () => {
    const fake = createFakeRuntime();
    const { media } = fakeServices(fake);
    const el = mount(<AiLab runtime={fake.runtime} initialTab="image" />);
    expect(el.textContent).toContain("Nyalakan kamera");
    click([...el.querySelectorAll("[role=tab]")].find((t) => t.textContent === "Suara"));
    expect(el.textContent).toContain("Suara latar");
    expect(el.textContent).toContain("Rekam 5 detik");
    expect(media.requests).toHaveLength(0);
  });
});
