/** Info sprite: nama, x, y, tampil, ukuran, arah (scratch-gui components/sprite-info). */
import { memo } from "react";
import type { RotationStyle } from "@kody/engine";
import { useT } from "../shell/i18n";
import { EyeIcon, EyeOffIcon } from "../shell/icons";
import type { SpriteInfoPatch, TargetView } from "../shell/types";
import { BufferedInput } from "./BufferedInput";
import { DirectionPicker } from "./DirectionPicker";
import { displayNumber } from "./sprite-logic";

export interface SpriteInfoProps {
  /** Sprite yang sedang diedit; null/stage = kolom nonaktif. */
  sprite: TargetView | null;
  /** Panggung kecil: hanya nama, x, y (seperti STAGE_DISPLAY_SIZES.small). */
  compact: boolean;
  onPatch(patch: SpriteInfoPatch): void;
  onRename(name: string): void;
}

function SpriteInfoImpl({ sprite, compact, onPatch, onRename }: SpriteInfoProps) {
  const t = useT();
  const disabled = !sprite || sprite.isStage;
  const s = disabled ? null : sprite;
  const num = (k: "x" | "y" | "size" | "direction"): string | number => displayNumber(s ? s[k] : 0, disabled);
  const submitNum = (k: "x" | "y" | "size") => (v: string | number) => onPatch({ [k]: Number(v) });

  const nameInput = (
    <BufferedInput
      className="kb-sprite-info__name"
      disabled={disabled}
      aria-label={t("sprite.name")}
      placeholder={t("sprite.name")}
      value={s ? s.name : ""}
      onSubmit={(v) => onRename(String(v))}
    />
  );
  const xy = (
    <>
      <label className="kb-field">
        <span className="kb-field__label">x</span>
        <BufferedInput small disabled={disabled} aria-label="x" placeholder="x" value={num("x")} onSubmit={submitNum("x")} />
      </label>
      <label className="kb-field">
        <span className="kb-field__label">y</span>
        <BufferedInput small disabled={disabled} aria-label="y" placeholder="y" value={num("y")} onSubmit={submitNum("y")} />
      </label>
    </>
  );

  if (compact) {
    return (
      <div className="kb-sprite-info kb-sprite-info--compact">
        <div className="kb-sprite-info__row">{nameInput}</div>
        <div className="kb-sprite-info__row">{xy}</div>
      </div>
    );
  }

  return (
    <div className="kb-sprite-info">
      <div className="kb-sprite-info__row">
        <label className="kb-field kb-field--grow">
          <span className="kb-field__label">{t("sprite.sprite")}</span>
          {nameInput}
        </label>
        {xy}
      </div>
      <div className="kb-sprite-info__row">
        <div className="kb-field">
          <span className="kb-field__label kb-field__label--secondary">{t("sprite.show")}</span>
          <div className="kb-toggle-buttons" role="group" aria-label={t("sprite.show")}>
            <button
              type="button"
              disabled={disabled}
              className={`kb-toggle-button${s?.visible ? " kb-toggle-button--selected" : ""}`}
              aria-pressed={!!s?.visible}
              aria-label={t("sprite.showAction")}
              title={t("sprite.showAction")}
              onClick={() => onPatch({ visible: true })}
            >
              <EyeIcon size={18} />
            </button>
            <button
              type="button"
              disabled={disabled}
              className={`kb-toggle-button${s && !s.visible ? " kb-toggle-button--selected" : ""}`}
              aria-pressed={!!s && !s.visible}
              aria-label={t("sprite.hideAction")}
              title={t("sprite.hideAction")}
              onClick={() => onPatch({ visible: false })}
            >
              <EyeOffIcon size={18} />
            </button>
          </div>
        </div>
        <label className="kb-field">
          <span className="kb-field__label kb-field__label--secondary">{t("sprite.size")}</span>
          <BufferedInput small disabled={disabled} aria-label={t("sprite.size")} value={num("size")} onSubmit={submitNum("size")} />
        </label>
        <DirectionPicker
          disabled={disabled}
          direction={s ? Math.round(s.direction) : 0}
          rotationStyle={s?.rotationStyle ?? "all around"}
          onChangeDirection={(direction) => onPatch({ direction })}
          onChangeRotationStyle={(rotationStyle: RotationStyle) => onPatch({ rotationStyle })}
        />
      </div>
    </div>
  );
}

/** shouldComponentUpdate scratch-gui: hanya render ulang bila nilai bulatnya berubah. */
export const SpriteInfo = memo(SpriteInfoImpl, (a, b) => {
  if (a.compact !== b.compact || a.onPatch !== b.onPatch || a.onRename !== b.onRename) return false;
  const x = a.sprite;
  const y = b.sprite;
  if (x === y) return true;
  if (!x || !y) return false;
  return (
    x.id === y.id &&
    x.isStage === y.isStage &&
    x.name === y.name &&
    x.visible === y.visible &&
    x.rotationStyle === y.rotationStyle &&
    Math.round(x.direction) === Math.round(y.direction) &&
    Math.round(x.size) === Math.round(y.size) &&
    Math.round(x.x) === Math.round(y.x) &&
    Math.round(x.y) === Math.round(y.y)
  );
});
