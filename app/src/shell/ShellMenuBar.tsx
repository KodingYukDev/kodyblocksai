/** Menu bar 48px bergradien KodyBlocks: logo, File, Edit, Belajar AI, judul project. */
import { useState } from "react";
import logoUrl from "../assets/kodyblocks-logo.png";
import { useT } from "./i18n";
import { FileIcon, SparkleIcon } from "./icons";
import { MenuDropdown, type DropdownItem } from "./MenuDropdown";
import { normalizeTitle } from "./project-file";

export interface ShellMenuBarProps {
  title: string;
  turbo: boolean;
  /** Layar sempit: label menu diringkas. */
  compact?: boolean;
  onTitleChange(title: string): void;
  onToggleTurbo(): void;
  onNew(): void;
  onLoad(): void;
  onSave(): void;
  onOpenTutorials?(): void;
  onOpenAiLab?(): void;
}

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
      autoComplete="off"
      autoCorrect="off"
      enterKeyHint="done"
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
  const learnItems: DropdownItem[] = [];
  if (props.onOpenTutorials) learnItems.push({ key: "tutorials", label: t("menu.tutorials"), onSelect: props.onOpenTutorials });
  if (props.onOpenAiLab) learnItems.push({ key: "ailab", label: t("menu.aiLab"), onSelect: props.onOpenAiLab });
  return (
    <header className="kb-menu-bar" role="banner">
      <a className="kb-menu-bar__brand" href="https://kodingyuk.id" target="_blank" rel="noopener noreferrer">
        <img className="kb-menu-bar__logo" src={logoUrl} alt="KodyBlocks" draggable={false} />
      </a>
      <nav className="kb-menu-bar__menus" aria-label="Menu utama">
        <MenuDropdown
          label={props.compact ? null : t("menu.file")}
          ariaLabel={t("menu.file")}
          icon={props.compact ? <FileIcon size={18} /> : undefined}
          items={[
            { key: "new", label: t("menu.new"), onSelect: props.onNew },
            { key: "load", label: t("menu.load.short"), onSelect: props.onLoad, separatorBefore: true },
            { key: "save", label: t("menu.save.short"), onSelect: props.onSave },
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
        {learnItems.length > 0 && (
          <MenuDropdown
            label={props.compact ? null : t("menu.learn")}
            ariaLabel={t("menu.learn")}
            icon={<SparkleIcon size={18} />}
            items={learnItems}
            highlight
          />
        )}
      </nav>
      <div className="kb-menu-bar__title-wrap">
        <TitleInput title={props.title} onSubmit={props.onTitleChange} />
      </div>
    </header>
  );
}
