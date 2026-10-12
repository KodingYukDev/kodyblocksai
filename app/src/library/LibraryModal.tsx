/**
 * Modal pustaka (sprite / kostum / latar / suara) ala scratch-gui LibraryComponent: filter
 * kategori, pencarian, grid kartu, pratinjau animasi costume saat kursor di atas sprite, dan
 * pratinjau suara saat kursor di atas kartu suara.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { IconPlay, IconSearch, IconSound } from "../costume-tab/icons";
import type { TabLocale, TabStrings } from "../costume-tab/strings";
import { entryName, previewAsset } from "./library-actions";
import type { LibraryLoader } from "./library-loader";
import { filterLibrary } from "./library-search";
import type { LibraryCatalog, LibraryEntry, LibraryKind } from "./library-types";
import "../costume-tab/asset-tab.css";
import "./library.css";

export interface LibraryModalProps {
  kind: LibraryKind;
  loader: LibraryLoader;
  strings: TabStrings;
  locale?: TabLocale;
  title: string;
  onSelect(entry: LibraryEntry): void;
  onClose(): void;
}

function entriesOf(catalog: LibraryCatalog, kind: LibraryKind): LibraryEntry[] {
  switch (kind) {
    case "sprite":
      return catalog.sprites;
    case "costume":
      return catalog.costumes;
    case "backdrop":
      return catalog.backdrops;
    case "sound":
      return catalog.sounds;
  }
}

export function LibraryModal({ kind, loader, strings: t, locale = "id", title, onSelect, onClose }: LibraryModalProps) {
  const [catalog, setCatalog] = useState<LibraryCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [category, setCategory] = useState("all");
  const [hover, setHover] = useState<string | null>(null);
  const [frame, setFrame] = useState(0);
  const audio = useRef<HTMLAudioElement | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    loader
      .loadCatalog()
      .then((c) => alive && setCatalog(c))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)));
    // Di tablet/HP fokus otomatis memunculkan keyboard layar yang menutupi separuh pustaka.
    const finePointer = typeof window.matchMedia === "function" && window.matchMedia("(pointer: fine)").matches;
    if (finePointer) searchRef.current?.focus();
    return () => {
      alive = false;
    };
  }, [loader]);

  // Animasi costume sprite yang sedang disorot (scratch-gui: ganti tiap 0.5 detik).
  useEffect(() => {
    if (!hover || kind !== "sprite") return;
    setFrame(0);
    const id = window.setInterval(() => setFrame((f) => f + 1), 500);
    return () => window.clearInterval(id);
  }, [hover, kind]);

  useEffect(() => () => audio.current?.pause(), []);

  const entries = useMemo(() => (catalog ? entriesOf(catalog, kind) : []), [catalog, kind]);
  const shown = useMemo(() => filterLibrary(entries, { text, category }), [entries, text, category]);
  const cats = catalog ? catalog.categories[kind === "costume" ? "sprite" : kind] : [];

  const playPreview = (entry: LibraryEntry): void => {
    if (entry.kind !== "sound") return;
    audio.current?.pause();
    const a = new Audio(loader.assetUrl(entry.sound.md5ext));
    audio.current = a;
    void a.play().catch(() => undefined);
  };

  return (
    <div className="kb-amodal kb-library" role="dialog" aria-modal="true" aria-label={title} onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div className="kb-amodal__box kb-library__box">
        <header className="kb-amodal__header kb-library__header">
          <button type="button" className="kb-library__back" onClick={onClose}>
            {t.back}
          </button>
          <h2>{title}</h2>
        </header>
        <div className="kb-library__filters">
          <label className="kb-library__search">
            <IconSearch />
            <input ref={searchRef} type="search" placeholder={t.search} aria-label={t.search} value={text} onChange={(e) => setText(e.currentTarget.value)} />
          </label>
          <div className="kb-library__cats" role="tablist" aria-label="Kategori">
            {[{ id: "all", name: t.all, nameEn: t.all }, ...cats].map((c) => (
              <button key={c.id} type="button" role="tab" aria-selected={category === c.id} className={`kb-library__cat${category === c.id ? " kb-library__cat--active" : ""}`} onClick={() => setCategory(c.id)}>
                {locale === "en" ? c.nameEn : c.name}
              </button>
            ))}
          </div>
        </div>
        <div className="kb-library__grid" role="list">
          {error ? <p className="kb-library__msg">{error}</p> : null}
          {!catalog && !error ? <p className="kb-library__msg">{t.loading}</p> : null}
          {catalog && shown.length === 0 ? <p className="kb-library__msg">{t.empty}</p> : null}
          {shown.map((entry) => {
            const md5ext = previewAsset(entry, hover === entry.id ? frame : 0);
            return (
              <div role="listitem" key={entry.id}>
                <button
                  type="button"
                  className={`kb-library__card kb-library__card--${kind}`}
                  onClick={() => onSelect(entry)}
                  onPointerEnter={(e) => {
                    // Sentuhan: tidak ada "hover"; ketukan langsung memilih, pratinjau lewat tombol putar.
                    if (e.pointerType !== "mouse") return;
                    setHover(entry.id);
                    playPreview(entry);
                  }}
                  onPointerLeave={(e) => {
                    if (e.pointerType !== "mouse") return;
                    setHover(null);
                    audio.current?.pause();
                  }}
                  onFocus={() => setHover(entry.id)}
                  onBlur={() => setHover(null)}
                >
                  <span className="kb-library__thumb">
                    {md5ext ? <img src={loader.assetUrl(md5ext)} alt="" loading="lazy" draggable={false} /> : <IconSound />}
                  </span>
                  <span className="kb-library__name">{entryName(entry, locale)}</span>
                </button>
                {entry.kind === "sound" ? (
                  <button type="button" className="kb-library__play" aria-label={`${t.play} ${entryName(entry, locale)}`} onClick={() => playPreview(entry)}>
                    <IconPlay />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
