/**
 * Sentuhan untuk daftar costume/sound di tablet (iPad Safari tidak memicu `contextmenu` dan seret
 * HTML5 tidak andal): tahan ~0,45 detik lalu lepas = buka menu (duplikat/ekspor/hapus); tahan lalu
 * geser = pindahkan tile. Gerakan sebelum waktu tahan habis = gulir biasa.
 */
import { useCallback, useEffect, useRef, type PointerEvent as RPointerEvent, type RefObject } from "react";

export const LONG_PRESS_MS = 450;
const MOVE_TOLERANCE = 10;

interface PressState {
  pointerId: number;
  index: number;
  startX: number;
  startY: number;
  armed: boolean;
  moved: boolean;
  dropAt: number;
  timer: ReturnType<typeof setTimeout> | null;
}

export interface TouchReorderCallbacks {
  onArm(index: number): void;
  onHover(index: number | null): void;
  onDrop(from: number, to: number): void;
  onMenu(index: number, x: number, y: number): void;
  onCancel(): void;
}

/** Pemetaan titik layar -> indeks tile (data-index) di bawah jari. */
export function indexAtPoint(x: number, y: number, doc: Document = document): number | null {
  const el = typeof doc.elementFromPoint === "function" ? doc.elementFromPoint(x, y) : null;
  const tile = el?.closest<HTMLElement>("[data-index]");
  const n = tile ? Number(tile.dataset.index) : NaN;
  return Number.isInteger(n) ? n : null;
}

export function useTouchReorder(listRef: RefObject<HTMLElement | null>, cb: TouchReorderCallbacks) {
  const press = useRef<PressState | null>(null);
  /** Klik sintetis setelah tahan-lama tidak boleh memilih/menjalankan tile. */
  const suppressClick = useRef(false);
  const cbRef = useRef(cb);
  cbRef.current = cb;

  const clear = useCallback(() => {
    const p = press.current;
    if (p?.timer) clearTimeout(p.timer);
    press.current = null;
  }, []);

  // Saat sedang menyeret, cegah halaman/daftar ikut bergulir (listener non-pasif agar Safari patuh).
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const block = (e: TouchEvent): void => {
      if (press.current?.armed) e.preventDefault();
    };
    el.addEventListener("touchmove", block, { passive: false });
    return () => el.removeEventListener("touchmove", block);
  }, [listRef]);

  useEffect(() => clear, [clear]);

  const onPointerDown = (e: RPointerEvent<HTMLElement>, index: number): void => {
    suppressClick.current = false;
    if (e.pointerType === "mouse") return;
    clear();
    const state: PressState = { pointerId: e.pointerId, index, startX: e.clientX, startY: e.clientY, armed: false, moved: false, dropAt: index, timer: null };
    state.timer = setTimeout(() => {
      if (press.current !== state) return;
      state.armed = true;
      suppressClick.current = true;
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(15);
      cbRef.current.onArm(index);
    }, LONG_PRESS_MS);
    press.current = state;
  };

  const onPointerMove = (e: RPointerEvent<HTMLElement>): void => {
    const p = press.current;
    if (!p || p.pointerId !== e.pointerId) return;
    const dist = Math.hypot(e.clientX - p.startX, e.clientY - p.startY);
    if (!p.armed) {
      if (dist > MOVE_TOLERANCE) clear(); // gulir biasa
      return;
    }
    if (dist > MOVE_TOLERANCE) p.moved = true;
    const at = indexAtPoint(e.clientX, e.clientY);
    if (at !== null && at !== p.dropAt) {
      p.dropAt = at;
      cbRef.current.onHover(at);
    }
  };

  const onPointerUp = (e: RPointerEvent<HTMLElement>): void => {
    const p = press.current;
    if (!p || p.pointerId !== e.pointerId) return;
    clear();
    if (!p.armed) return;
    if (p.moved && p.dropAt !== p.index) cbRef.current.onDrop(p.index, p.dropAt);
    else if (p.moved) cbRef.current.onCancel();
    else cbRef.current.onMenu(p.index, e.clientX, e.clientY);
  };

  const onPointerCancel = (e: RPointerEvent<HTMLElement>): void => {
    const p = press.current;
    if (!p || p.pointerId !== e.pointerId) return;
    clear();
    if (p.armed) cbRef.current.onCancel();
  };

  /** Panggil di onClick tile: true = klik ini sisa tahan-lama, abaikan. */
  const consumeClick = (): boolean => {
    if (!suppressClick.current) return false;
    suppressClick.current = false;
    return true;
  };

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, consumeClick };
}
