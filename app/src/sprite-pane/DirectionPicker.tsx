/** Kolom arah + popover dial dan gaya rotasi (scratch-gui direction-picker & dial). */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { RotationStyle } from "@kody/engine";
import { useDismiss } from "../shell/hooks";
import { useT } from "../shell/i18n";
import { AllAroundIcon, DontRotateIcon, LeftRightIcon } from "../shell/icons";
import { BufferedInput } from "./BufferedInput";
import { dialHandlePosition, directionToPoint, gaugePath } from "./sprite-logic";

const DIAL_RADIUS = 56;

interface DialProps {
  direction: number;
  onChange(direction: number): void;
}

/** Dial arah: pegangan diseret; offset awal disimpan agar tidak meloncat (dial.jsx). */
export function Dial({ direction, onChange }: DialProps) {
  const container = useRef<HTMLDivElement>(null);
  const handle = useRef<HTMLDivElement>(null);
  const directionRef = useRef(direction);
  directionRef.current = direction;

  useEffect(() => {
    const el = handle.current;
    if (!el) return;
    const toDirection = (clientX: number, clientY: number): number => {
      const box = container.current?.getBoundingClientRect();
      if (!box) return directionRef.current;
      return directionToPoint(clientX, clientY, box.left + box.width / 2, box.top + box.height / 2);
    };
    const point = (e: MouseEvent | TouchEvent): { x: number; y: number } | null => {
      if ("touches" in e) {
        const t = e.touches[0] ?? e.changedTouches[0];
        return t ? { x: t.clientX, y: t.clientY } : null;
      }
      return { x: e.clientX, y: e.clientY };
    };
    let offset = 0;
    const move = (e: MouseEvent | TouchEvent): void => {
      const p = point(e);
      if (!p) return;
      onChange(toDirection(p.x, p.y) + offset);
      e.preventDefault();
    };
    const up = (): void => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", up);
    };
    const down = (e: MouseEvent | TouchEvent): void => {
      const p = point(e);
      if (!p) return;
      offset = directionRef.current - toDirection(p.x, p.y);
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
      window.addEventListener("touchmove", move, { passive: false });
      window.addEventListener("touchend", up);
      e.preventDefault();
    };
    el.addEventListener("mousedown", down);
    el.addEventListener("touchstart", down, { passive: false });
    return () => {
      up();
      el.removeEventListener("mousedown", down);
      el.removeEventListener("touchstart", down);
    };
  }, [onChange]);

  const pos = dialHandlePosition(DIAL_RADIUS, direction);
  const size = DIAL_RADIUS * 2;
  return (
    <div className="kb-dial" ref={container} style={{ width: size, height: size }}>
      <svg className="kb-dial__face" width={size} height={size} aria-hidden="true">
        <circle cx={DIAL_RADIUS} cy={DIAL_RADIUS} r={DIAL_RADIUS - 1} className="kb-dial__circle" />
        <line x1={DIAL_RADIUS} y1={DIAL_RADIUS} x2={DIAL_RADIUS} y2={4} className="kb-dial__tick" />
        <path d={gaugePath(DIAL_RADIUS, direction)} className="kb-dial__gauge" />
        <line
          x1={DIAL_RADIUS}
          y1={DIAL_RADIUS}
          x2={pos.left}
          y2={pos.top}
          className="kb-dial__needle"
        />
      </svg>
      <div
        ref={handle}
        className="kb-dial__handle"
        role="slider"
        aria-label="Arah"
        aria-valuemin={-179}
        aria-valuemax={180}
        aria-valuenow={Math.round(direction)}
        tabIndex={0}
        style={{ top: pos.top, left: pos.left, transform: `translate(-50%, -50%) rotate(${direction}deg)` }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowUp") onChange(direction + 15);
          else if (e.key === "ArrowLeft" || e.key === "ArrowDown") onChange(direction - 15);
        }}
      />
    </div>
  );
}

interface DirectionPickerProps {
  direction: number;
  rotationStyle: RotationStyle;
  disabled: boolean;
  onChangeDirection(direction: number): void;
  onChangeRotationStyle(style: RotationStyle): void;
}

export function DirectionPicker(props: DirectionPickerProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);
  const { onChangeDirection } = props;
  const onDial = useCallback((d: number) => onChangeDirection(d), [onChangeDirection]);
  const styles: { id: RotationStyle; label: string; icon: ReactNode }[] = [
    { id: "all around", label: t("sprite.allAround"), icon: <AllAroundIcon size={18} /> },
    { id: "left-right", label: t("sprite.leftRight"), icon: <LeftRightIcon size={18} /> },
    { id: "don't rotate", label: t("sprite.dontRotate"), icon: <DontRotateIcon size={18} /> },
  ];
  return (
    <div className="kb-direction" ref={ref}>
      <label className="kb-field">
        <span className="kb-field__label kb-field__label--secondary">{t("sprite.direction")}</span>
        <BufferedInput
          small
          disabled={props.disabled}
          aria-label={t("sprite.direction")}
          value={props.disabled ? "" : props.direction}
          onFocus={() => setOpen(true)}
          onSubmit={(v) => onChangeDirection(Number(v))}
        />
      </label>
      {open && !props.disabled && (
        <div className="kb-popover" role="dialog" aria-label={t("sprite.direction")}>
          <Dial direction={props.direction} onChange={onDial} />
          <div className="kb-toggle-buttons" role="group" aria-label="Gaya rotasi">
            {styles.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`kb-toggle-button${props.rotationStyle === s.id ? " kb-toggle-button--selected" : ""}`}
                aria-pressed={props.rotationStyle === s.id}
                title={s.label}
                aria-label={s.label}
                onClick={() => props.onChangeRotationStyle(s.id)}
              >
                {s.icon}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
