/**
 * AI Lab: melatih classifier gambar / teks / suara di browser lalu menyimpannya ke project.
 * Dimuat lazy (loadAiLab di index.ts) agar tidak masuk bundle utama.
 * Semua teks pengguna dirender sebagai node teks React (tidak pernah sebagai HTML mentah).
 */
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { IRuntime } from "@kody/engine";
import { getAiServices } from "../services";
import type { ClassificationResult, FrameSource } from "../types";
import { AudioLabController, ImageLabController, LAB_ID, TextLabController } from "./controllers";

type Tab = "image" | "text" | "audio";

export interface AiLabProps {
  runtime: IRuntime;
  initialTab?: Tab;
  onClose?: () => void;
}

const S = {
  root: { font: '14px "Helvetica Neue", Helvetica, Arial, sans-serif', color: "#575E75", display: "flex", flexDirection: "column", gap: 12, padding: 16, minWidth: 320 } as React.CSSProperties,
  tabs: { display: "flex", gap: 6 } as React.CSSProperties,
  tab: (on: boolean): React.CSSProperties => ({ border: "none", borderRadius: 8, padding: "6px 14px", cursor: "pointer", background: on ? "#0FBD8C" : "#E9F1FC", color: on ? "#fff" : "#575E75", fontWeight: 600 }),
  card: { border: "1px solid #D9E3F2", borderRadius: 8, padding: 10, display: "flex", flexDirection: "column", gap: 6 } as React.CSSProperties,
  row: { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" } as React.CSSProperties,
  btn: { border: "none", borderRadius: 6, padding: "6px 12px", background: "#0FBD8C", color: "#fff", cursor: "pointer", fontWeight: 600 } as React.CSSProperties,
  ghost: { border: "1px solid #D9E3F2", borderRadius: 6, padding: "6px 12px", background: "#fff", color: "#575E75", cursor: "pointer" } as React.CSSProperties,
  input: { border: "1px solid #D9E3F2", borderRadius: 6, padding: "6px 8px", flex: 1, minWidth: 120 } as React.CSSProperties,
  note: { fontSize: 12, color: "#7A8295" } as React.CSSProperties,
  error: { fontSize: 12, color: "#C0392B" } as React.CSSProperties,
};

function useController<T extends { subscribe(fn: () => void): () => void }>(make: () => T, deps: unknown[]): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ctrl = useMemo(make, deps);
  const [, force] = useReducer((n: number) => n + 1, 0);
  useEffect(() => ctrl.subscribe(force), [ctrl]);
  return ctrl;
}

function ClassAdder({ onAdd }: { onAdd: (name: string) => void }): React.JSX.Element {
  const [name, setName] = useState("");
  return (
    <form
      style={S.row}
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onAdd(name);
        setName("");
      }}
    >
      <input style={S.input} value={name} maxLength={64} placeholder="Nama kelas baru" onChange={(e) => setName(e.target.value)} />
      <button type="submit" style={S.btn}>
        Tambah kelas
      </button>
    </form>
  );
}

function Prediction({ result }: { result: ClassificationResult | null }): React.JSX.Element {
  if (!result) return <span style={S.note}>Belum ada prediksi.</span>;
  return (
    <span>
      Prediksi: <b>{result.label}</b> ({Math.round(result.confidence * 100)}%)
    </span>
  );
}

function CameraPreview({ runtime }: { runtime: IRuntime }): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    const services = getAiServices(runtime);
    const draw = (): void => {
      const canvas = ref.current;
      const frame = services.camera.getFrame({ format: "canvas", dimensions: [240, 180] });
      const ctx = canvas?.getContext("2d");
      if (ctx && frame && canvas) ctx.drawImage(frame as CanvasImageSource, 0, 0, canvas.width, canvas.height);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [runtime]);
  return <canvas ref={ref} width={240} height={180} style={{ borderRadius: 8, background: "#222", width: 240, height: 180 }} />;
}

function ImageTab({ runtime }: { runtime: IRuntime }): React.JSX.Element {
  const lab = useController(() => new ImageLabController(runtime), [runtime]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(lab.loadError);
  const [prediction, setPrediction] = useState<ClassificationResult | null>(null);
  const run = async (fn: () => Promise<unknown>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const fromFile = (label: string, file: File | undefined): void => {
    if (!file || !file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) return;
    void run(async () => {
      const bitmap = await createImageBitmap(file);
      try {
        await lab.addImage(label, bitmap as FrameSource);
      } finally {
        bitmap.close();
      }
    });
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={S.row}>
        <CameraPreview runtime={runtime} />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <button type="button" style={S.ghost} onClick={() => void getAiServices(runtime).ensureCamera(LAB_ID)}>
            Nyalakan kamera
          </button>
          <button type="button" style={S.ghost} onClick={() => getAiServices(runtime).camera.disableVideo()}>
            Matikan kamera
          </button>
          <button
            type="button"
            style={S.btn}
            disabled={busy || !lab.trained}
            onClick={() =>
              void run(async () => {
                const frame = getAiServices(runtime).camera.getFrame({ format: "canvas", dimensions: [224, 224] });
                setPrediction(frame ? await lab.predict(frame as FrameSource) : null);
              })
            }
          >
            Uji dengan kamera
          </button>
          <Prediction result={prediction} />
        </div>
      </div>
      <ClassAdder onAdd={(n) => void run(async () => lab.addClass(n))} />
      {lab.labels.map((label) => (
        <div key={label} style={S.card}>
          <div style={S.row}>
            <b style={{ flex: 1 }}>{label}</b>
            <span style={S.note}>{lab.count(label)} contoh</span>
            <button type="button" style={S.ghost} onClick={() => lab.removeClass(label)}>
              Hapus
            </button>
          </div>
          <div style={S.row}>
            <button type="button" style={S.btn} disabled={busy} onClick={() => void run(() => lab.captureFromCamera(label))}>
              Ambil dari kamera
            </button>
            <label style={S.ghost}>
              Unggah gambar
              <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => fromFile(label, e.target.files?.[0])} />
            </label>
          </div>
          <div style={S.row}>
            {lab.thumbnails(label).map((src, i) => (
              <img key={i} src={src} alt="" width={48} height={36} style={{ borderRadius: 4 }} />
            ))}
          </div>
        </div>
      ))}
      <label style={S.note}>
        <input
          type="checkbox"
          checked={lab.includeThumbnails}
          onChange={(e) => lab.setIncludeThumbnails(e.target.checked)}
        />{" "}
        Simpan foto kecil di file project (tidak disarankan; foto ikut terbagi saat project dibagikan)
      </label>
      <SaveBar lab={lab} onError={setError} />
      {error && <span style={S.error}>{error}</span>}
    </div>
  );
}

function TextTab({ runtime }: { runtime: IRuntime }): React.JSX.Element {
  const lab = useController(() => new TextLabController(runtime), [runtime]);
  const [error, setError] = useState<string | null>(lab.loadError);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [test, setTest] = useState("");
  const safe = (fn: () => void): void => {
    setError(null);
    try {
      fn();
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <ClassAdder onAdd={(n) => safe(() => lab.addClass(n))} />
      {lab.labels.map((label) => (
        <form
          key={label}
          style={S.card}
          onSubmit={(e) => {
            e.preventDefault();
            safe(() => lab.addText(label, drafts[label] ?? ""));
            setDrafts((d) => ({ ...d, [label]: "" }));
          }}
        >
          <div style={S.row}>
            <b style={{ flex: 1 }}>{label}</b>
            <span style={S.note}>{lab.count(label)} contoh</span>
            <button type="button" style={S.ghost} onClick={() => lab.removeClass(label)}>
              Hapus
            </button>
          </div>
          <div style={S.row}>
            <input style={S.input} maxLength={500} placeholder="Contoh kalimat" value={drafts[label] ?? ""} onChange={(e) => setDrafts((d) => ({ ...d, [label]: e.target.value }))} />
            <button type="submit" style={S.btn}>
              Tambah contoh
            </button>
          </div>
        </form>
      ))}
      <div style={S.row}>
        <input style={S.input} maxLength={500} placeholder="Uji kalimat" value={test} onChange={(e) => setTest(e.target.value)} />
        <Prediction result={test ? lab.predict(test) : null} />
      </div>
      <span style={S.note}>Yang disimpan di project hanya daftar kata dan hitungannya, bukan kalimat contohnya.</span>
      <SaveBar lab={lab} onError={setError} />
      {error && <span style={S.error}>{error}</span>}
    </div>
  );
}

function AudioTab({ runtime }: { runtime: IRuntime }): React.JSX.Element {
  const lab = useController(() => new AudioLabController(runtime), [runtime]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(lab.loadError);
  const record = (label: string): void => {
    setBusy(true);
    setError(null);
    lab
      .record(label)
      .then((ok) => !ok && setError("Mikrofon belum aktif atau suara terlalu singkat."))
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(false));
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <span style={S.note}>Tambahkan juga kelas "latar" (suara ruangan biasa) supaya hasilnya lebih stabil.</span>
      <ClassAdder onAdd={(n) => lab.addClass(n)} />
      {lab.labels.map((label) => (
        <div key={label} style={S.card}>
          <div style={S.row}>
            <b style={{ flex: 1 }}>{label}</b>
            <span style={S.note}>{lab.count(label)} contoh</span>
            <button type="button" style={S.btn} disabled={busy} onClick={() => record(label)}>
              Rekam 1 detik
            </button>
            <button type="button" style={S.ghost} onClick={() => lab.removeClass(label)}>
              Hapus
            </button>
          </div>
        </div>
      ))}
      <button type="button" style={S.ghost} onClick={() => getAiServices(runtime).microphone.stop()}>
        Matikan mikrofon
      </button>
      <span style={S.note}>Rekaman tidak disimpan; hanya 48 angka ringkasan frekuensi per contoh.</span>
      <SaveBar lab={lab} onError={setError} />
      {error && <span style={S.error}>{error}</span>}
    </div>
  );
}

function SaveBar({ lab, onError }: { lab: { trained: boolean; save(): boolean; clearSaved(): void }; onError: (m: string | null) => void }): React.JSX.Element {
  const [saved, setSaved] = useState(false);
  return (
    <div style={S.row}>
      <button
        type="button"
        style={S.btn}
        disabled={!lab.trained}
        onClick={() => {
          try {
            setSaved(lab.save());
            onError(null);
          } catch (err) {
            onError((err as Error).message);
          }
        }}
      >
        Simpan model ke project
      </button>
      <button type="button" style={S.ghost} onClick={() => lab.clearSaved()}>
        Hapus model dari project
      </button>
      {saved && <span style={S.note}>Tersimpan.</span>}
    </div>
  );
}

export default function AiLab({ runtime, initialTab = "image", onClose }: AiLabProps): React.JSX.Element {
  const [tab, setTab] = useState<Tab>(initialTab);
  // Menutup AI Lab mematikan kamera & mikrofon yang dinyalakan untuk latihan.
  useEffect(() => () => getAiServices(runtime).stopAllDevices("user"), [runtime]);
  return (
    <div style={S.root} data-testid="ai-lab">
      <div style={S.row}>
        <h2 style={{ margin: 0, flex: 1, fontSize: 18 }}>AI Lab</h2>
        {onClose && (
          <button type="button" style={S.ghost} onClick={onClose}>
            Tutup
          </button>
        )}
      </div>
      <div style={S.tabs} role="tablist">
        {(["image", "text", "audio"] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} style={S.tab(tab === t)} onClick={() => setTab(t)}>
            {t === "image" ? "Gambar" : t === "text" ? "Teks" : "Suara"}
          </button>
        ))}
      </div>
      <span style={S.note}>Semua pelatihan berjalan di perangkat ini. Tidak ada foto, suara, atau teks yang dikirim ke server.</span>
      {tab === "image" && <ImageTab runtime={runtime} />}
      {tab === "text" && <TextTab runtime={runtime} />}
      {tab === "audio" && <AudioTab runtime={runtime} />}
    </div>
  );
}
