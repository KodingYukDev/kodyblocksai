/**
 * Penangkap error React paling atas: tampilkan layar ramah anak alih-alih halaman putih.
 * Project yang sedang dibuka sudah disimpan otomatis secara berkala (lihat shell/autosave.ts),
 * jadi setelah muat ulang anak ditawari untuk melanjutkannya.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import kodyUrl from "../assets/kody.svg";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Dipanggil sebelum layar error tampil (mis. simpan darurat). */
  onError?(error: unknown): void;
}

interface ErrorBoundaryState {
  error: unknown;
  attempt: number;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null, attempt: 0 };

  static getDerivedStateFromError(error: unknown): Partial<ErrorBoundaryState> {
    return { error: error ?? new Error("Error tidak dikenal") };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error("KodyBlocks error", error, info.componentStack);
    try {
      this.props.onError?.(error);
    } catch {
      // Abaikan: layar pemulihan tetap harus tampil.
    }
  }

  private retry = (): void => {
    this.setState((s) => ({ error: null, attempt: s.attempt + 1 }));
  };

  private reload = (): void => {
    window.location.reload();
  };

  override render(): ReactNode {
    if (!this.state.error) {
      // key berubah setiap "Coba lagi" agar seluruh pohon dipasang ulang dari awal.
      return <ErrorBoundaryKey key={this.state.attempt}>{this.props.children}</ErrorBoundaryKey>;
    }
    const message = this.state.error instanceof Error ? this.state.error.message : String(this.state.error);
    return (
      <div className="kb-crash" role="alert">
        <div className="kb-crash__card">
          <img className="kb-crash__mascot" src={kodyUrl} alt="" draggable={false} />
          <h1 className="kb-crash__title">Ups, Kody tersandung!</h1>
          <p className="kb-crash__text">
            Ada yang tidak berjalan semestinya. Tenang, project kamu disimpan otomatis. Coba lagi, atau muat ulang
            halaman lalu pilih <b>Lanjutkan</b>.
          </p>
          <div className="kb-crash__actions">
            <button type="button" className="kb-crash__button" onClick={this.retry}>
              Coba lagi
            </button>
            <button type="button" className="kb-crash__button kb-crash__button--primary" onClick={this.reload}>
              Muat ulang halaman
            </button>
          </div>
          <details className="kb-crash__details">
            <summary>Info untuk guru</summary>
            <code>{message.slice(0, 500)}</code>
          </details>
        </div>
      </div>
    );
  }
}

function ErrorBoundaryKey({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
