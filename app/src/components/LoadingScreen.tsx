/** Layar muat dengan Kody selama engine, renderer, dan project awal disiapkan. */
import kodyUrl from "../assets/kody.svg";

export function LoadingScreen({ text, overlay = false }: { text: string; overlay?: boolean }) {
  return (
    <div className={`kb-loading${overlay ? " kb-loading--overlay" : ""}`} role="status" aria-live="polite">
      <img className="kb-loading__mascot" src={kodyUrl} alt="" draggable={false} />
      <div className="kb-loading__bar" aria-hidden="true">
        <span />
      </div>
      <p className="kb-loading__text">{text}</p>
    </div>
  );
}
