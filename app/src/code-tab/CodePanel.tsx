/**
 * Tab Kode: workspace blok + tombol "Tambah Ekstensi" (kiri bawah, seperti scratch-gui) + AI Lab.
 * Toolbox = toolbox default (nilai dropdown dari target, seperti blocks.jsx getToolboxXML) + kategori ekstensi.
 */
import { lazy, Suspense, useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { IRuntime, ITarget } from "@kody/engine";
import { BlocksEditor, makeDefaultToolbox } from "@kody/blocks-ui";
import type { WorkspaceExtras } from "@kody/blocks-ui/workspace/index";
import { APP_EXTENSIONS, type ExtensionHost } from "../host/extensions";
import { ExtensionLibrary } from "./ExtensionLibrary";
import "./code-tab.css";

const AiLab = lazy(() => import("@kody/ai/lab/AiLab"));

export interface CodePanelProps {
  runtime: IRuntime;
  extensions: ExtensionHost;
  targetId: string | null;
  locale: "id" | "en";
  notify(level: "info" | "success" | "warning" | "error", message: string): void;
}

/** Nama default dropdown toolbox (scratch-gui blocks.jsx). */
export function toolboxDefaults(runtime: IRuntime, target: ITarget | null) {
  const stage = runtime.getTargetForStage();
  const tc = target?.getCostumes() ?? [];
  const sc = stage?.getCostumes() ?? [];
  const ts = target?.getSounds() ?? [];
  return {
    costumeName: tc[tc.length > 1 ? 1 : 0]?.name ?? "",
    backdropName: sc[sc.length > 1 ? 1 : 0]?.name ?? "",
    soundName: ts.length > 0 ? (ts[ts.length - 1]?.name ?? "") : "",
    x: target?.x ?? 0,
    y: target?.y ?? 0,
  };
}

export function CodePanel({ runtime, extensions, targetId, locale, notify }: CodePanelProps) {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [labOpen, setLabOpen] = useState(false);
  const localeRef = useRef(locale);
  localeRef.current = locale;
  const loadedKey = useSyncExternalStore(
    useCallback((l: () => void) => extensions.subscribe(l), [extensions]),
    () => extensions.loadedIds().join(","),
  );

  const extras = useMemo<WorkspaceExtras>(
    () => ({
      toolbox: (isStage, id) => {
        const target = (id ? runtime.getTargetById(id) : runtime.getEditingTarget()) ?? null;
        return [
          ...makeDefaultToolbox(isStage, id, { ...toolboxDefaults(runtime, target), locale: localeRef.current }),
          ...extensions.categories(isStage),
        ];
      },
    }),
    [runtime, extensions],
  );

  const addExtension = (id: string): void => {
    setLibraryOpen(false);
    extensions.load(id).then(
      (info) => notify("success", locale === "en" ? `Extension "${info.name}" added` : `Ekstensi "${info.name}" ditambahkan`),
      (e: unknown) => notify("error", e instanceof Error ? e.message : String(e)),
    );
  };

  return (
    <div className="kb-code-panel" data-extensions={loadedKey}>
      <BlocksEditor runtime={runtime} targetId={targetId} locale={locale} initialScale={0.675} extras={extras} />
      <div className="kb-code-panel__actions">
        <button
          type="button"
          className="kb-code-panel__ext"
          title={locale === "en" ? "Add Extension" : "Tambah Ekstensi"}
          aria-label={locale === "en" ? "Add Extension" : "Tambah Ekstensi"}
          onClick={() => setLibraryOpen(true)}
        >
          <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
            <rect x="3" y="3" width="8" height="8" rx="2" fill="#fff" />
            <rect x="13" y="3" width="8" height="8" rx="2" fill="#fff" opacity=".7" />
            <rect x="3" y="13" width="8" height="8" rx="2" fill="#fff" opacity=".7" />
            <path d="M17 13v8M13 17h8" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </button>
        <button type="button" className="kb-code-panel__lab" onClick={() => setLabOpen(true)}>
          AI Lab
        </button>
      </div>
      {libraryOpen ? (
        <ExtensionLibrary
          entries={APP_EXTENSIONS}
          isLoaded={(id) => extensions.isLoaded(id)}
          onSelect={addExtension}
          onClose={() => setLibraryOpen(false)}
          locale={locale}
        />
      ) : null}
      {labOpen ? (
        <div className="kb-ailab" role="dialog" aria-modal="true" aria-label="AI Lab">
          <div className="kb-ailab__box">
            <Suspense fallback={<div className="kb-ailab__loading">Memuat AI Lab...</div>}>
              <AiLab runtime={runtime} onClose={() => setLabOpen(false)} />
            </Suspense>
          </div>
        </div>
      ) : null}
    </div>
  );
}
