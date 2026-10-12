/**
 * Pengenalan suara (Web Speech API).
 * PERHATIAN PRIVASI: di Chrome/Edge/Safari, mode standar mengirim audio ke server penyedia browser.
 * Karena itu:
 * - bila browser punya pengenalan ON-DEVICE (`processLocally`, Chrome 139+) dan paket bahasanya
 *   tersedia, itu yang dipakai (audio tetap di perangkat);
 * - bila tidak, blok HANYA berjalan setelah persetujuan eksplisit (requestNetworkConsent) dan
 *   pengguna diberi tahu bahwa suara dikirim lewat internet. Default tanpa handler = ditolak.
 */
import type { AiNotice, NetworkFeature } from "../types";

export interface SpeechAlternativeLike {
  transcript: string;
  confidence: number;
}
export interface SpeechResultEventLike {
  results: ArrayLike<ArrayLike<SpeechAlternativeLike>>;
}
export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  processLocally?: boolean;
  onresult: ((e: SpeechResultEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
export interface SpeechRecognitionCtor {
  new (): SpeechRecognitionLike;
  available?(opts: { langs: string[]; processLocally: boolean }): Promise<string>;
}

export interface SpeechDeps {
  ctor?: SpeechRecognitionCtor | null;
  requestNetworkConsent?: (feature: NetworkFeature) => Promise<boolean>;
  notice?: (n: AiNotice) => void;
  onActive?: (active: boolean) => void;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export const MAX_LISTEN_MS = 10_000;

function defaultCtor(): SpeechRecognitionCtor | null {
  const g = globalThis as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return g.SpeechRecognition ?? g.webkitSpeechRecognition ?? null;
}

/** true bila browser punya Web Speech API pengenalan ucapan (Chrome/Edge/Safari baru; bukan Firefox). */
export function isSpeechRecognitionSupported(): boolean {
  return defaultCtor() !== null;
}

export const SPEECH_UNSUPPORTED_MESSAGE =
  "Browser ini belum bisa mengubah ucapan jadi tulisan (misalnya Firefox atau Safari versi lama). " +
  "Coba pakai Chrome atau Edge, atau latih model suaramu sendiri di AI Lab (tab Suara) - itu jalan di semua browser.";

export class SpeechRecognizer {
  private networkConsent: boolean | null = null;
  private current: { rec: SpeechRecognitionLike; finish: (text: string) => void } | null = null;

  constructor(private readonly deps: SpeechDeps = {}) {}

  /** Lupakan persetujuan jaringan (mis. saat project berganti). */
  resetConsent(): void {
    this.networkConsent = null;
  }

  async isOnDeviceAvailable(lang: string): Promise<boolean> {
    const ctor = this.deps.ctor === undefined ? defaultCtor() : this.deps.ctor;
    if (!ctor?.available) return false;
    try {
      return (await ctor.available({ langs: [lang], processLocally: true })) === "available";
    } catch {
      return false;
    }
  }

  get supported(): boolean {
    return (this.deps.ctor === undefined ? defaultCtor() : this.deps.ctor) !== null;
  }

  /** Dengarkan satu ucapan. Selalu resolve (string kosong bila gagal/ditolak/timeout). */
  async recognizeOnce(lang: string, timeoutMs = MAX_LISTEN_MS): Promise<string> {
    const ctor = this.deps.ctor === undefined ? defaultCtor() : this.deps.ctor;
    if (!ctor) {
      this.notify("warning", "speech-unsupported", SPEECH_UNSUPPORTED_MESSAGE);
      return "";
    }
    this.cancel();
    const local = await this.isOnDeviceAvailable(lang);
    if (!local) {
      if (this.networkConsent === null) {
        const ask = this.deps.requestNetworkConsent;
        this.networkConsent = ask ? await ask("speech-recognition").catch(() => false) : false;
      }
      if (!this.networkConsent) {
        this.notify(
          "warning",
          "speech-network-denied",
          "Pengenalan suara di browser ini butuh internet (suara dikirim ke server penyedia browser). Izin belum diberikan, jadi blok dilewati.",
        );
        return "";
      }
      this.notify("info", "speech-network", "Pengenalan suara memakai internet: suaramu dikirim ke server penyedia browser untuk diubah jadi teks.");
    }
    return new Promise<string>((resolve) => {
      const rec = new ctor();
      rec.lang = lang;
      rec.continuous = false;
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      if (local) rec.processLocally = true;
      let transcript = "";
      let done = false;
      const setTimer = this.deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
      const clearTimer = this.deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
      const finish = (text: string): void => {
        if (done) return;
        done = true;
        clearTimer(timer);
        rec.onresult = rec.onerror = rec.onend = null;
        if (this.current?.rec === rec) this.current = null;
        this.deps.onActive?.(false);
        resolve(text);
      };
      const timer = setTimer(() => {
        try {
          rec.abort();
        } catch {
          // sudah berhenti
        }
        finish(transcript);
      }, Math.max(1000, Math.min(timeoutMs, MAX_LISTEN_MS)));
      rec.onresult = (e) => {
        const first = e.results[0]?.[0];
        if (first) transcript = String(first.transcript ?? "").trim().slice(0, 500);
      };
      rec.onerror = (e) => {
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          this.notify("warning", "speech-denied", "Izin mikrofon untuk pengenalan suara ditolak.");
        } else if (e.error === "network") {
          this.notify("warning", "speech-offline", "Pengenalan suara butuh koneksi internet.");
        }
        finish(transcript);
      };
      rec.onend = () => finish(transcript);
      this.current = { rec, finish };
      try {
        this.deps.onActive?.(true);
        rec.start();
      } catch {
        finish("");
      }
    });
  }

  cancel(): void {
    const cur = this.current;
    if (!cur) return;
    this.current = null;
    try {
      cur.rec.abort();
    } catch {
      // abaikan
    }
    cur.finish("");
  }

  private notify(level: AiNotice["level"], code: string, message: string): void {
    this.deps.notice?.({ level, code, message });
  }
}
