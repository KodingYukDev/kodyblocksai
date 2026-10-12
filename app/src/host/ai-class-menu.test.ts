/**
 * Integrasi AI Lab -> menu kelas di blok: setelah model dilatih/dimuat, dropdown kelas di registri
 * blok langsung berisi nama kelas baru (tanpa memuat ulang ekstensi/halaman). Pemilik: agent ai.
 */
import { describe, expect, it } from "vitest";
import { createRuntime } from "@kody/engine";
import type { IMediaLoader } from "@kody/engine";
import { createDefaultProject } from "@kody/project";
import { getDefaultRegistry } from "@kody/blocks-ui/blocks/registry";
import { configureAiServices } from "@kody/ai";
import { LabSession } from "@kody/ai/lab/lab-session";
import { ExtensionHost } from "./extensions";

function classOptions(opcode: string): string[] {
  const json = getDefaultRegistry().get(opcode) as { args0?: { options?: [string, string][] }[] } | undefined;
  return (json?.args0?.[0]?.options ?? []).map(([, value]) => value);
}

describe("menu kelas AI diperbarui tanpa memuat ulang", () => {
  it("melatih di AI Lab memperbarui menu kelas aiText; editor menerima BLOCKSINFO_UPDATE setelah registri", async () => {
    const runtime = createRuntime({ autoStart: false });
    configureAiServices(runtime, { visibility: null, speech: { ctor: null }, tts: { synth: null } });
    const host = new ExtensionHost(runtime);
    await host.load("aiText");
    const media: IMediaLoader = {
      loadCostume: (c, asset) => Promise.resolve({ ...c, skinId: -1, size: [1, 1], asset }),
      loadSound: (s, asset) => Promise.resolve({ ...s, soundId: s.assetId, asset }),
    };
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>';
    const project = createDefaultProject(svg);
    await runtime.loadProject(project.model, media, project.assets);
    expect(classOptions("aiText_menu_CLASS")).toEqual([""]);
    // Editor (listener yang dipasang belakangan) harus melihat registri yang sudah diperbarui.
    const seenByEditor: string[][] = [];
    runtime.on("BLOCKSINFO_UPDATE", () => seenByEditor.push(classOptions("aiText_menu_CLASS")));

    const session = new LabSession(runtime, "text", { yieldFn: async () => {} });
    const [a, b] = session.classes;
    session.renameClass(a!.id, "senang");
    session.renameClass(b!.id, "sedih");
    for (const t of ["aku senang", "hore", "asyik"]) session.addSample(a!.id, { text: t });
    for (const t of ["aku sedih", "kecewa", "menangis"]) session.addSample(b!.id, { text: t });
    expect(await session.train()).toBe(true);

    expect(classOptions("aiText_menu_CLASS")).toEqual(["senang", "sedih"]);
    expect(seenByEditor.at(-1)).toEqual(["senang", "sedih"]);

    session.resetAll();
    expect(classOptions("aiText_menu_CLASS")).toEqual([""]);
    host.dispose();
  });
});
