/**
 * Daftar vertikal costume/sound ala scratch-gui SelectorHOC + SortableHOC: tile bernomor dengan
 * thumbnail, tombol hapus di tile terpilih, menu klik-kanan (duplikat/ekspor/hapus), seret untuk
 * mengurutkan, dan Alt+Panah untuk mengurutkan dengan keyboard.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconClose } from "./icons";
import type { TabStrings } from "./strings";

export interface AssetListItem {
  key: string;
  name: string;
  detail?: string | null;
  thumbUrl?: string | null;
  icon?: ReactNode;
}

export interface AssetListProps {
  items: readonly AssetListItem[];
  selectedIndex: number;
  strings: TabStrings;
  ariaLabel: string;
  onSelect(index: number): void;
  onDuplicate(index: number): void;
  onDelete(index: number): void;
  onExport?(index: number): void;
  onReorder(from: number, to: number): void;
  /** Tombol tambah bulat di bawah daftar. */
  addMenu: ReactNode;
}

interface MenuState {
  index: number;
  x: number;
  y: number;
}

export function AssetList(props: AssetListProps) {
  const { items, selectedIndex, strings: t } = props;
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (): void => setMenu(null);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", close);
    };
  }, [menu]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${selectedIndex}"]`);
    if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, items.length]);

  const onKey = (e: React.KeyboardEvent, i: number): void => {
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      const to = e.key === "ArrowUp" ? i - 1 : i + 1;
      if (to >= 0 && to < items.length) props.onReorder(i, to);
      return;
    }
    if (e.key === "ArrowUp" && i > 0) {
      e.preventDefault();
      props.onSelect(i - 1);
    } else if (e.key === "ArrowDown" && i < items.length - 1) {
      e.preventDefault();
      props.onSelect(i + 1);
    } else if (e.key === "Delete") {
      e.preventDefault();
      props.onDelete(i);
    } else if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
      e.preventDefault();
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setMenu({ index: i, x: r.right, y: r.top });
    }
  };

  return (
    <div className="kb-assetlist">
      <ol className="kb-assetlist__items" ref={listRef} aria-label={props.ariaLabel} role="listbox">
        {items.map((item, i) => (
          <li
            key={item.key}
            data-index={i}
            role="option"
            aria-selected={i === selectedIndex}
            tabIndex={i === selectedIndex ? 0 : -1}
            className={
              "kb-assetlist__tile" +
              (i === selectedIndex ? " kb-assetlist__tile--selected" : "") +
              (dropAt === i && dragFrom !== null && dragFrom !== i ? " kb-assetlist__tile--drop" : "")
            }
            draggable
            onClick={() => props.onSelect(i)}
            onKeyDown={(e) => onKey(e, i)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ index: i, x: e.clientX, y: e.clientY });
            }}
            onDragStart={(e) => {
              setDragFrom(i);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", String(i));
            }}
            onDragOver={(e) => {
              if (dragFrom === null) return;
              e.preventDefault();
              setDropAt(i);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragFrom !== null && dragFrom !== i) props.onReorder(dragFrom, i);
              setDragFrom(null);
              setDropAt(null);
            }}
            onDragEnd={() => {
              setDragFrom(null);
              setDropAt(null);
            }}
          >
            <span className="kb-assetlist__number">{i + 1}</span>
            <span className="kb-assetlist__thumb">
              {item.thumbUrl ? <img src={item.thumbUrl} alt="" draggable={false} /> : item.icon}
            </span>
            <span className="kb-assetlist__name" title={item.name}>
              {item.name}
            </span>
            {item.detail ? <span className="kb-assetlist__detail">{item.detail}</span> : null}
            {i === selectedIndex ? (
              <button
                type="button"
                className="kb-assetlist__delete"
                aria-label={`${t.delete} ${item.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  props.onDelete(i);
                }}
              >
                <IconClose />
              </button>
            ) : null}
          </li>
        ))}
      </ol>
      <div className="kb-assetlist__add">{props.addMenu}</div>
      {menu ? (
        <ul className="kb-contextmenu" role="menu" style={{ left: menu.x, top: menu.y }} onPointerDown={(e) => e.stopPropagation()}>
          <li role="none">
            <button type="button" role="menuitem" onClick={() => (props.onDuplicate(menu.index), setMenu(null))}>
              {t.duplicate}
            </button>
          </li>
          {props.onExport ? (
            <li role="none">
              <button type="button" role="menuitem" onClick={() => (props.onExport?.(menu.index), setMenu(null))}>
                {t.export}
              </button>
            </li>
          ) : null}
          <li role="none">
            <button type="button" role="menuitem" className="kb-contextmenu__danger" onClick={() => (props.onDelete(menu.index), setMenu(null))}>
              {t.delete}
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  );
}
