/**
 * AI Lab: anak melatih model AI sendiri (gambar, pose tubuh, gestur tangan, suara, teks) di browser,
 * mirip Teachable Machine. Model yang dilatih otomatis tersimpan di project dan langsung bisa dipakai
 * blok ekstensi AI (menu kelas diperbarui tanpa memuat ulang).
 * Dimuat lazy (loadAiLab di index.ts) agar tfjs/mediapipe tidak masuk bundle utama.
 * Semua teks pengguna dirender sebagai node teks React (tidak pernah sebagai HTML mentah).
 */
import { useEffect, useMemo, useState } from "react";
import type { IRuntime } from "@kody/engine";
import { getAiServices } from "../services";
import { LAB_KINDS, LabSession } from "./lab-session";
import type { LabKind } from "./lab-session";
import { ClassCard, TrainPanel } from "./ui/cards";
import type { CardContext } from "./ui/cards";
import { KindIcon, useSession } from "./ui/parts";
import { AudioPreview, CameraPanel, TextPreview } from "./ui/previews";
import { LAB_CSS } from "./ui/styles";

/** Nama tab lama ("image" | "text" | "audio") tetap diterima. */
export type AiLabTab = LabKind;

export interface AiLabProps {
  runtime: IRuntime;
  initialTab?: AiLabTab;
  /** Nama kelas awal untuk tab pertama (mis. dari kartu tutorial); diabaikan bila tab sudah berisi. */
  initialClasses?: readonly string[];
  onClose?: () => void;
}

const TAB_INFO: Record<LabKind, { title: string; intro: string; extension: string }> = {
  image: {
    title: "Gambar",
    intro: "Ajari AI mengenali benda atau gerakan dari kamera. Buat tiap kelas (mis. batu, gunting, kertas), lalu tahan tombol rekam sambil menunjukkan contohnya dari berbagai sudut.",
    extension: "Klasifikasi Gambar",
  },
  pose: {
    title: "Pose Tubuh",
    intro: "Ajari AI mengenali pose tubuhmu (mis. tangan ke atas, berdiri T). Berdirilah agak jauh supaya kepala, bahu, dan tangan terlihat.",
    extension: "Deteksi Tubuh",
  },
  hand: {
    title: "Gestur Tangan",
    intro: "Ajari AI gestur tangan buatanmu sendiri (mis. angka 1-5, tanda OK). AI melihat posisi 21 titik jari, bukan fotonya.",
    extension: "Deteksi Tangan",
  },
  audio: {
    title: "Suara",
    intro: "Ajari AI mengenali suara (tepuk tangan, siulan, kata tertentu). Rekam juga \"Suara latar\" supaya AI tahu bedanya hening dan suaramu.",
    extension: "Suara AI",
  },
  text: {
    title: "Teks",
    intro: "Ajari AI memahami kalimat. Contoh: kelas \"senang\" dan \"sedih\", masing-masing beberapa kalimat. Cocok untuk chatbot.",
    extension: "Klasifikasi Teks",
  },
};

function LabTab({ session, onError }: { session: LabSession; onError: (m: string | null) => void }): React.JSX.Element {
  useSession(session);
  const services = getAiServices(session.runtime);
  const [busy, setBusy] = useState(false);
  const ctx: CardContext = { services, session, report: onError, setBusy };
  const kind = session.kind;
  return (
    <div className="kal-body">
      <div className="kal-col">
        <p className="kal-intro">{TAB_INFO[kind].intro}</p>
        {session.loadError && <p className="kal-error">{session.loadError}</p>}
        {session.classes.map((cls, i) => (
          <ClassCard key={cls.id} ctx={ctx} cls={cls} index={i} />
        ))}
        <button
          type="button"
          className="kal-btn kal-add"
          onClick={() => {
            try {
              session.addClass();
              onError(null);
            } catch (err) {
              onError((err as Error).message);
            }
          }}
        >
          + Tambah kelas
        </button>
      </div>
      <div className="kal-side">
        {kind === "audio" ? (
          <AudioPreview services={services} session={session} paused={busy} />
        ) : kind === "text" ? (
          <TextPreview session={session} />
        ) : (
          <CameraPanel services={services} session={session} kind={kind} paused={busy} />
        )}
        <TrainPanel ctx={ctx} />
        <p className="kal-note">
          Pakai modelmu di kode: tambah ekstensi "{TAB_INFO[kind].extension}", lalu cari blok dengan nama kelasmu.
        </p>
      </div>
    </div>
  );
}

export default function AiLab({ runtime, initialTab = "image", initialClasses, onClose }: AiLabProps): React.JSX.Element {
  const [tab, setTab] = useState<LabKind>(LAB_KINDS.includes(initialTab) ? initialTab : "image");
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  // Satu sesi per jenis selama AI Lab terbuka: pindah tab tidak menghapus contoh yang belum dilatih.
  const sessions = useMemo(() => new Map<LabKind, LabSession>(), [runtime]);
  const session = useMemo(() => {
    let s = sessions.get(tab);
    if (!s) {
      s = new LabSession(runtime, tab);
      if (tab === initialTab && initialClasses?.length) s.presetClasses(initialClasses);
      sessions.set(tab, s);
    }
    return s;
    // initialTab/initialClasses hanya dipakai saat sesi pertama dibuat.
  }, [sessions, runtime, tab]);

  // Kamera hanya untuk tab kamera; mikrofon dimatikan saat pindah tab.
  useEffect(() => {
    const services = getAiServices(runtime);
    if (tab === "audio" || tab === "text") services.camera.disableVideo();
    if (tab !== "audio") services.microphone.stop();
    setError(null);
  }, [runtime, tab]);
  // Menutup AI Lab mematikan kamera & mikrofon yang dinyalakan untuk latihan.
  useEffect(() => () => getAiServices(runtime).stopAllDevices("user"), [runtime]);

  const requestClose = (): void => {
    const unsaved = [...sessions.values()].some((s) => (s.status === "untrained" || s.status === "stale") && s.totalSamples > 0);
    if (unsaved) setClosing(true);
    else onClose?.();
  };

  return (
    <div
      className="kal"
      data-testid="ai-lab"
      onKeyDown={(e) => {
        if (e.key === "Escape" && onClose) {
          e.stopPropagation();
          requestClose();
        }
      }}
    >
      <style>{LAB_CSS}</style>
      <div className="kal-head">
        <h2>AI Lab</h2>
        {onClose && (
          <button type="button" className="kal-btn" onClick={requestClose}>
            Tutup
          </button>
        )}
      </div>
      {closing && (
        <div className="kal-confirm" role="alertdialog" aria-label="Konfirmasi tutup AI Lab" style={{ margin: "10px 14px 0" }}>
          <span className="kal-grow">Ada contoh baru yang belum dilatih. Kalau ditutup sekarang, contoh itu hilang.</span>
          <button type="button" className="kal-btn" onClick={() => setClosing(false)}>
            Kembali
          </button>
          <button type="button" className="kal-btn kal-btn--danger" onClick={() => onClose?.()}>
            Tutup saja
          </button>
        </div>
      )}
      <div className="kal-tabs" role="tablist" aria-label="Jenis model">
        {LAB_KINDS.map((k) => (
          <button key={k} type="button" role="tab" className="kal-tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            <KindIcon kind={k} />
            {TAB_INFO[k].title}
          </button>
        ))}
      </div>
      {error && (
        <p className="kal-error" role="alert" style={{ margin: "10px 14px 0" }}>
          {error}
        </p>
      )}
      <LabTab key={tab} session={session} onError={setError} />
      <p className="kal-note" style={{ padding: "0 14px 14px" }}>
        Semua pelatihan berjalan di perangkat ini. Tidak ada foto, suara, atau teks yang dikirim ke server.
      </p>
    </div>
  );
}
