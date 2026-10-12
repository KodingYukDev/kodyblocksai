/* Pendaftaran service worker KodyBlocks AI (disalin ke dist/sw-register.js oleh scripts/pwa-plugin.ts).
 * File terpisah (bukan skrip inline) agar lolos CSP script-src 'self'. */
(() => {
  const nav = navigator;
  if (!("serviceWorker" in nav)) return;
  const local = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  if (location.protocol !== "https:" && !local) return;
  // Halaman di-embed (iframe LMS) tetap boleh; SW hanya mengatur cache origin ini.
  const UPDATE_EVERY_MS = 60 * 60 * 1000;
  let lastCheck = 0;

  const register = () => {
    nav.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((reg) => {
        lastCheck = Date.now();
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState !== "visible") return;
          if (Date.now() - lastCheck < UPDATE_EVERY_MS) return;
          lastCheck = Date.now();
          reg.update().catch(() => {});
        });
      })
      .catch(() => {
        // Mode privat / penyimpanan diblokir: app tetap jalan tanpa cache offline.
      });
  };

  // Jangan berebut bandwidth dengan muatan awal.
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
})();
