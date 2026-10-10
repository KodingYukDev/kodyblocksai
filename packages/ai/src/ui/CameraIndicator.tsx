/**
 * Indikator perangkat aktif (kamera/mikrofon) + tombol "Matikan". Wajib tampil selama perangkat menyala.
 * App memasangnya di area panggung; komponen ini kecil (aman masuk bundle utama, tanpa tfjs/mediapipe).
 */
import { useEffect, useState } from "react";
import type { IRuntime } from "@kody/engine";
import { getAiServices } from "../services";
import type { AiDevice } from "../types";

export interface CameraIndicatorProps {
  runtime: IRuntime;
  /** Diteruskan ke bus app (ai:device-active) bila perlu. */
  onDeviceActive?: (device: AiDevice, active: boolean) => void;
}

export function useActiveDevices(runtime: IRuntime): Record<AiDevice, boolean> {
  const [active, setActive] = useState<Record<AiDevice, boolean>>({ camera: false, microphone: false });
  useEffect(() => {
    const services = getAiServices(runtime);
    setActive({ camera: services.camera.enabled, microphone: services.microphone.active });
    return services.events.on("device-active", ({ device, active: on }) => setActive((prev) => ({ ...prev, [device]: on })));
  }, [runtime]);
  return active;
}

const pill: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "4px 6px 4px 10px",
  borderRadius: 999,
  background: "#C0392B",
  color: "#fff",
  font: '600 12px "Helvetica Neue", Helvetica, Arial, sans-serif',
  boxShadow: "0 1px 4px rgba(0,0,0,.25)",
};

const button: React.CSSProperties = {
  border: "none",
  borderRadius: 999,
  padding: "3px 10px",
  background: "#fff",
  color: "#C0392B",
  font: "inherit",
  cursor: "pointer",
};

export function CameraIndicator({ runtime, onDeviceActive }: CameraIndicatorProps): React.JSX.Element | null {
  const active = useActiveDevices(runtime);
  useEffect(() => {
    if (!onDeviceActive) return;
    const services = getAiServices(runtime);
    return services.events.on("device-active", ({ device, active: on }) => onDeviceActive(device, on));
  }, [runtime, onDeviceActive]);
  if (!active.camera && !active.microphone) return null;
  const parts = [active.camera ? "Kamera" : null, active.microphone ? "Mikrofon" : null].filter(Boolean).join(" & ");
  return (
    <div role="status" aria-live="polite" style={pill} data-testid="ai-device-indicator">
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 4, background: "#fff" }} />
      <span>{parts} aktif</span>
      <button type="button" style={button} onClick={() => getAiServices(runtime).stopAllDevices("user")}>
        Matikan
      </button>
    </div>
  );
}
