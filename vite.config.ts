import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { kodyAliases } from "./aliases";

export default defineConfig({
  root: ".",
  publicDir: "app/public",
  plugins: [react()],
  resolve: { alias: kodyAliases },
  server: { strictPort: true },
  build: { outDir: "dist", chunkSizeWarningLimit: 2500, sourcemap: false },
});
