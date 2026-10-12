/** Tab Kode / Kostum (Latar untuk stage) / Suara bergaya scratch-gui. */
import { useRef, type KeyboardEvent, type ReactNode } from "react";
import type { EditorTab } from "../app-events";
import { useT } from "./i18n";
import { BrushIcon, CatIcon, CodeIcon, SoundIcon } from "./icons";

/** Tab shell: tiga tab editor + tab "Sprite" (panel sprite) di layar sempit. */
export type ShellTab = EditorTab | "sprites";

interface EditorTabsProps {
  active: ShellTab;
  isStage: boolean;
  onChange(tab: ShellTab): void;
  panels: Record<EditorTab, ReactNode>;
  /** Isi tab "Sprite"; undefined = tab tidak ditampilkan. */
  spritesPanel?: ReactNode;
}

const BASE_ORDER: ShellTab[] = ["code", "costumes", "sounds"];

export function EditorTabs({ active, isStage, onChange, panels, spritesPanel }: EditorTabsProps) {
  const t = useT();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const ORDER: ShellTab[] = spritesPanel === undefined ? BASE_ORDER : [...BASE_ORDER, "sprites"];
  const allPanels: Record<ShellTab, ReactNode> = { ...panels, sprites: spritesPanel ?? null };
  const labels: Record<ShellTab, string> = {
    code: t("tab.code"),
    costumes: isStage ? t("tab.backdrops") : t("tab.costumes"),
    sounds: t("tab.sounds"),
    sprites: t("tab.sprites"),
  };
  const icons: Record<ShellTab, ReactNode> = {
    code: <CodeIcon size={16} />,
    costumes: <BrushIcon size={16} />,
    sounds: <SoundIcon size={16} />,
    sprites: <CatIcon size={16} />,
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    const i = ORDER.indexOf(active);
    let next: ShellTab | undefined;
    if (e.key === "ArrowRight") next = ORDER[(i + 1) % ORDER.length];
    else if (e.key === "ArrowLeft") next = ORDER[(i - 1 + ORDER.length) % ORDER.length];
    else if (e.key === "Home") next = ORDER[0];
    else if (e.key === "End") next = ORDER[ORDER.length - 1];
    if (!next) return;
    e.preventDefault();
    onChange(next);
    refs.current[next]?.focus();
  };
  return (
    <div className="kb-editor-tabs">
      <div className="kb-tabs" role="tablist" aria-label="Editor" onKeyDown={onKeyDown}>
        {ORDER.map((tab) => (
          <button
            key={tab}
            ref={(el) => {
              refs.current[tab] = el;
            }}
            id={`kb-tab-${tab}`}
            type="button"
            role="tab"
            aria-selected={active === tab}
            aria-controls={`kb-tabpanel-${tab}`}
            tabIndex={active === tab ? 0 : -1}
            className={`kb-tab${active === tab ? " kb-tab--active" : ""}`}
            onClick={() => onChange(tab)}
          >
            {icons[tab]}
            <span>{labels[tab]}</span>
          </button>
        ))}
      </div>
      {ORDER.map((tab) => (
        <div
          key={tab}
          id={`kb-tabpanel-${tab}`}
          role="tabpanel"
          aria-labelledby={`kb-tab-${tab}`}
          className={`kb-tabpanel${active === tab ? "" : " kb-tabpanel--hidden"}`}
          aria-hidden={active !== tab}
        >
          {/* Workspace kode tetap terpasang (seperti scratch-gui) agar state editor tidak hilang. */}
          {tab === "code" || active === tab ? allPanels[tab] : null}
        </div>
      ))}
    </div>
  );
}
