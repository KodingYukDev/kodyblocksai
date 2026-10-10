import logoUrl from "../assets/kodyblocks-logo.png";

export interface MenuBarProps {
  title: string;
}

/** Menu bar 48px bergradien persis KodyBlocks. Item menu diisi agent app-shell. */
export function MenuBar({ title }: MenuBarProps) {
  return (
    <header className="kb-menu-bar" role="banner">
      <img className="kb-menu-bar__logo" src={logoUrl} alt="KodyBlocks" draggable={false} />
      <nav className="kb-menu-bar__menus" aria-label="Menu utama">
        <button type="button" className="kb-menu-bar__item">
          File
        </button>
        <button type="button" className="kb-menu-bar__item">
          Edit
        </button>
      </nav>
      <div className="kb-menu-bar__title" aria-label="Judul project">
        {title}
      </div>
    </header>
  );
}
