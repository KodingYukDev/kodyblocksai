/** Header panggung: bendera hijau, stop, indikator turbo, toggle panggung kecil/normal/layar penuh. */
import type { StageSizeMode } from "../app-events";
import { useT } from "../shell/i18n";
import {
  FullscreenIcon,
  GreenFlagIcon,
  LargeStageIcon,
  SmallStageIcon,
  StopIcon,
  UnfullscreenIcon,
} from "../shell/icons";

export interface StageHeaderProps {
  running: boolean;
  turbo: boolean;
  sizeMode: StageSizeMode;
  /** Tombol kecil/normal disembunyikan di tata letak tumpuk (layar kecil). */
  showSizeToggle: boolean;
  onGreenFlag(): void;
  onStop(): void;
  onSizeMode(mode: StageSizeMode): void;
}

export function StageHeader(props: StageHeaderProps) {
  const t = useT();
  const full = props.sizeMode === "fullscreen";
  return (
    <div className={`kb-stage-header${full ? " kb-stage-header--fullscreen" : ""}`}>
      <div className="kb-stage-header__controls">
        <button
          type="button"
          className={`kb-flag${props.running ? " kb-flag--active" : ""}`}
          aria-label={t("stage.greenFlag")}
          title={t("stage.greenFlag")}
          onClick={props.onGreenFlag}
        >
          <GreenFlagIcon size={24} />
        </button>
        <button
          type="button"
          className={`kb-stop${props.running ? " kb-stop--active" : ""}`}
          aria-label={t("stage.stop")}
          title={t("stage.stop")}
          onClick={props.onStop}
        >
          <StopIcon size={22} />
        </button>
        {props.turbo && (
          <span className="kb-turbo-indicator" role="status">
            <span aria-hidden="true">{"⚡"}</span> {t("stage.turbo")}
          </span>
        )}
      </div>
      <div className="kb-stage-header__sizes">
        {!full && props.showSizeToggle && (
          <div className="kb-stage-header__toggle" role="group" aria-label="Ukuran panggung">
            <button
              type="button"
              className={`kb-stage-size${props.sizeMode === "small" ? " kb-stage-size--selected" : ""}`}
              aria-pressed={props.sizeMode === "small"}
              aria-label={t("stage.small")}
              title={t("stage.small")}
              onClick={() => props.onSizeMode("small")}
            >
              <SmallStageIcon size={18} />
            </button>
            <button
              type="button"
              className={`kb-stage-size${props.sizeMode === "normal" ? " kb-stage-size--selected" : ""}`}
              aria-pressed={props.sizeMode === "normal"}
              aria-label={t("stage.normal")}
              title={t("stage.normal")}
              onClick={() => props.onSizeMode("normal")}
            >
              <LargeStageIcon size={18} />
            </button>
          </div>
        )}
        <button
          type="button"
          className="kb-stage-size kb-stage-size--fullscreen"
          aria-label={full ? t("stage.exitFullscreen") : t("stage.fullscreen")}
          title={full ? t("stage.exitFullscreen") : t("stage.fullscreen")}
          onClick={() => props.onSizeMode(full ? "normal" : "fullscreen")}
        >
          {full ? <UnfullscreenIcon size={18} /> : <FullscreenIcon size={18} />}
        </button>
      </div>
    </div>
  );
}
