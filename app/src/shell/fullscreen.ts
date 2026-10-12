/**
 * Layar penuh sungguhan (Fullscreen API) untuk mode panggung layar penuh, agar bilah browser
 * di tablet ikut tersembunyi. Tidak didukung (iPhone, iframe tanpa izin) = cukup layar penuh CSS.
 */
import { useEffect, useRef } from "react";

type FsDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type FsElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

const fullscreenElement = (): Element | null => {
  const d = document as FsDocument;
  return d.fullscreenElement ?? d.webkitFullscreenElement ?? null;
};

function requestFs(el: FsElement): Promise<boolean> {
  if (typeof el.requestFullscreen !== "function" && typeof el.webkitRequestFullscreen !== "function") return Promise.resolve(false);
  try {
    const r = el.requestFullscreen ? el.requestFullscreen({ navigationUI: "hide" }) : el.webkitRequestFullscreen?.();
    return Promise.resolve(r).then(
      () => true,
      () => false,
    );
  } catch {
    return Promise.resolve(false);
  }
}

function exitFs(): void {
  const d = document as FsDocument;
  try {
    const r = d.exitFullscreen ? d.exitFullscreen() : d.webkitExitFullscreen?.();
    void Promise.resolve(r).catch(() => undefined);
  } catch {
    // Abaikan: sudah keluar.
  }
}

/** Sinkronkan `active` dengan Fullscreen API; `onSystemExit` dipanggil bila pengguna keluar lewat sistem. */
export function useRealFullscreen(active: boolean, onSystemExit: () => void): void {
  const entered = useRef(false);
  const exitRef = useRef(onSystemExit);
  exitRef.current = onSystemExit;
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (active && !fullscreenElement()) {
      void requestFs(document.documentElement as FsElement).then((ok) => {
        entered.current = ok;
        // Sudah keluar dari mode layar penuh sebelum browser selesai masuk.
        if (ok && !activeRef.current) {
          entered.current = false;
          exitFs();
        }
      });
    } else if (!active && entered.current) {
      entered.current = false;
      if (fullscreenElement()) exitFs();
    }
  }, [active]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onChange = (): void => {
      if (!fullscreenElement() && entered.current) {
        entered.current = false;
        exitRef.current();
      }
    };
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, []);
}
