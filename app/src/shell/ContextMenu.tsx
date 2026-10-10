/** Menu konteks (klik kanan / tahan) seperti react-contextmenu di scratch-gui. */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type TouchEvent as ReactTouchEvent,
} from "react";
import { createPortal } from "react-dom";
import { useDismiss } from "./hooks";

export interface ContextMenuItem {
  key: string;
  label: string;
  onSelect: () => void;
  /** Garis pemisah di atas item (BorderedMenuItem). */
  bordered?: boolean;
  danger?: boolean;
}

export interface ContextMenuState {
  x: number;
  y: number;
}

interface ContextMenuProps {
  state: ContextMenuState | null;
  items: readonly ContextMenuItem[];
  onClose: () => void;
  label: string;
}

export function ContextMenu({ state, items, onClose, label }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, state !== null, onClose);
  useEffect(() => {
    if (state) ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [state]);
  if (!state || items.length === 0 || typeof document === "undefined") return null;
  const maxX = Math.max(0, (typeof window === "undefined" ? 9999 : window.innerWidth) - 180);
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = buttons[(i + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length];
    next?.focus();
  };
  return createPortal(
    <div
      ref={ref}
      className="kb-context-menu"
      role="menu"
      aria-label={label}
      style={{ left: Math.min(state.x, maxX), top: state.y }}
      onKeyDown={onKeyDown}
    >
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          role="menuitem"
          className={[
            "kb-context-menu__item",
            item.bordered ? "kb-context-menu__item--bordered" : "",
            item.danger ? "kb-context-menu__item--danger" : "",
          ].join(" ")}
          onClick={() => {
            onClose();
            item.onSelect();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}

/**
 * Pemicu menu konteks: klik kanan, atau tahan `holdMs` (sentuh). holdMs < 0 mematikan tahan
 * (scratch-gui: slider monitor holdToDisplay -1, lainnya 1000).
 */
export function useContextMenuTrigger(enabled: boolean, holdMs: number) {
  const [state, setState] = useState<ContextMenuState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = (): void => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);
  const onContextMenu = useCallback(
    (e: ReactMouseEvent) => {
      if (!enabled) return;
      e.preventDefault();
      setState({ x: e.clientX, y: e.clientY });
    },
    [enabled],
  );
  const onTouchStart = useCallback(
    (e: ReactTouchEvent) => {
      if (!enabled || holdMs < 0) return;
      const t = e.touches[0];
      if (!t) return;
      const pos = { x: t.clientX, y: t.clientY };
      clear();
      timer.current = setTimeout(() => setState(pos), holdMs);
    },
    [enabled, holdMs],
  );
  const close = useCallback(() => setState(null), []);
  return {
    state,
    close,
    triggerProps: { onContextMenu, onTouchStart, onTouchEnd: clear, onTouchMove: clear },
  };
}
