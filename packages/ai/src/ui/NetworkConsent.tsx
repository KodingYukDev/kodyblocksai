/**
 * Dialog persetujuan internet di dalam app (pengganti window.confirm) untuk fitur yang mengirim data
 * ke server penyedia browser (pengenalan ucapan online, suara TTS online).
 *
 * Pemakaian di app:
 *   const consent = createNetworkConsent();
 *   configureAiServices(runtime, { requestNetworkConsent: consent.request });
 *   <AiConsentDialog consent={consent} />   // pasang sekali di root app
 *
 * Aturan: default MENOLAK. Bila dialog belum terpasang, permintaan langsung ditolak (tidak pernah
 * menggantung dan tidak pernah mengizinkan diam-diam). Tombol yang difokus pertama = "Jangan".
 */
import { useEffect, useRef, useState } from "react";
import type { NetworkFeature } from "../types";

export interface ConsentRequest {
  feature: NetworkFeature;
}

export interface NetworkConsentController {
  /** Diteruskan ke configureAiServices({ requestNetworkConsent }). */
  request(feature: NetworkFeature): Promise<boolean>;
  /** Permintaan yang sedang menunggu jawaban (untuk dialog). */
  readonly pending: ConsentRequest | null;
  answer(granted: boolean): void;
  subscribe(fn: () => void): () => void;
  /** Dialog memanggil ini saat terpasang; tanpa dialog semua permintaan ditolak. */
  attach(): () => void;
}

export function createNetworkConsent(): NetworkConsentController {
  const listeners = new Set<() => void>();
  const queue: { req: ConsentRequest; resolve: (ok: boolean) => void }[] = [];
  let hosts = 0;
  const emit = (): void => {
    for (const fn of [...listeners]) fn();
  };
  const ctrl: NetworkConsentController = {
    request(feature) {
      if (hosts === 0) return Promise.resolve(false);
      return new Promise<boolean>((resolve) => {
        queue.push({ req: { feature }, resolve });
        emit();
      });
    },
    get pending() {
      return queue[0]?.req ?? null;
    },
    answer(granted) {
      const head = queue.shift();
      head?.resolve(granted === true);
      emit();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    attach() {
      hosts++;
      return () => {
        hosts = Math.max(0, hosts - 1);
        if (hosts === 0) {
          // Dialog dilepas: semua permintaan yang menunggu ditolak.
          for (const item of queue.splice(0)) item.resolve(false);
          emit();
        }
      };
    },
  };
  return ctrl;
}

/** Controller bersama (praktis untuk app dengan satu runtime). */
export const aiNetworkConsent: NetworkConsentController = createNetworkConsent();

const TEXTS: Record<NetworkFeature, { title: string; body: string }> = {
  "speech-recognition": {
    title: "Boleh pakai internet untuk mendengar ucapan?",
    body:
      "Di browser ini, blok \"dengarkan ucapan\" mengirim suaramu ke server penyedia browser (misalnya Google atau Apple) lewat internet supaya bisa diubah jadi tulisan. " +
      "Tanya dulu ke guru atau orang tuamu ya. Kalau tidak boleh, blok itu dilewati saja.",
  },
  "speech-synthesis": {
    title: "Boleh pakai suara dari internet?",
    body:
      "Perangkat ini tidak punya suara offline untuk bahasa itu. Suara online mengirim teks yang diucapkan ke server penyedia browser. " +
      "Tanya dulu ke guru atau orang tuamu ya.",
  },
};

const S = {
  backdrop: {
    position: "fixed",
    inset: 0,
    zIndex: 1000,
    background: "rgba(21,54,76,.55)",
    display: "grid",
    placeItems: "center",
    padding: 16,
  } as React.CSSProperties,
  box: {
    background: "#fff",
    borderRadius: 12,
    maxWidth: 440,
    width: "100%",
    boxShadow: "0 8px 32px rgba(0,0,0,.25)",
    font: '15px/1.45 "Helvetica Neue", Helvetica, Arial, sans-serif',
    color: "#575E75",
    overflow: "hidden",
  } as React.CSSProperties,
  head: { background: "linear-gradient(90deg,#15364c,#08786f)", color: "#fff", padding: "12px 16px", margin: 0, fontSize: 17 } as React.CSSProperties,
  body: { padding: 16, display: "flex", flexDirection: "column", gap: 14 } as React.CSSProperties,
  row: { display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" } as React.CSSProperties,
  btn: {
    minHeight: 44,
    padding: "8px 16px",
    borderRadius: 10,
    border: "1px solid #D9E3F2",
    background: "#fff",
    color: "#575E75",
    font: "inherit",
    fontWeight: 600,
    cursor: "pointer",
  } as React.CSSProperties,
  yes: { background: "#0FBD8C", borderColor: "#0FBD8C", color: "#fff" } as React.CSSProperties,
};

export interface AiConsentDialogProps {
  consent?: NetworkConsentController;
}

/** Dialog persetujuan internet ramah anak. Pasang sekali di root app. */
export function AiConsentDialog({ consent = aiNetworkConsent }: AiConsentDialogProps): React.JSX.Element | null {
  const [, force] = useState(0);
  const denyRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const off = consent.subscribe(() => force((n) => n + 1));
    const detach = consent.attach();
    return () => {
      off();
      detach();
    };
  }, [consent]);
  const pending = consent.pending;
  useEffect(() => {
    if (pending) denyRef.current?.focus();
  }, [pending]);
  if (!pending) return null;
  const text = TEXTS[pending.feature] ?? { title: "Boleh pakai internet?", body: "Fitur ini mengirim data lewat internet." };
  return (
    <div style={S.backdrop} data-testid="ai-consent">
      <div
        style={S.box}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="kody-ai-consent-title"
        aria-describedby="kody-ai-consent-body"
        onKeyDown={(e) => {
          if (e.key === "Escape") consent.answer(false);
        }}
      >
        <h2 id="kody-ai-consent-title" style={S.head}>
          {text.title}
        </h2>
        <div style={S.body}>
          <p id="kody-ai-consent-body" style={{ margin: 0 }}>
            {text.body}
          </p>
          <p style={{ margin: 0, fontSize: 13 }}>Izin ini hanya berlaku sampai project ditutup.</p>
          <div style={S.row}>
            <button ref={denyRef} type="button" style={S.btn} onClick={() => consent.answer(false)}>
              Jangan
            </button>
            <button type="button" style={{ ...S.btn, ...S.yes }} onClick={() => consent.answer(true)}>
              Boleh, untuk sesi ini
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
