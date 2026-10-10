/** Pemilih panggung + jumlah latar + menu tambah latar (scratch-gui stage-selector). */
import { useT } from "../shell/i18n";
import { BackdropIcon, PaintIcon, SearchIcon, SurpriseIcon, UploadIcon } from "../shell/icons";
import type { AddMethod, TargetView } from "../shell/types";
import { ActionMenu } from "./ActionMenu";

interface StageSelectorProps {
  stage: TargetView | null;
  selected: boolean;
  onSelect(id: string): void;
  onAddBackdrop(method: AddMethod): void;
}

export function StageSelector({ stage, selected, onSelect, onAddBackdrop }: StageSelectorProps) {
  const t = useT();
  return (
    <div className={`kb-stage-selector${selected ? " kb-stage-selector--selected" : ""}`}>
      <button
        type="button"
        className="kb-stage-selector__button"
        aria-pressed={selected}
        aria-label={t("stageSel.stage")}
        disabled={!stage}
        onClick={() => stage && onSelect(stage.id)}
      >
        <span className="kb-stage-selector__header">{t("stageSel.stage")}</span>
        <span className="kb-stage-selector__thumb">
          {stage?.thumbnailUrl ? <img src={stage.thumbnailUrl} alt="" draggable={false} /> : <BackdropIcon size={28} />}
        </span>
        <span className="kb-stage-selector__label">{t("stageSel.backdrops")}</span>
        <span className="kb-stage-selector__count">{stage?.costumeCount ?? 0}</span>
      </button>
      <ActionMenu
        className="kb-stage-selector__actions"
        main={{ method: "library", title: t("stageSel.choose"), icon: <BackdropIcon size={22} /> }}
        more={[
          { method: "upload", title: t("stageSel.upload"), icon: <UploadIcon size={18} /> },
          { method: "surprise", title: t("stageSel.surprise"), icon: <SurpriseIcon size={18} /> },
          { method: "paint", title: t("stageSel.paint"), icon: <PaintIcon size={18} /> },
          { method: "library", title: t("stageSel.choose"), icon: <SearchIcon size={18} /> },
        ]}
        onAction={onAddBackdrop}
      />
    </div>
  );
}
