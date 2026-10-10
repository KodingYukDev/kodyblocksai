/**
 * ProjectIO untuk runtime-controller: .sb3 <-> ProjectModel lewat @kody/project, project default (Kody),
 * dan memuat ekstensi yang dipakai project SEBELUM loadProject (runtime butuh primitive-nya terdaftar).
 */
import type { ProjectModel } from "@kody/engine";
import { createDefaultProject, loadSb3, saveSb3, type LoadedProject } from "@kody/project";
import type { LoadedProjectLike, ProjectIO } from "../shell/runtime-controller";
import type { ExtensionHost } from "./extensions";

export interface ProjectIODeps {
  extensions: ExtensionHost;
  /** Teks SVG maskot Kody untuk costume default. */
  kodySvg: string;
  locale?: "id" | "en";
  onWarnings?: (warnings: readonly string[]) => void;
}

function toLike(p: LoadedProject): LoadedProjectLike {
  return { model: p.model, assets: p.assets };
}

export function createProjectIO(deps: ProjectIODeps): ProjectIO {
  return {
    async loadSb3(bytes: Uint8Array) {
      const loaded = await loadSb3(bytes);
      const unknown = await deps.extensions.loadForProject(loaded.model.extensions);
      const warnings = [...loaded.warnings, ...unknown.map((id) => `Ekstensi tidak dikenal: ${id}`)];
      if (warnings.length) deps.onWarnings?.(warnings);
      return toLike(loaded);
    },
    async saveSb3(model: ProjectModel, assets: Map<string, Uint8Array>) {
      return saveSb3(model, assets);
    },
    defaultProject() {
      return toLike(createDefaultProject(deps.kodySvg, { locale: deps.locale ?? "id" }));
    },
  };
}
