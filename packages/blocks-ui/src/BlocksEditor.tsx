/**
 * Komponen React pembungkus workspace blok (padanan containers/blocks.jsx scratch-gui).
 * Workspace dibuat sekali per runtime; ganti target/locale diteruskan tanpa membuat ulang.
 */
import { useEffect, useRef } from "react";
import type { BlocksEditorProps, WorkspaceController } from "./types";
import { createWorkspace, type WorkspaceExtras } from "./workspace/index";

export interface BlocksEditorComponentProps extends BlocksEditorProps {
  extras?: WorkspaceExtras;
  /** Akses kontroler imperatif (undo, clean up, refresh toolbox). */
  onWorkspace?: (ws: (WorkspaceController & { setLocale(l: "id" | "en"): void; reload(id?: string | null): void }) | null) => void;
  className?: string;
}

export function BlocksEditor(props: BlocksEditorComponentProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<ReturnType<typeof createWorkspace> | null>(null);
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const p = latest.current;
    const ws = createWorkspace(host, p, p.extras);
    wsRef.current = ws;
    p.onWorkspace?.(ws);
    return () => {
      latest.current.onWorkspace?.(null);
      ws.dispose();
      wsRef.current = null;
    };
    // Workspace hanya dibuat ulang bila runtime berganti.
  }, [props.runtime]);

  useEffect(() => {
    wsRef.current?.setLocale(props.locale);
  }, [props.locale]);

  useEffect(() => {
    const ws = wsRef.current;
    if (ws && props.targetId !== undefined && props.targetId !== (ws as unknown as { target: { id: string } | null }).target?.id) {
      ws.reload(props.targetId);
    }
  }, [props.targetId]);

  return <div ref={hostRef} className={props.className ?? "kb-blocks-editor"} data-locale={props.locale} style={{ position: "relative", width: "100%", height: "100%" }} />;
}
