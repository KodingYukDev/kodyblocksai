/**
 * "Belajar AI": kartu tutorial + contoh project AI. Isi kartu datang dari paket AI (dimuat lazy oleh App);
 * komponen ini hanya menampilkan, membuka contoh lewat alur .sb3 biasa, dan mengarahkan ke AI Lab
 * untuk melatih model sendiri.
 */
import { useEffect, useId, useState } from "react";
import kodyUrl from "../assets/kody.svg";
import { CloseIcon } from "../shell/icons";

export interface TutorialCard {
  id: string;
  title: string;
  summary: string;
  concept: string;
  level: string;
  minutes: number;
  /** Tab AI Lab untuk melatih model (null = contoh langsung jalan tanpa melatih). */
  labTab: string | null;
  trainClasses: readonly string[];
  steps: readonly string[];
}

export interface TutorialCatalog {
  examples: readonly TutorialCard[];
  /** Bytes .sb3 contoh `id`. */
  build(id: string): Promise<Uint8Array>;
}

interface AiTutorialsProps {
  load(): Promise<TutorialCatalog>;
  /** Buka contoh sebagai project; false = dibatalkan pengguna. */
  onOpenExample(card: TutorialCard, bytes: Uint8Array): Promise<boolean>;
  onOpenLab?(tab: string, classes?: readonly string[]): void;
  onClose(): void;
}

const LAB_NAMES: Record<string, string> = {
  image: "Gambar",
  pose: "Pose",
  audio: "Suara",
  text: "Teks",
  hand: "Tangan",
  face: "Wajah",
};

export function AiTutorials({ load, onOpenExample, onOpenLab, onClose }: AiTutorialsProps) {
  const titleId = useId();
  const [catalog, setCatalog] = useState<TutorialCatalog | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<TutorialCard | null>(null);
  const [busy, setBusy] = useState(false);
  const [openedId, setOpenedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    load().then(
      (c) => alive && setCatalog(c),
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
    };
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const open = async (card: TutorialCard): Promise<void> => {
    if (!catalog || busy) return;
    setBusy(true);
    setError(null);
    try {
      const bytes = await catalog.build(card.id);
      if (await onOpenExample(card, bytes)) setOpenedId(card.id);
    } catch {
      setError("Contoh ini belum bisa dibuka. Coba lagi sebentar lagi.");
    } finally {
      setBusy(false);
    }
  };

  const labName = (tab: string): string => LAB_NAMES[tab] ?? tab;

  return (
    <div className="kb-tutorials__backdrop">
      <div className="kb-tutorials" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="kb-tutorials__header">
          <img className="kb-tutorials__mascot" src={kodyUrl} alt="" draggable={false} />
          <div className="kb-tutorials__heading">
            <h2 id={titleId}>{selected ? selected.title : "Belajar AI bersama Kody"}</h2>
            <p>{selected ? selected.concept : "Pilih proyek, latih AI-mu sendiri, lalu jalankan dengan bendera hijau."}</p>
          </div>
          <button type="button" className="kb-tutorials__close" aria-label="Tutup" onClick={onClose}>
            <CloseIcon size={18} />
          </button>
        </header>

        <div className="kb-tutorials__body">
          {failed && <p className="kb-tutorials__status">Tutorial belum bisa dimuat. Periksa koneksi lalu coba lagi.</p>}
          {!failed && !catalog && <p className="kb-tutorials__status">Memuat tutorial...</p>}

          {catalog && !selected && (
            <ul className="kb-tutorials__grid">
              {catalog.examples.map((card) => (
                <li key={card.id}>
                  <button type="button" className="kb-tutorials__card" onClick={() => setSelected(card)}>
                    <span className="kb-tutorials__card-title">{card.title}</span>
                    <span className="kb-tutorials__card-summary">{card.summary}</span>
                    <span className="kb-tutorials__tags">
                      <span className="kb-tutorials__tag">{card.level}</span>
                      <span className="kb-tutorials__tag">{card.minutes} menit</span>
                      {card.labTab && <span className="kb-tutorials__tag kb-tutorials__tag--train">Latih AI sendiri</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {catalog && selected && (
            <div className="kb-tutorials__detail">
              {selected.trainClasses.length > 0 && (
                <p className="kb-tutorials__classes">
                  Kelas yang kamu latih:{" "}
                  {selected.trainClasses.map((c) => (
                    <span key={c} className="kb-tutorials__tag">
                      {c}
                    </span>
                  ))}
                </p>
              )}
              <ol className="kb-tutorials__steps">
                {selected.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
              {error && (
                <p className="kb-tutorials__status kb-tutorials__status--error" role="alert">
                  {error}
                </p>
              )}
              {openedId === selected.id && (
                <p className="kb-tutorials__status kb-tutorials__status--ok" role="status">
                  Contoh sudah terbuka. Ikuti langkah di atas!
                </p>
              )}
            </div>
          )}
        </div>

        {selected && (
          <footer className="kb-tutorials__footer">
            <button type="button" className="kb-tutorials__button" onClick={() => setSelected(null)}>
              Kembali
            </button>
            {selected.labTab && onOpenLab && openedId === selected.id && (
              <button type="button" className="kb-tutorials__button" onClick={() => onOpenLab(selected.labTab ?? "image", selected.trainClasses)}>
                Latih AI ({labName(selected.labTab)})
              </button>
            )}
            {openedId === selected.id ? (
              <button type="button" className="kb-tutorials__button kb-tutorials__button--primary" onClick={onClose}>
                Mulai coding
              </button>
            ) : (
              <button
                type="button"
                className="kb-tutorials__button kb-tutorials__button--primary"
                disabled={busy}
                onClick={() => void open(selected)}
              >
                {busy ? "Membuka..." : "Buka contoh"}
              </button>
            )}
          </footer>
        )}
      </div>
    </div>
  );
}
