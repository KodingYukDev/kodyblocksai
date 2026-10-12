import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles/theme.css";
import "./styles/app.css";

/**
 * Tablet: cegah zoom pinch pada UI (Safari iOS mengabaikan user-scalable=no). Workspace blok belum
 * mendukung pinch, jadi semua gerakan dua jari dicegah. Zoom ketuk-dua-kali dicegah lewat CSS touch-action.
 */
function preventPageZoom(): void {
  const stop = (e: Event): void => e.preventDefault();
  document.addEventListener("gesturestart", stop, { passive: false });
  document.addEventListener("gesturechange", stop, { passive: false });
  document.addEventListener(
    "touchmove",
    (e) => {
      if (e.touches.length > 1) e.preventDefault();
    },
    { passive: false },
  );
}

preventPageZoom();

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root tidak ditemukan");
createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
