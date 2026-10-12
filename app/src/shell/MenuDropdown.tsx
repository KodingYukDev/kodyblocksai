/** Menu tarik-turun di menu bar (gaya scratch-gui menu-bar: kotak biru tua di bawah item). */
import { useCallback, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useDismiss } from "./hooks";
import { CaretIcon } from "./icons";

export interface DropdownItem {
  key: string;
  label: ReactNode;
  onSelect: () => void;
  checked?: boolean;
  /** Garis pemisah di atas item. */
  separatorBefore?: boolean;
  disabled?: boolean;
}

interface MenuDropdownProps {
  label: ReactNode;
  icon?: ReactNode;
  items: readonly DropdownItem[];
  /** Nama untuk pembaca layar bila label hanya ikon. */
  ariaLabel?: string;
  /** Tonjolkan menu (mis. "Belajar AI"). */
  highlight?: boolean;
}

export function MenuDropdown({ label, icon, items, ariaLabel, highlight }: MenuDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  const focusItem = (delta: number): void => {
    const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]:not(:disabled), [role=menuitemradio]:not(:disabled), [role=menuitemcheckbox]:not(:disabled)") ?? [])];
    if (buttons.length === 0) return;
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = i < 0 ? (delta > 0 ? 0 : buttons.length - 1) : (i + delta + buttons.length) % buttons.length;
    buttons[next]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      requestAnimationFrame(() => focusItem(1));
    } else if (e.key === "ArrowUp" && open) {
      e.preventDefault();
      focusItem(-1);
    } else if (e.key === "Escape" && open) {
      setOpen(false);
      ref.current?.querySelector<HTMLButtonElement>(".kb-menu-bar__item")?.focus();
    }
  };

  return (
    <div className="kb-menu-dropdown" ref={ref} onKeyDown={onKeyDown}>
      <button
        type="button"
        className={`kb-menu-bar__item${open ? " kb-menu-bar__item--open" : ""}${highlight ? " kb-menu-bar__item--highlight" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
      >
        {icon}
        {label !== null && label !== undefined && <span className="kb-menu-bar__label">{label}</span>}
        <CaretIcon className="kb-menu-bar__caret" />
      </button>
      {open && (
        <div className="kb-menu" role="menu" id={menuId}>
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role={item.checked === undefined ? "menuitem" : "menuitemcheckbox"}
              aria-checked={item.checked}
              disabled={item.disabled}
              className={`kb-menu__item${item.separatorBefore ? " kb-menu__item--separator" : ""}`}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              <span className="kb-menu__check" aria-hidden="true">
                {item.checked ? "✓" : ""}
              </span>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
