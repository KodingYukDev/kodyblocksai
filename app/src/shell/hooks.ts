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

/** Inset area aman (notch / home indicator) dari CSS env(), 0 bila tidak didukung. */
export function readSafeAreaInsets(): { top: number; right: number; bottom: number; left: number } {
  const zero = { top: 0, right: 0, bottom: 0, left: 0 };
  if (typeof document === "undefined" || !document.body) return zero;
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)";
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const px = (v: string): number => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };
  const r = { top: px(cs.paddingTop), right: px(cs.paddingRight), bottom: px(cs.paddingBottom), left: px(cs.paddingLeft) };
  probe.remove();
  return r;
}

/** Ukuran area yang bisa dipakai shell: jendela dikurangi inset area aman. */
const readViewport = (): ViewportSize => {
  if (typeof window === "undefined") return { width: 1280, height: 800 };
  const inset = readSafeAreaInsets();
  return {
    width: Math.max(1, window.innerWidth - inset.left - inset.right),
    height: Math.max(1, window.innerHeight - inset.top - inset.bottom),
  };
};

/** Ukuran jendela, diperbarui saat resize / rotasi layar. */
export function useViewport(): ViewportSize {
  const [size, setSize] = useState<ViewportSize>(readViewport);
  useEffect(() => {
    let raf = 0;
    const onResize = (): void => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() =>
        setSize((prev) => {
          const next = readViewport();
          return prev.width === next.width && prev.height === next.height ? prev : next;
        }),
      );
    };
    // iOS kadang melaporkan ukuran lama tepat saat orientationchange; ukur ulang sesudahnya juga.
    const onOrientation = (): void => {
      onResize();
      setTimeout(onResize, 300);
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onOrientation);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onOrientation);
    };
  }, []);
  return size;
}

/** true bila perangkat punya layar sentuh sebagai penunjuk (tablet/ponsel). */
export function useCoarsePointer(): boolean {
  const query = "(any-pointer: coarse)";
  const [coarse, setCoarse] = useState<boolean>(
    () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(query);
    const on = (): void => setCoarse(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return coarse;
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
