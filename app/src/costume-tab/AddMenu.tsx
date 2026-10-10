/**
 * Tombol tambah bulat ala scratch-gui ActionMenu: klik utama = aksi pertama (pustaka), arahkan
 * kursor / fokus untuk membuka pilihan lain (gambar, unggah, kamera, kejutan, rekam).
 */
import { useId, useRef, useState, type ReactNode } from "react";

export interface AddMenuItem {
  key: string;
  title: string;
  icon: ReactNode;
  onClick?(): void;
  /** Pilihan unggah: atribut accept & multiple untuk <input type=file>. */
  fileAccept?: string;
  fileMultiple?: boolean;
  onFiles?(files: FileList): void;
}

export interface AddMenuProps {
  main: AddMenuItem;
  items: readonly AddMenuItem[];
  className?: string;
}

export function AddMenu({ main, items, className }: AddMenuProps) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const menuId = useId();

  const cancelClose = (): void => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const scheduleClose = (): void => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), 250);
  };

  return (
    <div
      className={`kb-addmenu${open ? " kb-addmenu--open" : ""}${className ? ` ${className}` : ""}`}
      onPointerEnter={() => (cancelClose(), setOpen(true))}
      onPointerLeave={scheduleClose}
      onFocus={() => (cancelClose(), setOpen(true))}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) scheduleClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      {open ? (
        <ul className="kb-addmenu__list" id={menuId} role="menu">
          {items.map((item) => (
            <li key={item.key} role="none">
              <MenuButton item={item} onDone={() => setOpen(false)} />
            </li>
          ))}
        </ul>
      ) : null}
      <button
        type="button"
        className="kb-addmenu__main"
        aria-label={main.title}
        title={main.title}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          setOpen(false);
          main.onClick?.();
        }}
      >
        {main.icon}
      </button>
    </div>
  );
}

function MenuButton({ item, onDone }: { item: AddMenuItem; onDone(): void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        role="menuitem"
        className="kb-addmenu__item"
        title={item.title}
        aria-label={item.title}
        onClick={() => {
          if (item.onFiles) input.current?.click();
          else {
            onDone();
            item.onClick?.();
          }
        }}
      >
        {item.icon}
        <span className="kb-addmenu__tooltip">{item.title}</span>
      </button>
      {item.onFiles ? (
        <input
          ref={input}
          type="file"
          hidden
          accept={item.fileAccept}
          multiple={item.fileMultiple}
          onChange={(e) => {
            const files = e.currentTarget.files;
            if (files && files.length) item.onFiles?.(files);
            e.currentTarget.value = "";
            onDone();
          }}
        />
      ) : null}
    </>
  );
}
