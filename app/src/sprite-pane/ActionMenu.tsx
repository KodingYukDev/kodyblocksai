/** Tombol aksi bulat yang membuka sub-tombol saat disorot (scratch-gui action-menu). */
import { useCallback, useRef, useState, type ReactNode } from "react";
import { useDismiss } from "../shell/hooks";
import type { AddMethod } from "../shell/types";

export interface ActionItem {
  method: AddMethod;
  title: string;
  icon: ReactNode;
}

interface ActionMenuProps {
  /** Aksi utama (tombol besar). */
  main: ActionItem;
  /** Aksi tambahan, ditampilkan dari atas ke bawah. */
  more: readonly ActionItem[];
  className?: string;
  onAction(method: AddMethod): void;
}

const CLOSE_DELAY_MS = 120;

export function ActionMenu({ main, more, className, onAction }: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const root = useRef<HTMLDivElement>(null);
  /** Jenis penunjuk terakhir yang menekan tombol utama (sentuh tidak punya "hover"). */
  const lastPointer = useRef<string>("mouse");
  const pointerDownAt = useRef(0);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(root, open, close);
  const cancelClose = (): void => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  const scheduleClose = (): void => {
    cancelClose();
    timer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  };
  const run = (method: AddMethod): void => {
    setOpen(false);
    onAction(method);
  };
  return (
    <div
      ref={root}
      className={`kb-action-menu${open ? " kb-action-menu--open" : ""} ${className ?? ""}`}
      onPointerEnter={(e) => {
        if (e.pointerType !== "mouse") return;
        cancelClose();
        setOpen(true);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") scheduleClose();
      }}
      onFocus={() => {
        // Fokus akibat ketukan sentuh ditangani onClick (agar ketukan pertama tidak langsung menjalankan aksi).
        if (lastPointer.current !== "mouse" && Date.now() - pointerDownAt.current < 800) return;
        cancelClose();
        setOpen(true);
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) scheduleClose();
      }}
    >
      <div className="kb-action-menu__more" aria-hidden={!open}>
        {more.map((item, i) => (
          <button
            key={`${item.method}-${i}`}
            type="button"
            className="kb-action-menu__button kb-action-menu__button--small"
            aria-label={item.title}
            title={item.title}
            tabIndex={open ? 0 : -1}
            onClick={() => run(item.method)}
          >
            {item.icon}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="kb-action-menu__button kb-action-menu__button--main"
        aria-label={main.title}
        title={main.title}
        aria-expanded={open}
        onPointerDown={(e) => {
          lastPointer.current = e.pointerType;
          pointerDownAt.current = Date.now();
        }}
        onClick={() => {
          // Sentuh: ketukan pertama membuka pilihan (tidak ada hover), ketukan kedua menjalankan aksi utama.
          if (lastPointer.current !== "mouse" && !open) {
            cancelClose();
            setOpen(true);
            return;
          }
          run(main.method);
        }}
      >
        {main.icon}
      </button>
    </div>
  );
}
