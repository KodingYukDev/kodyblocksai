/** Dialog ramah anak dengan maskot Kody (pulihkan project, simpan file di iPad, dsb.). */
import { useEffect, useId, useRef, type ReactNode } from "react";
import kodyUrl from "../assets/kody.svg";

export interface KodyDialogAction {
  label: string;
  onClick(): void;
  primary?: boolean;
}

interface KodyDialogProps {
  title: string;
  children: ReactNode;
  actions: readonly KodyDialogAction[];
  /** Esc / ketuk latar = aksi ini (biasanya "batal"). */
  onDismiss?(): void;
}

export function KodyDialog({ title, children, actions, onDismiss }: KodyDialogProps) {
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const primary = box.current?.querySelector<HTMLButtonElement>(".kb-kody-dialog__button--primary");
    primary?.focus();
    if (!onDismiss) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onDismiss();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onDismiss]);
  return (
    <div
      className="kb-kody-dialog__backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onDismiss?.();
      }}
    >
      <div className="kb-kody-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={box}>
        <img className="kb-kody-dialog__mascot" src={kodyUrl} alt="" draggable={false} />
        <h2 className="kb-kody-dialog__title" id={titleId}>
          {title}
        </h2>
        <div className="kb-kody-dialog__body">{children}</div>
        <div className="kb-kody-dialog__actions">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              className={`kb-kody-dialog__button${a.primary ? " kb-kody-dialog__button--primary" : ""}`}
              onClick={a.onClick}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
