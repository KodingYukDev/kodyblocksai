import { describe, expect, it, vi } from "vitest";
import { createRuntime } from "@kody/engine";
import { getDefaultRegistry } from "@kody/blocks-ui/blocks/registry";
import { getPenInfo } from "@kody/ext-pen";
import { APP_EXTENSIONS, ExtensionHost, extensionCategory } from "./extensions";

describe("katalog ekstensi app", () => {
  it("berisi pen, music (id Scratch) dan 7 ekstensi AI", () => {
    expect(APP_EXTENSIONS.map((e) => e.id)).toEqual(["pen", "music", "aiFace", "aiHand", "aiPose", "aiImage", "aiObject", "aiText", "aiAudio"]);
  });

  it("kategori toolbox memakai warna & ikon ekstensi, blok berprefix id", () => {
    const cat = extensionCategory(getPenInfo("id"), false);
    expect(cat.id).toBe("pen");
    expect(cat.colours.primary).toBe("#0FBD8C");
    expect(cat.iconURI).toMatch(/^data:image\//);
    const ops = cat.blocks.flatMap((b) => ("opcode" in b ? [b.opcode] : []));
    expect(ops).toContain("pen_clear");
    expect(ops).toContain("pen_setPenColorToColor");
    expect(ops.every((o) => o.startsWith("pen_"))).toBe(true);
  });
});

describe("ExtensionHost", () => {
  it("memuat pen: registri blok dulu, lalu runtime (EXTENSION_ADDED)", async () => {
    const runtime = createRuntime({ autoStart: false });
    const host = new ExtensionHost(runtime);
    const seen: boolean[] = [];
    runtime.on("EXTENSION_ADDED", () => seen.push(getDefaultRegistry().has("pen_clear")));
    const listener = vi.fn();
    host.subscribe(listener);
    const info = await host.load("pen");
    expect(info.id).toBe("pen");
    expect(runtime.isExtensionLoaded("pen")).toBe(true);
    expect(runtime.getOpcodeFunction("pen_clear")).toBeTypeOf("function");
    expect(seen).toEqual([true]);
    expect(listener).toHaveBeenCalledTimes(1);
    // Memuat ulang tidak mendaftarkan dua kali.
    await host.load("pen");
    expect(seen.length).toBe(1);
    expect(host.categories(false).map((c) => c.id)).toEqual(["pen"]);
    host.dispose();
  });

  it("id tak dikenal ditolak (tidak ada URL ekstensi dari project)", async () => {
    const host = new ExtensionHost(createRuntime({ autoStart: false }));
    await expect(host.load("https://evil.example/ext.js")).rejects.toThrow(/tidak dikenal/);
    expect(await host.loadForProject(["pen", "wedo2"])).toEqual(["wedo2"]);
    expect(host.isLoaded("pen")).toBe(true);
  });
});
