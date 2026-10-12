/**
 * Ambil foto kamera sebagai costume (padanan scratch-gui camera-modal). Kamera hanya menyala
 * selama modal terbuka (dibuka oleh klik pengguna), indikator aktif dikirim lewat onDeviceActive,
 * dan semua track dihentikan saat modal ditutup. Frame tidak pernah dikirim ke server.
 */
import { useEffect, useRef, useState } from "react";
import { captureVideoFrame } from "./costume-media";
import type { TabStrings } from "./strings";
import type { DeviceActiveFn, NewCostume } from "./types";

export interface CameraModalProps {
  strings: TabStrings;
  costumeName: string;
  onClose(): void;
  onCapture(costume: NewCostume): void;
  onDeviceActive?: DeviceActiveFn;
}

export function CameraModal({ strings: t, costumeName, onClose, onCapture, onDeviceActive }: CameraModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [shot, setShot] = useState<{ costume: NewCostume; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  // Callback disimpan di ref supaya kamera tidak dinyalakan ulang setiap render induk.
  const deviceActive = useRef(onDeviceActive);
  deviceActive.current = onDeviceActive;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let disposed = false;
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!md?.getUserMedia) {
      setError(t.cameraDenied);
      return;
    }
    // Kamera depan (iPad/HP); di laptop facingMode diabaikan.
    md.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" }, audio: false })
      .then((s) => {
        if (disposed) {
          s.getTracks().forEach((tr) => tr.stop());
          return;
        }
        stream = s;
        deviceActive.current?.("camera", true);
        const v = videoRef.current;
        if (v) {
          v.muted = true;
          v.setAttribute("playsinline", "");
          v.srcObject = s;
          const markReady = (): void => setReady(v.videoWidth > 0);
          v.addEventListener("loadedmetadata", markReady);
          v.addEventListener("playing", markReady);
          void v.play().catch(() => undefined);
        }
      })
      .catch(() => setError(t.cameraDenied));
    return () => {
      disposed = true;
      if (stream) {
        stream.getTracks().forEach((tr) => tr.stop());
        deviceActive.current?.("camera", false);
      }
    };
  }, [t.cameraDenied]);

  useEffect(() => () => void (shot && URL.revokeObjectURL(shot.url)), [shot]);

  // Ambil ulang: Safari menjeda video yang disembunyikan, jadi putar lagi.
  useEffect(() => {
    if (!shot) void videoRef.current?.play().catch(() => undefined);
  }, [shot]);

  const take = async (): Promise<void> => {
    const v = videoRef.current;
    if (!v || busy) return;
    setBusy(true);
    try {
      const costume = await captureVideoFrame(v, costumeName);
      const url = URL.createObjectURL(new Blob([costume.asset.data as BlobPart], { type: "image/png" }));
      setShot({ costume, url });
    } catch {
      // Kamera belum memberi frame: biarkan anak mencoba lagi.
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="kb-amodal" role="dialog" aria-modal="true" aria-label={t.camera} onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div className="kb-amodal__box kb-camera">
        <header className="kb-amodal__header">
          <h2>{t.camera}</h2>
          <button type="button" className="kb-amodal__close" onClick={onClose} aria-label={t.close}>
            {t.close}
          </button>
        </header>
        <div className="kb-camera__view">
          {error ? <p className="kb-camera__error">{error}</p> : null}
          <video ref={videoRef} className="kb-camera__video" muted playsInline hidden={!!shot || !!error} />
          {shot ? <img className="kb-camera__shot" src={shot.url} alt="" /> : null}
          {!error && !shot ? <span className="kb-device-badge">{t.cameraActive}</span> : null}
        </div>
        <footer className="kb-amodal__footer">
          {shot ? (
            <>
              <button type="button" className="kb-btn" onClick={() => setShot(null)}>
                {t.retake}
              </button>
              <button
                type="button"
                className="kb-btn kb-btn--primary"
                onClick={() => {
                  onCapture(shot.costume);
                  onClose();
                }}
              >
                {t.save}
              </button>
            </>
          ) : (
            <button type="button" className="kb-btn kb-btn--primary" disabled={!!error || busy || !ready} onClick={() => void take()}>
              {t.takePhoto}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
