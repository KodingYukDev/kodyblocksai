import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { kodyAliases } from "./aliases";
import { kodyPwaPlugin } from "./scripts/pwa-plugin";

/**
 * Chunk vendor stabil: React jarang berubah, jadi dipisah dari kode app agar deploy baru tidak
 * memaksa unduh ulang React (cache /assets/* immutable 1 tahun). TensorFlow.js dan MediaPipe sudah
 * dimuat lewat import() hanya saat ekstensi AI ditambahkan, jadi tidak disentuh di sini.
 */
function manualChunks(id: string): string | undefined {
  const nm = id.replace(/\\/g, "/").split("/node_modules/")[1];
  if (!nm) return undefined;
  if (/^(react|react-dom|scheduler)\//.test(nm)) return "react-vendor";
  return undefined;
}

export default defineConfig({
  root: ".",
  publicDir: "app/public",
  plugins: [react(), kodyPwaPlugin()],
  resolve: { alias: kodyAliases },
  server: { strictPort: true },
  build: {
    outDir: "dist",
    // Chunk tfjs (lazy, ~1.3 MB) memang besar; peringatan di atas ini berarti ada yang membengkak.
    chunkSizeWarningLimit: 1400,
    sourcemap: false,
    rollupOptions: { output: { manualChunks } },
  },
});
