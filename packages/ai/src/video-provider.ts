/**
 * Kamera bersama (IVideoProvider): getUserMedia hanya setelah aksi pengguna, indikator aktif di UI,
 * stop track saat project berhenti/ditutup, frame tidak pernah dikirim ke jaringan. Pemilik: agent ai.
 *
 * App boleh memasang ini ke runtime.ioDevices.video; layanan AI (getAiServices) akan memakai instance
 * yang sama. Bila tidak dipasang, layanan AI membuatnya sendiri saat blok AI pertama dijalankan.
 */
import { CameraController } from "./devices/camera";
import type { CameraDeps } from "./devices/camera";

export function createVideoProvider(deps: CameraDeps = {}): CameraController {
  return new CameraController(deps);
}
