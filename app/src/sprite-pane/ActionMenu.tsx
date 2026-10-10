/** Tombol aksi bulat yang membuka sub-tombol saat disorot (scratch-gui action-menu). */
import { useRef, useState, type ReactNode } from "react";
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
      className={`kb-action-menu${open ? " kb-action-menu--open" : ""} ${className ?? ""}`}
      onMouseEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
      onFocus={() => {
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
        onClick={() => run(main.method)}
      >
        {main.icon}
      </button>
    </div>
  );
}
