/** Galeri ekstensi (padanan scratch-gui extension-library): Pena, Musik, dan ekstensi AI lokal. */
import { useEffect } from "react";
import type { AppExtensionEntry } from "../host/extensions";

export interface ExtensionLibraryProps {
  entries: readonly AppExtensionEntry[];
  isLoaded(id: string): boolean;
  onSelect(id: string): void;
  onClose(): void;
  locale: "id" | "en";
}

const REQUIRES_LABEL: Record<string, { id: string; en: string }> = {
  camera: { id: "Kamera", en: "Camera" },
  microphone: { id: "Mikrofon", en: "Microphone" },
  internet: { id: "Internet", en: "Internet" },
};

export function ExtensionLibrary({ entries, isLoaded, onSelect, onClose, locale }: ExtensionLibraryProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const title = locale === "en" ? "Choose an Extension" : "Pilih Ekstensi";
  return (
    <div className="kb-extlib" role="dialog" aria-modal="true" aria-label={title}>
      <div className="kb-extlib__header">
        <button type="button" className="kb-extlib__back" onClick={onClose}>
          {locale === "en" ? "Back" : "Kembali"}
        </button>
        <h2>{title}</h2>
      </div>
      <div className="kb-extlib__grid">
        {entries.map((e) => {
          const loaded = isLoaded(e.id);
          return (
            <button
              key={e.id}
              type="button"
              className={`kb-extlib__card kb-extlib__card--${e.group}${loaded ? " kb-extlib__card--loaded" : ""}`}
              onClick={() => onSelect(e.id)}
              data-extension-id={e.id}
            >
              <span className="kb-extlib__banner" aria-hidden="true">
                {e.group === "ai" ? "AI" : e.id === "pen" ? "✎" : "♫"}
              </span>
              <span className="kb-extlib__name">{e.name}</span>
              <span className="kb-extlib__desc">{e.description}</span>
              {e.requires && e.requires.length > 0 ? (
                <span className="kb-extlib__req">{e.requires.map((r) => REQUIRES_LABEL[r]?.[locale] ?? r).join(" · ")}</span>
              ) : null}
              {loaded ? <span className="kb-extlib__badge">{locale === "en" ? "Added" : "Sudah ditambah"}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
