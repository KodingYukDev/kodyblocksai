/**
 * Pratinjau shell dengan controller tiruan (tanpa engine). Buka /app/src/shell/preview.html di `npm run dev`.
 * Hanya untuk pengembangan; tidak ikut build produksi karena tidak dirujuk index.html.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DEFAULT_MONITOR } from "@kody/engine";
import kodyUrl from "../assets/kody.svg";
import { createAppBus } from "../app-events";
import "../styles/theme.css";
import "../styles/app.css";
import { KodyShell } from "./KodyShell";
import { createMockController } from "./mock-controller";

const controller = createMockController({
  monitors: [
    { ...DEFAULT_MONITOR, id: "skor", opcode: "data_variable", params: { VARIABLE: "skor" }, value: 12, x: 5, y: 5 },
    { ...DEFAULT_MONITOR, id: "kec", opcode: "data_variable", params: { VARIABLE: "kecepatan" }, value: 3.5, mode: "slider", x: 5, y: 32 },
    {
      ...DEFAULT_MONITOR,
      id: "buah",
      opcode: "data_listcontents",
      params: { LIST: "buah" },
      value: ["apel", "jeruk", "mangga", "pisang", "salak", "durian", "rambutan", "kelengkeng"],
      mode: "list",
      x: 360,
      y: 5,
      width: 110,
      height: 180,
    },
  ],
});
controller.variables.set("stage:buah", ["apel", "jeruk", "mangga", "pisang", "salak", "durian", "rambutan", "kelengkeng"]);
controller.patch({
  targets: controller
    .getSnapshot()
    .targets.map((t) => (t.isStage ? t : { ...t, thumbnailUrl: kodyUrl }))
    .concat([{ ...controller.getSnapshot().targets[1]!, id: "bola", name: "Bola", thumbnailUrl: null }]),
});
// Gambar maskot di kanvas agar tata letak panggung terlihat.
controller.attachStageCanvas = (canvas) => {
  if (!canvas) return;
  const img = new Image();
  img.onload = () => {
    canvas.width = 480;
    canvas.height = 360;
    const ctx = canvas.getContext("2d");
    ctx?.drawImage(img, 190, 130, 100, 100);
  };
  img.src = kodyUrl;
};

const el = document.getElementById("root");
if (el) {
  createRoot(el).render(
    <StrictMode>
      <KodyShell
        controller={controller}
        bus={createAppBus()}
        panels={{ code: <div style={{ padding: 16, color: "#575e75" }}>Workspace blok (packages/blocks-ui)</div> }}
      />
    </StrictMode>,
  );
}
