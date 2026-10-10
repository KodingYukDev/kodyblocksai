/**
 * Pendaftaran ekstensi ke runtime (padanan extension-manager + runtime._registerExtensionPrimitives).
 * Pemilik: agent engine-core (helper penamaan & validasi di bawah sudah final).
 */
import type { ExtensionInfo, ExtensionModule } from "./types/extension";
import type { HatMetadata, IRuntime, PrimitiveFn } from "./types/runtime";

/** Opcode penuh blok ekstensi: `${extensionId}_${opcode}`. */
export function extensionBlockOpcode(extensionId: string, opcode: string): string {
  return `${extensionId}_${opcode}`;
}

/** Opcode shadow menu ekstensi: `${extensionId}_menu_${menuName}`. */
export function extensionMenuOpcode(extensionId: string, menuName: string): string {
  return `${extensionId}_menu_${menuName}`;
}

/** Validasi ExtensionInfo; mengembalikan daftar masalah (kosong = valid). */
export function validateExtensionInfo(info: ExtensionInfo): string[] {
  const problems: string[] = [];
  if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(info.id)) problems.push(`id tidak valid: "${info.id}"`);
  const seen = new Set<string>();
  for (const block of info.blocks) {
    if (block === "---") continue;
    if (seen.has(block.opcode)) problems.push(`opcode ganda: ${block.opcode}`);
    seen.add(block.opcode);
    const text = Array.isArray(block.text) ? block.text.join(" ") : block.text;
    for (const m of text.matchAll(/\[([A-Za-z0-9_]+)\]/g)) {
      const name = m[1];
      if (name && !block.arguments?.[name]) problems.push(`${block.opcode}: argumen [${name}] tidak dideklarasikan`);
    }
    for (const [argName, arg] of Object.entries(block.arguments ?? {})) {
      if (arg.menu && !info.menus?.[arg.menu]) problems.push(`${block.opcode}.${argName}: menu "${arg.menu}" tidak ada`);
    }
  }
  return problems;
}

/** Permukaan runtime untuk mendaftarkan primitive/hat ekstensi (diimplementasikan Runtime engine-core). */
export interface ExtensionHost extends IRuntime {
  addPrimitive(opcode: string, fn: PrimitiveFn): void;
  addHat(opcode: string, meta: HatMetadata): void;
  addLoadedExtension(info: ExtensionInfo, module: ExtensionModule): void;
}

function isExtensionHost(runtime: IRuntime): runtime is ExtensionHost {
  const r = runtime as Partial<ExtensionHost>;
  return typeof r.addPrimitive === "function" && typeof r.addHat === "function";
}

/**
 * Daftarkan ekstensi persis runtime._fillExtensionCategory scratch-vm 4.8.102:
 * - opcode penuh `${id}_${opcode}`; blok "event" tidak punya primitive;
 * - blok "hat"/"event" didaftarkan sebagai hat; isEdgeActivated default TRUE bila tidak diisi;
 * - "button" tidak dieksekusi.
 * Menu (`${id}_menu_${menu}`) adalah shadow satu-field sehingga execute membaca nilainya langsung.
 * Melempar Error bila ExtensionInfo tidak valid.
 */
export function registerExtensionInto(runtime: IRuntime, module: ExtensionModule): ExtensionInfo {
  if (!isExtensionHost(runtime)) throw new Error("registerExtensionInto: runtime bukan Runtime engine-core");
  const info = module.getInfo();
  const problems = validateExtensionInfo(info);
  if (problems.length > 0) throw new Error(`Ekstensi "${info.id}" tidak valid: ${problems.join("; ")}`);
  const primitives = module.getPrimitives();
  for (const block of info.blocks) {
    if (block === "---" || block.blockType === "button") continue;
    const opcode = extensionBlockOpcode(info.id, block.opcode);
    if (block.blockType !== "event") {
      const fn = primitives[block.func ?? block.opcode] ?? primitives[block.opcode];
      if (fn) runtime.addPrimitive(opcode, fn.bind(module));
    }
    if (block.blockType === "event" || block.blockType === "hat") {
      runtime.addHat(opcode, {
        edgeActivated: block.isEdgeActivated ?? true,
        restartExistingThreads: block.shouldRestartExistingThreads ?? false,
      });
    }
  }
  // Metadata hat tambahan dari modul (opcode tanpa prefix).
  const hats = module.getHats?.() ?? {};
  for (const name in hats) {
    const meta = hats[name];
    if (meta) runtime.addHat(extensionBlockOpcode(info.id, name), meta);
  }
  runtime.addLoadedExtension(info, module);
  return info;
}
