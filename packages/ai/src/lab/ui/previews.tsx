/**
 * Panel kamera & pratinjau langsung AI Lab. Kamera hanya menyala lewat tombol (gestur pengguna;
 * penting untuk iOS Safari). Pratinjau menebak kelas dari frame terbaru dan menampilkan bar kepercayaan.
 */
import { useEffect, useRef, useState } from "react";
import { HAND_EDGES, POSE_EDGES } from "../../classifier/landmark-features";
import { AudioListener } from "../../devices/audio-listener";
import { SILENCE_LEVEL } from "../../classifier/audio-features";
import type { AiServices } from "../../services";
import type { ClassificationResult, Point2 } from "../../types";
import type { LabSession } from "../lab-session";
import { BACKGROUND_LABEL } from "../lab-session";
import { LAB_ID, previewFromCamera } from "../sources";
import type { CameraKind, PreviewFrame } from "../sources";
import { ConfidenceBars, useSession } from "./parts";

const CAMERA_HELP: Record<string, string> = {
  "camera-denied":
    "Izin kamera ditolak. Buka pengaturan situs di browser lalu izinkan Kamera. Di iPad: Pengaturan > Safari > Kamera > Izinkan.",
  "camera-missing": "Tidak ada kamera yang bisa dipakai di perangkat ini.",
  "camera-unsupported": "Browser ini tidak bisa memakai kamera. Pastikan alamatnya https dan pakai Chrome, Edge, atau Safari terbaru.",
  "model-load-failed": "Model AI gagal dimuat. Periksa koneksi lalu coba lagi.",
};

const CAMERA_CODES = ["camera-denied", "camera-missing", "camera-unsupported", "model-load-failed"] as const;
const MIC_CODES = ["microphone-denied", "microphone-missing", "microphone-unsupported"] as const;

/** Pesan perangkat terakhir (izin ditolak, dll.) untuk ditampilkan di dalam AI Lab. */
export function useDeviceMessage(services: AiServices, codes: readonly string[]): [string | null, () => void] {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(
    () =>
      services.events.on("notice", (n) => {
        if (codes.includes(n.code)) setMsg(CAMERA_HELP[n.code] ?? n.message);
      }),
    [services, codes],
  );
  return [msg, () => setMsg(null)];
}

const toCanvas = (p: Point2, w: number, h: number): [number, number] => [((p.x + 240) / 480) * w, ((180 - p.y) / 360) * h];

function drawSkeleton(ctx: CanvasRenderingContext2D, pts: readonly (Point2 & { visibility?: number })[], edges: readonly (readonly [number, number])[], w: number, h: number): void {
  ctx.strokeStyle = "#0FBD8C";
  ctx.fillStyle = "#ffffff";
  ctx.lineWidth = Math.max(2, w / 160);
  for (const [a, b] of edges) {
    const p = pts[a];
    const q = pts[b];
    if (!p || !q || (p.visibility ?? 1) < 0.5 || (q.visibility ?? 1) < 0.5) continue;
    const [x1, y1] = toCanvas(p, w, h);
    const [x2, y2] = toCanvas(q, w, h);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  for (const p of pts) {
    if ((p.visibility ?? 1) < 0.5) continue;
    const [x, y] = toCanvas(p, w, h);
    ctx.beginPath();
    ctx.arc(x, y, Math.max(2, w / 140), 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Gambar video kamera (dicerminkan bila kamera depan) + kerangka pose/tangan terakhir. */
export function CameraView({ services, overlay, on }: { services: AiServices; overlay: PreviewFrame | null; on: boolean }): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef(overlay);
  overlayRef.current = overlay;
  useEffect(() => {
    if (typeof requestAnimationFrame !== "function") return;
    let raf = 0;
    const draw = (): void => {
      const canvas = ref.current;
      const ctx = canvas?.getContext("2d");
      const video = services.camera.getVideoElement();
      if (canvas && ctx) {
        const w = canvas.width;
        const h = canvas.height;
        if (video) {
          ctx.save();
          if (services.camera.isMirrored) {
            ctx.translate(w, 0);
            ctx.scale(-1, 1);
          }
          ctx.drawImage(video as unknown as CanvasImageSource, 0, 0, w, h);
          ctx.restore();
          const o = overlayRef.current;
          for (const hand of o?.hands ?? []) drawSkeleton(ctx, hand.landmarks, HAND_EDGES, w, h);
          for (const pose of o?.poses ?? []) drawSkeleton(ctx, pose.keypoints, POSE_EDGES, w, h);
        } else {
          ctx.clearRect(0, 0, w, h);
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [services]);
  return (
    <div className="kal-video">
      <canvas ref={ref} width={480} height={360} aria-label="Gambar kamera" />
      {!on && <div className="kal-video__msg">Kamera mati. Tekan "Nyalakan kamera" untuk mulai.</div>}
    </div>
  );
}

export function useCameraOn(services: AiServices): boolean {
  const [on, setOn] = useState(services.camera.enabled);
  useEffect(() => {
    setOn(services.camera.enabled);
    return services.events.on("device-active", ({ device, active }) => {
      if (device === "camera") setOn(active);
    });
  }, [services]);
  return on;
}

/** Panel kamera: tombol nyala/mati/ganti kamera + pratinjau langsung. */
export function CameraPanel({
  services,
  session,
  kind,
  paused,
}: {
  services: AiServices;
  session: LabSession;
  kind: CameraKind;
  paused: boolean;
}): React.JSX.Element {
  useSession(session);
  const on = useCameraOn(services);
  const [overlay, setOverlay] = useState<PreviewFrame | null>(null);
  const [result, setResult] = useState<ClassificationResult | null>(null);
  const [starting, setStarting] = useState(false);
  const [msg, clearMsg] = useDeviceMessage(services, CAMERA_CODES);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    if (!on) {
      setOverlay(null);
      setResult(null);
      return;
    }
    let busy = false;
    let alive = true;
    const tick = async (): Promise<void> => {
      if (busy || pausedRef.current || !services.camera.enabled) return;
      // Gambar: pratinjau hanya bila model sudah dilatih (MobileNet berat). Pose/tangan: kerangka selalu tampil.
      if (kind === "image" && !session.isTrained) return;
      busy = true;
      try {
        const frame = await previewFromCamera(services, kind);
        if (!alive) return;
        setOverlay(frame);
        setResult(session.isTrained ? session.predictFeatures(frame?.features ?? null) : null);
      } catch {
        // model gagal dimuat -> notice sudah dikirim
      } finally {
        busy = false;
      }
    };
    const handle = setInterval(() => void tick(), 150);
    return () => {
      alive = false;
      clearInterval(handle);
    };
  }, [services, session, kind, on]);

  const start = (): void => {
    clearMsg();
    setStarting(true);
    void services.ensureCamera(LAB_ID).finally(() => setStarting(false));
  };
  const facing = services.camera.facingMode;
  return (
    <div className="kal-card">
      <CameraView services={services} overlay={overlay} on={on} />
      {msg && <p className="kal-error">{msg}</p>}
      <div className="kal-row">
        {on ? (
          <button type="button" className="kal-btn" onClick={() => services.camera.disableVideo()}>
            Matikan kamera
          </button>
        ) : (
          <button type="button" className="kal-btn kal-btn--main" disabled={starting} onClick={start}>
            {starting ? "Menyalakan..." : "Nyalakan kamera"}
          </button>
        )}
        <button
          type="button"
          className="kal-btn"
          onClick={() => {
            clearMsg();
            void services.setCameraFacing(facing === "user" ? "environment" : "user");
          }}
        >
          {facing === "user" ? "Pakai kamera belakang" : "Pakai kamera depan"}
        </button>
      </div>
      <h3>Uji model</h3>
      {session.isTrained ? (
        <ConfidenceBars labels={session.labels} result={result} />
      ) : (
        <p className="kal-note">Setelah model dilatih, arahkan kamera dan lihat tebakan AI di sini.</p>
      )}
    </div>
  );
}

/** Pratinjau suara: dengarkan langsung dan tampilkan tebakan model. */
export function AudioPreview({ services, session, paused }: { services: AiServices; session: LabSession; paused: boolean }): React.JSX.Element {
  useSession(session);
  const [listening, setListening] = useState(false);
  const [level, setLevel] = useState(0);
  const [result, setResult] = useState<ClassificationResult | null>(null);
  const [msg, clearMsg] = useDeviceMessage(services, MIC_CODES);
  useEffect(() => {
    if (!listening) return;
    if (paused) {
      setListening(false);
      return;
    }
    let alive = true;
    const listener = new AudioListener(services.microphone, (l) => {
      if (!alive) return;
      const lvl = l.window.level();
      setLevel(lvl);
      if (l.window.size < 5) return;
      if (lvl < SILENCE_LEVEL && session.labels.includes(BACKGROUND_LABEL)) {
        const scores: Record<string, number> = {};
        for (const label of session.labels) scores[label] = label === BACKGROUND_LABEL ? 1 : 0;
        setResult({ label: BACKGROUND_LABEL, confidence: 1, scores });
      } else {
        setResult(session.predictFeatures(l.window.features()));
      }
    });
    void services.ensureMicrophone(LAB_ID).then((ok) => {
      if (!alive) return;
      if (ok) listener.start();
      else setListening(false);
    });
    return () => {
      alive = false;
      listener.stop();
    };
  }, [listening, paused, services, session]);
  return (
    <div className="kal-card">
      <h3>Uji model</h3>
      {msg && <p className="kal-error">{msg}</p>}
      {session.isTrained ? (
        <>
          <div className="kal-row">
            <button
              type="button"
              className={listening ? "kal-btn" : "kal-btn kal-btn--main"}
              onClick={() => {
                clearMsg();
                services.unlockAudio();
                setListening((v) => !v);
              }}
            >
              {listening ? "Berhenti mendengar" : "Dengarkan langsung"}
            </button>
          </div>
          {listening && (
            <div className="kal-meter" aria-label="Level suara">
              <div style={{ width: `${Math.round(Math.min(1, level * 2) * 100)}%` }} />
            </div>
          )}
          <ConfidenceBars labels={session.labels} result={listening ? result : null} />
        </>
      ) : (
        <p className="kal-note">Setelah model dilatih, tekan "Dengarkan langsung" lalu buat suaramu.</p>
      )}
      <p className="kal-note">Rekaman tidak disimpan. AI hanya menyimpan 48 angka ringkasan frekuensi tiap contoh.</p>
    </div>
  );
}

/** Pratinjau teks: ketik kalimat, lihat tebakan. */
export function TextPreview({ session }: { session: LabSession }): React.JSX.Element {
  useSession(session);
  const [text, setText] = useState("");
  return (
    <div className="kal-card">
      <h3>Uji model</h3>
      {session.isTrained ? (
        <>
          <input className="kal-input" value={text} maxLength={500} placeholder="Ketik kalimat untuk diuji" onChange={(e) => setText(e.target.value)} />
          <ConfidenceBars labels={session.labels} result={session.predictText(text)} />
        </>
      ) : (
        <p className="kal-note">Setelah model dilatih, ketik kalimat baru dan lihat AI menebak kelasnya.</p>
      )}
      <p className="kal-note">Yang disimpan di project hanya daftar kata dan hitungannya, bukan kalimat contohmu.</p>
    </div>
  );
}
