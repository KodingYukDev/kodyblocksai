/** Dialog "ubah rentang penggeser" (scratch-gui slider-prompt). */
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useT } from "../../shell/i18n";
import { parseSliderPrompt, sliderPromptInitial } from "./monitor-adapter";

interface SliderPromptProps {
  min: number;
  max: number;
  isDiscrete: boolean;
  onOk(min: number, max: number, isDiscrete: boolean): void;
  onCancel(): void;
}

export function SliderPrompt(props: SliderPromptProps) {
  const t = useT();
  const init = sliderPromptInitial(props.min, props.max, props.isDiscrete);
  const [minText, setMin] = useState(init.minText);
  const [maxText, setMax] = useState(init.maxText);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => first.current?.focus(), []);

  const ok = (): void => {
    const parsed = parseSliderPrompt(minText, maxText);
    if (!parsed) props.onCancel();
    else props.onOk(parsed.min, parsed.max, parsed.isDiscrete);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Enter") ok();
    else if (e.key === "Escape") props.onCancel();
  };

  return createPortal(
    <div className="kb-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && props.onCancel()}>
      <div className="kb-modal" role="dialog" aria-modal="true" aria-labelledby="kb-slider-title" onKeyDown={onKey}>
        <div className="kb-modal__header" id="kb-slider-title">
          {t("slider.title")}
        </div>
        <div className="kb-modal__body">
          <label className="kb-modal__field">
            <span>{t("slider.min")}</span>
            <input ref={first} type="text" inputMode="decimal" value={minText} onChange={(e) => setMin(e.target.value)} />
          </label>
          <label className="kb-modal__field">
            <span>{t("slider.max")}</span>
            <input type="text" inputMode="decimal" value={maxText} onChange={(e) => setMax(e.target.value)} />
          </label>
          <div className="kb-modal__buttons">
            <button type="button" className="kb-button" onClick={props.onCancel}>
              {t("slider.cancel")}
            </button>
            <button type="button" className="kb-button kb-button--primary" onClick={ok}>
              {t("slider.ok")}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
