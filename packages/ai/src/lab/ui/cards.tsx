/** Kartu kelas (nama, contoh, cara menambah contoh) dan panel Latih untuk AI Lab. */
import { useRef, useState } from "react";
import { KIND_NAMES, MODEL_FILE_EXTENSION } from "../../classifier/storage";
import { AI_LIMITS } from "../../security";
import type { AiServices } from "../../services";
import { MIN_SAMPLES } from "../lab-session";
import type { LabClass, LabSession } from "../lab-session";
import { MAX_UPLOAD_FILES, captureFromCamera, captureFromFile, recordAudioSamples } from "../sources";
import { HoldButton, Progress, SampleThumb, colourOf, downloadText, useSession } from "./parts";

export interface CardContext {
  services: AiServices;
  session: LabSession;
  /** Laporkan pesan ramah ke pengguna (null = hapus). */
  report: (msg: string | null) => void;
  /** true selama perekaman/pengambilan berjalan (pratinjau dijeda). */
  setBusy: (busy: boolean) => void;
}

function ClassName({ ctx, cls }: { ctx: CardContext; cls: LabClass }): React.JSX.Element {
  const [draft, setDraft] = useState(cls.name);
  const locked = ctx.session.isLocked(cls);
  const commit = (): void => {
    if (draft === cls.name) return;
    try {
      setDraft(ctx.session.renameClass(cls.id, draft));
      ctx.report(null);
    } catch (err) {
      ctx.report((err as Error).message);
      setDraft(cls.name);
    }
  };
  return (
    <input
      className="kal-input kal-name kal-grow"
      value={locked ? cls.name : draft}
      readOnly={locked}
      maxLength={AI_LIMITS.maxLabelLength}
      aria-label="Nama kelas"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setDraft(cls.name);
      }}
    />
  );
}

function CameraAdders({ ctx, cls }: { ctx: CardContext; cls: LabClass }): React.JSX.Element {
  const { session, services } = ctx;
  const kind = session.kind as "image" | "pose" | "hand";
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const capture = async (): Promise<boolean> => {
    ctx.setBusy(true);
    try {
      const got = await captureFromCamera(services, kind);
      session.addSample(cls.id, got);
      ctx.report(null);
      return true;
    } catch (err) {
      ctx.report((err as Error).message);
      return false;
    } finally {
      ctx.setBusy(false);
    }
  };
  const upload = async (files: FileList | null): Promise<void> => {
    const list = [...(files ?? [])].slice(0, MAX_UPLOAD_FILES);
    if (list.length === 0) return;
    setUploading(true);
    ctx.setBusy(true);
    const errors: string[] = [];
    try {
      for (const f of list) {
        try {
          session.addSample(cls.id, await captureFromFile(services, f));
        } catch (err) {
          errors.push((err as Error).message);
        }
      }
    } finally {
      setUploading(false);
      ctx.setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
    ctx.report(errors.length ? errors.slice(0, 3).join(" ") : null);
  };
  return (
    <div className="kal-row">
      <HoldButton label="Tahan untuk merekam" activeLabel="Merekam..." action={capture} />
      {kind === "image" && (
        <>
          <button type="button" className="kal-btn" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? "Membaca..." : "Unggah gambar"}
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => void upload(e.target.files)} />
        </>
      )}
    </div>
  );
}

function AudioAdder({ ctx, cls }: { ctx: CardContext; cls: LabClass }): React.JSX.Element {
  const { session, services } = ctx;
  const [level, setLevel] = useState<number | null>(null);
  const seconds = session.isLocked(cls) ? 5 : 2;
  const record = async (): Promise<void> => {
    ctx.setBusy(true);
    ctx.report(null);
    setLevel(0);
    try {
      const windows = await recordAudioSamples(services, { seconds, onLevel: setLevel });
      for (const f of windows) session.addSample(cls.id, { features: f });
    } catch (err) {
      ctx.report((err as Error).message);
    } finally {
      setLevel(null);
      ctx.setBusy(false);
    }
  };
  return (
    <div className="kal-col">
      <div className="kal-row">
        <button
          type="button"
          className="kal-btn kal-btn--main"
          disabled={level !== null}
          onClick={() => {
            services.unlockAudio();
            void record();
          }}
        >
          {level !== null ? "Merekam..." : `Rekam ${seconds} detik`}
        </button>
        {session.isLocked(cls) && <span className="kal-note">Rekam suara ruangan biasa (tanpa bicara).</span>}
      </div>
      {level !== null && (
        <div className="kal-meter" aria-label="Level suara">
          <div style={{ width: `${Math.round(Math.min(1, level * 2) * 100)}%` }} />
        </div>
      )}
    </div>
  );
}

function TextAdder({ ctx, cls }: { ctx: CardContext; cls: LabClass }): React.JSX.Element {
  const [text, setText] = useState("");
  return (
    <form
      className="kal-row"
      onSubmit={(e) => {
        e.preventDefault();
        try {
          ctx.session.addSample(cls.id, { text });
          setText("");
          ctx.report(null);
        } catch (err) {
          ctx.report((err as Error).message);
        }
      }}
    >
      <input
        className="kal-input kal-grow"
        value={text}
        maxLength={500}
        placeholder="Tulis contoh kalimat"
        aria-label={`Contoh kalimat untuk ${cls.name}`}
        onChange={(e) => setText(e.target.value)}
      />
      <button type="submit" className="kal-btn kal-btn--main" disabled={!text.trim()}>
        Tambah
      </button>
    </form>
  );
}

export function ClassCard({ ctx, cls, index }: { ctx: CardContext; cls: LabClass; index: number }): React.JSX.Element {
  const { session } = ctx;
  const kind = session.kind;
  const [confirm, setConfirm] = useState(false);
  const n = session.count(cls);
  const min = MIN_SAMPLES[kind];
  return (
    <section className="kal-card" aria-label={`Kelas ${cls.name}`}>
      <div className="kal-row">
        <span className="kal-dot" style={{ background: colourOf(index) }} aria-hidden="true" />
        <ClassName key={cls.name} ctx={ctx} cls={cls} />
        <span className="kal-count">
          {n} contoh{n < min ? ` (min ${min})` : ""}
        </span>
        {!session.isLocked(cls) &&
          (confirm ? (
            <>
              <button type="button" className="kal-btn kal-btn--danger" onClick={() => session.removeClass(cls.id)}>
                Ya, hapus
              </button>
              <button type="button" className="kal-btn" onClick={() => setConfirm(false)}>
                Batal
              </button>
            </>
          ) : (
            <button type="button" className="kal-btn kal-btn--icon" aria-label={`Hapus kelas ${cls.name}`} title="Hapus kelas" onClick={() => setConfirm(true)}>
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path d="M5 7h14M10 7V4h4v3m-7 0l1 13h8l1-13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              </svg>
            </button>
          ))}
      </div>
      {kind === "text" ? <TextAdder ctx={ctx} cls={cls} /> : kind === "audio" ? <AudioAdder ctx={ctx} cls={cls} /> : <CameraAdders ctx={ctx} cls={cls} />}
      {kind === "text" ? (
        <div className="kal-chips">
          {cls.savedCount > 0 && <span className="kal-chip"><span>{cls.savedCount} contoh tersimpan</span></span>}
          {cls.samples.map((s) => (
            <span className="kal-chip" key={s.id}>
              <span title={s.text}>{s.text}</span>
              <button type="button" aria-label="Hapus contoh ini" onClick={() => session.removeSample(cls.id, s.id)}>
                ×
              </button>
            </span>
          ))}
        </div>
      ) : (
        cls.samples.length > 0 && (
          <div className="kal-samples">
            {cls.samples.map((s) => (
              <SampleThumb key={s.id} kind={kind} sample={s} onRemove={() => session.removeSample(cls.id, s.id)} />
            ))}
          </div>
        )
      )}
      {n > 0 && (
        <div className="kal-row">
          <button type="button" className="kal-btn" onClick={() => session.clearSamples(cls.id)}>
            Hapus semua contoh
          </button>
        </div>
      )}
    </section>
  );
}

const STATUS_TEXT = {
  empty: ["Belum ada contoh", ""],
  untrained: ["Belum dilatih", "kal-pill--warn"],
  training: ["Sedang belajar...", "kal-pill--warn"],
  trained: ["Model siap dipakai di blok", "kal-pill--ok"],
  stale: ["Ada perubahan, latih lagi", "kal-pill--warn"],
} as const;

export function TrainPanel({ ctx }: { ctx: CardContext }): React.JSX.Element {
  const session = useSession(ctx.session);
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const problems = session.problems();
  const [statusText, statusClass] = STATUS_TEXT[session.status];
  const report = session.report;
  const weak = report ? Object.entries(report.perClass).filter(([, v]) => v !== null && v < 0.7).map(([k]) => k) : [];
  const train = (): void => {
    ctx.report(null);
    session.train().catch((err: Error) => ctx.report(err.message));
  };
  const importFile = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    try {
      if (file.size > AI_LIMITS.maxModelFileBytes) throw new Error("File model terlalu besar.");
      session.importFile(await file.text());
      ctx.report(null);
    } catch (err) {
      ctx.report((err as Error).message);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  return (
    <div className="kal-card">
      <div className="kal-row">
        <h3 className="kal-grow">Latih model</h3>
        <span className={`kal-pill ${statusClass}`}>{statusText}</span>
      </div>
      {session.status === "training" ? (
        <Progress value={session.progress} label="Progres pelatihan" />
      ) : (
        problems.length > 0 && (
          <ul className="kal-list">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )
      )}
      <button type="button" className="kal-btn kal-btn--main" disabled={!session.canTrain} onClick={train}>
        {session.isTrained ? "Latih ulang" : "Latih model"}
      </button>
      {report && session.status === "trained" && (
        <p className="kal-note">
          {report.accuracy !== null
            ? `Perkiraan ketepatan: ${Math.round(report.accuracy * 100)}% (AI menebak tiap contoh tanpa melihat contoh itu).`
            : "Model siap. Coba uji dengan contoh baru."}
          {weak.length > 0 ? ` AI masih bingung dengan ${weak.join(", ")} - tambah contoh yang lebih beragam.` : ""}
        </p>
      )}
      {session.kind === "image" && (
        <label className="kal-check">
          <input type="checkbox" checked={session.includeThumbnails} onChange={(e) => session.setIncludeThumbnails(e.target.checked)} />
          <span>Simpan foto kecil di file project. Tidak disarankan: foto ikut terbagi saat project dibagikan.</span>
        </label>
      )}
      <div className="kal-row">
        <button
          type="button"
          className="kal-btn"
          disabled={!session.trainedModel}
          onClick={() => {
            try {
              downloadText(`model-${session.kind}${MODEL_FILE_EXTENSION}`, session.exportFile());
            } catch (err) {
              ctx.report((err as Error).message);
            }
          }}
        >
          Simpan file model
        </button>
        <button type="button" className="kal-btn" onClick={() => fileRef.current?.click()}>
          Buka file model
        </button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => void importFile(e.target.files?.[0])} />
      </div>
      {confirmReset ? (
        <div className="kal-confirm">
          <span className="kal-grow">Hapus semua kelas, contoh, dan model {KIND_NAMES[session.kind]} dari project?</span>
          <button
            type="button"
            className="kal-btn kal-btn--danger"
            onClick={() => {
              session.resetAll();
              setConfirmReset(false);
            }}
          >
            Hapus
          </button>
          <button type="button" className="kal-btn" onClick={() => setConfirmReset(false)}>
            Batal
          </button>
        </div>
      ) : (
        <button type="button" className="kal-btn kal-btn--danger" onClick={() => setConfirmReset(true)}>
          Mulai dari awal
        </button>
      )}
    </div>
  );
}
