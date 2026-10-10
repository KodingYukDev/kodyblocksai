/** Hook React bersama untuk shell. */
import { type RefObject, useEffect, useState, useSyncExternalStore } from "react";
import type { ShellController, ShellSnapshot } from "./types";

export function useShellSnapshot(controller: ShellController): ShellSnapshot {
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
}

export interface ViewportSize {
  width: number;
  height: number;
}

const readViewport = (): ViewportSize =>
  typeof window === "undefined" ? { width: 1280, height: 800 } : { width: window.innerWidth, height: window.innerHeight };

/** Ukuran jendela, diperbarui saat resize. */
export function useViewport(): ViewportSize {
  const [size, setSize] = useState<ViewportSize>(readViewport);
  useEffect(() => {
    const onResize = (): void => setSize(readViewport());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return size;
}

/** Lebar konten sebuah elemen (ResizeObserver bila ada). */
export function useElementWidth(ref: RefObject<HTMLElement | null>, fallback: number): number {
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = (): void => setWidth(el.clientWidth || fallback);
    update();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, fallback]);
  return width;
}

/** Tutup popover saat klik di luar elemen atau tombol Escape. */
export function useDismiss(ref: RefObject<HTMLElement | null>, open: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent): void => {
      const el = ref.current;
      if (el && e.target instanceof Node && el.contains(e.target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [ref, open, onClose]);
}
