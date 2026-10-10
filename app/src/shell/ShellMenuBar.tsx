/** Menu bar 48px bergradien KodyBlocks: logo, Pengaturan, File, Edit, judul project. */
import { useState } from "react";
import logoUrl from "../assets/kodyblocks-logo.png";
import type { AppLocale } from "../app-events";
import { useT } from "./i18n";
import { GlobeIcon } from "./icons";
import { MenuDropdown } from "./MenuDropdown";
import { normalizeTitle } from "./project-file";

export interface ShellMenuBarProps {
  title: string;
  locale: AppLocale;
  turbo: boolean;
  onTitleChange(title: string): void;
  onLocaleChange(locale: AppLocale): void;
  onToggleTurbo(): void;
  onNew(): void;
  onLoad(): void;
  onSave(): void;
}

const LOCALES: { id: AppLocale; label: string }[] = [
  { id: "id", label: "Bahasa Indonesia" },
  { id: "en", label: "English" },
];

/** Judul project: diedit di tempat, dikirim saat blur / Enter (BufferedInput scratch-gui). */
function TitleInput({ title, onSubmit }: { title: string; onSubmit(title: string): void }) {
  const t = useT();
  const [draft, setDraft] = useState<string | null>(null);
  const flush = (): void => {
    if (draft !== null) onSubmit(normalizeTitle(draft));
    setDraft(null);
  };
  return (
    <input
      className="kb-menu-bar__title"
      type="text"
      aria-label={t("menu.projectTitle")}
      placeholder={t("menu.projectTitle")}
      maxLength={100}
      value={draft ?? title}
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={flush}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          flush();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          setDraft(null);
          e.currentTarget.blur();
        }
      }}
    />
  );
}

export function ShellMenuBar(props: ShellMenuBarProps) {
  const t = useT();
  return (
    <header className="kb-menu-bar" role="banner">
      <a className="kb-menu-bar__brand" href="https://kodingyuk.id" target="_blank" rel="noopener noreferrer">
        <img className="kb-menu-bar__logo" src={logoUrl} alt="KodyBlocks" draggable={false} />
      </a>
      <nav className="kb-menu-bar__menus" aria-label="Menu utama">
        <MenuDropdown
          label={<span className="kb-menu-bar__hide-narrow">{t("menu.settings")}</span>}
          ariaLabel={t("menu.settings")}
          icon={<GlobeIcon size={18} />}
          items={LOCALES.map((l, i) => ({
            key: l.id,
            label: l.label,
            checked: props.locale === l.id,
            separatorBefore: i === 0 ? false : undefined,
            onSelect: () => props.onLocaleChange(l.id),
          }))}
        />
        <MenuDropdown
          label={t("menu.file")}
          items={[
            { key: "new", label: t("menu.new"), onSelect: props.onNew },
            { key: "load", label: t("menu.load"), onSelect: props.onLoad, separatorBefore: true },
            { key: "save", label: t("menu.save"), onSelect: props.onSave },
          ]}
        />
        <MenuDropdown
          label={t("menu.edit")}
          items={[
            {
              key: "turbo",
              label: props.turbo ? t("menu.turboOff") : t("menu.turboOn"),
              onSelect: props.onToggleTurbo,
            },
          ]}
        />
      </nav>
      <div className="kb-menu-bar__title-wrap">
        <TitleInput title={props.title} onSubmit={props.onTitleChange} />
      </div>
    </header>
  );
}
