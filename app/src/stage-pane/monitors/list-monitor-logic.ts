/**
 * Logika monitor list (edit item, navigasi keyboard, ukuran, virtualisasi, impor/ekspor).
 * Port perilaku scratch-gui containers/list-monitor.jsx & list-monitor-scroller.jsx. Lihat THIRD_PARTY.md.
 */
import type { ScratchValue } from "@kody/engine";

export const LIST_ROW_HEIGHT = 24;
/** Tinggi header + footer (perkiraan scratch-gui). */
export const LIST_CHROME_HEIGHT = 44;
export const LIST_DEFAULT_WIDTH = 100;
export const LIST_DEFAULT_HEIGHT = 200;

export interface ListEditState {
  activeIndex: number | null;
  activeValue: string | null;
}

export const LIST_EDIT_IDLE: ListEditState = { activeIndex: null, activeValue: null };

export function wrapListIndex(index: number, length: number): number {
  return (index + length) % length;
}

/** Ukuran awal: width/height 0 dari project = default (props.width || 100). */
export function initialListSize(width: number, height: number): { width: number; height: number } {
  return { width: width || LIST_DEFAULT_WIDTH, height: height || LIST_DEFAULT_HEIGHT };
}

/** Batas resize handleResizeMouseDown. */
export function clampListSize(width: number, height: number): { width: number; height: number } {
  return {
    width: Math.max(Math.min(width, 480), 100),
    height: Math.max(Math.min(height, 360), 60),
  };
}

/** handleDeactivate: tulis nilai yang sedang diedit ke list (salinan). null = tidak ada perubahan. */
export function commitEdit(list: readonly ScratchValue[], edit: ListEditState): ScratchValue[] | null {
  if (edit.activeIndex === null) return null;
  const next = list.slice();
  next[edit.activeIndex] = edit.activeValue ?? "";
  return next;
}

export interface ListKeyResult {
  /** List baru yang harus ditulis ke variabel (null = tidak berubah). */
  list: ScratchValue[] | null;
  edit: ListEditState;
  preventDefault: boolean;
  handled: boolean;
}

/**
 * handleKeyPress: Tab/Shift+Tab & panah atas/bawah berpindah item (melingkar),
 * Enter / Shift+Enter menyisipkan item kosong di bawah / di atas. Edit berjalan disimpan dulu.
 */
export function handleListKey(
  list: readonly ScratchValue[],
  edit: ListEditState,
  key: string,
  shiftKey: boolean,
): ListKeyResult {
  const prev = edit.activeIndex;
  if (prev === null) return { list: null, edit, preventDefault: false, handled: false };
  let dir = 0;
  if (key === "Tab") dir = shiftKey ? -1 : 1;
  else if (key === "ArrowUp") dir = -1;
  else if (key === "ArrowDown") dir = 1;
  if (dir) {
    const committed = commitEdit(list, edit) ?? list.slice();
    const idx = wrapListIndex(prev + dir, list.length);
    const v = committed[idx];
    return {
      list: committed,
      edit: { activeIndex: idx, activeValue: v === undefined ? null : String(v) },
      preventDefault: true,
      handled: true,
    };
  }
  if (key === "Enter") {
    const committed = commitEdit(list, edit) ?? list.slice();
    const offset = shiftKey ? 0 : 1;
    const next = committed.slice(0, prev + offset).concat([""]).concat(committed.slice(prev + offset));
    return {
      list: next,
      edit: { activeIndex: wrapListIndex(prev + offset, next.length), activeValue: "" },
      preventDefault: false,
      handled: true,
    };
  }
  return { list: null, edit, preventDefault: false, handled: false };
}

/** handleRemove: hapus item aktif, pindah ke item yang sama/terakhir. */
export function removeActiveItem(list: readonly ScratchValue[], edit: ListEditState): { list: ScratchValue[]; edit: ListEditState } {
  const i = edit.activeIndex ?? 0;
  const next = list.slice(0, i).concat(list.slice(i + 1));
  const idx = Math.min(next.length - 1, i);
  const v = next[idx];
  return { list: next, edit: { activeIndex: idx < 0 ? null : idx, activeValue: v === undefined ? null : String(v) } };
}

/** handleAdd: tambah item kosong di akhir dan aktifkan. */
export function appendItem(list: readonly ScratchValue[]): { list: ScratchValue[]; edit: ListEditState } {
  const next = list.concat([""]);
  return { list: next, edit: { activeIndex: next.length - 1, activeValue: "" } };
}

/** Rentang baris yang perlu dirender (virtualisasi sederhana pengganti react-virtualized). */
export function visibleRowRange(
  scrollTop: number,
  viewportHeight: number,
  rowCount: number,
  overscan = 4,
): { start: number; end: number } {
  if (rowCount <= 0) return { start: 0, end: 0 };
  const start = Math.max(0, Math.floor(scrollTop / LIST_ROW_HEIGHT) - overscan);
  const end = Math.min(rowCount, Math.ceil((scrollTop + viewportHeight) / LIST_ROW_HEIGHT) + overscan);
  return { start, end };
}

/** scrollTop agar baris index terlihat (scrollToIndex). */
export function scrollTopForIndex(index: number, scrollTop: number, viewportHeight: number): number {
  const top = index * LIST_ROW_HEIGHT;
  const bottom = top + LIST_ROW_HEIGHT;
  if (top < scrollTop) return top;
  if (bottom > scrollTop + viewportHeight) return Math.max(0, bottom - viewportHeight);
  return scrollTop;
}

/** Ekspor list: item dipisah CRLF (handleExport). */
export function exportListText(list: readonly ScratchValue[]): string {
  return list.join("\r\n");
}

/** Batas aman impor CSV (input tak tepercaya). */
export const CSV_IMPORT_LIMITS = { maxBytes: 10 * 1024 * 1024, maxRows: 200_000 } as const;

/** Parser CSV RFC 4180 sederhana (kutip ganda, koma, CRLF/LF/CR). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const pushRow = (): void => {
    row.push(field);
    rows.push(row);
    row = [];
    field = "";
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"' && field === "") inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\r" || c === "\n") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      pushRow();
      if (rows.length >= CSV_IMPORT_LIMITS.maxRows) return rows;
    } else field += c;
  }
  if (field !== "" || row.length > 0) pushRow();
  return rows;
}

/**
 * Ambil satu kolom (1-based) dari baris CSV, membuang sel kosong yang tidak ada (undefined)
 * seperti scratch-gui handleImport.
 */
export function csvColumn(rows: readonly string[][], columnNumber: number): string[] {
  return rows.map((r) => r[columnNumber - 1]).filter((v): v is string => typeof v === "string");
}
