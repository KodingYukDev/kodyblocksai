/**
 * Tab Kode: workspace blok + tombol "Tambah Ekstensi" (kiri bawah, seperti scratch-gui) + AI Lab.
 * Toolbox = toolbox default (nilai dropdown dari target, seperti blocks.jsx getToolboxXML) + kategori ekstensi.
 * Seret skrip ke sprite/panggung di daftar sprite = salin skrip ke sana (target-pane.jsx handleBlockDragEnd).
 */
import { lazy, Suspense, useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Block, IRuntime, ITarget } from "@kody/engine";
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

/** Bagian workspace yang dipakai panel ini (lihat BlocksWorkspace). */
interface WorkspaceHandle {
  refreshToolbox?(): void;
  shareBlocks?(blocks: Block[], targetId: string): number;
  readonly target?: ITarget | null;
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

const DROP_HOVER = "kb-drop-hover";

/** Elemen sprite/panggung (data-target-id) di bawah titik layar, kecuali target yang sedang diedit. */
export function dropTargetAt(doc: Document, clientX: number, clientY: number, editingId: string | null): HTMLElement | null {
  const el = typeof doc.elementFromPoint === "function" ? doc.elementFromPoint(clientX, clientY) : null;
  const hit = el?.closest<HTMLElement>("[data-target-id]") ?? null;
  const id = hit?.getAttribute("data-target-id");
  return hit && id && id !== editingId ? hit : null;
}

export function CodePanel({ runtime, extensions, targetId, locale, notify }: CodePanelProps) {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [labOpen, setLabOpen] = useState(false);
  const localeRef = useRef(locale);
  localeRef.current = locale;
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const wsRef = useRef<WorkspaceHandle | null>(null);
  const hoverRef = useRef<HTMLElement | null>(null);
  const loadedKey = useSyncExternalStore(
    useCallback((l: () => void) => extensions.subscribe(l), [extensions]),
    () => extensions.loadedIds().join(","),
  );

  const setHover = (el: HTMLElement | null): void => {
    if (hoverRef.current === el) return;
    hoverRef.current?.classList.remove(DROP_HOVER);
    el?.classList.add(DROP_HOVER);
    hoverRef.current = el;
  };

  const extras = useMemo<WorkspaceExtras>(
    () => ({
      toolbox: (isStage, id) => {
        const target = (id ? runtime.getTargetById(id) : runtime.getEditingTarget()) ?? null;
        return [
          ...makeDefaultToolbox(isStage, id, { ...toolboxDefaults(runtime, target), locale: localeRef.current }),
          ...extensions.categories(isStage),
        ];
      },
      onDragOver: (p) => {
        const editing = wsRef.current?.target?.id ?? null;
        setHover(p && p.outside ? dropTargetAt(document, p.clientX, p.clientY, editing) : null);
      },
      onDropOutside: (blocks, clientX, clientY) => {
        const ws = wsRef.current;
        const hit = dropTargetAt(document, clientX, clientY, ws?.target?.id ?? null);
        setHover(null);
        const id = hit?.getAttribute("data-target-id");
        if (!ws?.shareBlocks || !hit || !id) return;
        try {
          if (ws.shareBlocks(blocks, id) > 0) {
            // Animasi kecil di sprite penerima (scratch-gui: onReceivedBlocks).
            hit.classList.add("kb-drop-received");
            window.setTimeout(() => hit.classList.remove("kb-drop-received"), 600);
            const name = runtime.getTargetById(id)?.getName() ?? "";
            notifyRef.current("success", localeRef.current === "en" ? `Script copied to ${name}` : `Skrip disalin ke ${name}`);
          }
        } catch (e) {
          notifyRef.current("error", e instanceof Error ? e.message : String(e));
        }
      },
    }),
    [runtime, extensions],
  );

  const closeLab = useCallback((): void => {
    setLabOpen(false);
    // Kelas AI baru dari latihan harus muncul di dropdown blok & palet.
    wsRef.current?.refreshToolbox?.();
  }, []);

  const addExtension = (id: string): void => {
    setLibraryOpen(false);
    extensions.load(id).then(
      (info) => notify("success", locale === "en" ? `Extension "${info.name}" added` : `Ekstensi "${info.name}" ditambahkan`),
      (e: unknown) => notify("error", e instanceof Error ? e.message : String(e)),
    );
  };

  const L = (id: string, en: string): string => (locale === "en" ? en : id);

  return (
    <div className="kb-code-panel" data-extensions={loadedKey}>
      <BlocksEditor
        runtime={runtime}
        targetId={targetId}
        locale={locale}
        initialScale={0.675}
        extras={extras}
        onWorkspace={(ws) => {
          wsRef.current = ws as unknown as WorkspaceHandle | null;
        }}
      />
      <div className="kb-code-panel__actions">
        <button
          type="button"
          className="kb-code-panel__ext"
          title={L("Tambah Ekstensi", "Add Extension")}
          aria-label={L("Tambah Ekstensi", "Add Extension")}
          onClick={() => setLibraryOpen(true)}
        >
          <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
            <rect x="3" y="3" width="8" height="8" rx="2" fill="#fff" />
            <rect x="13" y="3" width="8" height="8" rx="2" fill="#fff" opacity=".7" />
            <rect x="3" y="13" width="8" height="8" rx="2" fill="#fff" opacity=".7" />
            <path d="M17 13v8M13 17h8" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </button>
        <button
          type="button"
          className="kb-code-panel__lab"
          title={L("AI Lab: latih AI-mu sendiri", "AI Lab: train your own AI")}
          aria-label={L("Buka AI Lab untuk melatih AI", "Open AI Lab to train AI")}
          onClick={() => setLabOpen(true)}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <circle cx="12" cy="12" r="3.2" fill="#fff" />
            <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <span>AI Lab</span>
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
        <div
          className="kb-ailab"
          role="dialog"
          aria-modal="true"
          aria-label="AI Lab"
        >
          <div className="kb-ailab__box">
            <Suspense fallback={<div className="kb-ailab__loading">{L("Memuat AI Lab...", "Loading AI Lab...")}</div>}>
              <AiLab runtime={runtime} onClose={closeLab} />
            </Suspense>
          </div>
        </div>
      ) : null}
    </div>
  );
}
