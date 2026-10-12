/**
 * Text-to-speech (speechSynthesis). Suara "lokal" (voice.localService = true) diproses di perangkat;
 * suara jaringan (mis. "Google Bahasa Indonesia" di Chrome) mengirim TEKS ke server, jadi hanya
 * dipakai setelah persetujuan eksplisit.
 */
import type { AiNotice, NetworkFeature } from "../types";

export interface VoiceLike {
  name: string;
  lang: string;
  localService: boolean;
  default?: boolean;
}
export interface UtteranceLike {
  text: string;
  lang: string;
  voice: VoiceLike | null;
  rate: number;
  pitch: number;
  volume: number;
  onend: (() => void) | null;
  onerror: ((e: unknown) => void) | null;
}
export interface SynthLike {
  getVoices(): VoiceLike[];
  speak(u: UtteranceLike): void;
  cancel(): void;
  addEventListener?(type: "voiceschanged", fn: () => void): void;
  removeEventListener?(type: "voiceschanged", fn: () => void): void;
}

export interface TtsDeps {
  synth?: SynthLike | null;
  createUtterance?: (text: string) => UtteranceLike;
  requestNetworkConsent?: (feature: NetworkFeature) => Promise<boolean>;
  notice?: (n: AiNotice) => void;
  voicesTimeoutMs?: number;
}

export const MAX_TTS_CHARS = 500;

export const TTS_LANGUAGES: readonly (readonly [code: string, text: string])[] = [
  ["id-ID", "Indonesia"],
  ["en-US", "Inggris (AS)"],
  ["en-GB", "Inggris (UK)"],
  ["jv-ID", "Jawa"],
  ["su-ID", "Sunda"],
  ["ms-MY", "Melayu"],
  ["ar-SA", "Arab"],
  ["ja-JP", "Jepang"],
  ["ko-KR", "Korea"],
  ["zh-CN", "Mandarin"],
  ["fr-FR", "Prancis"],
  ["de-DE", "Jerman"],
  ["es-ES", "Spanyol"],
];

const norm = (lang: string): string => lang.replace(/_/g, "-").toLowerCase();

/** Pilih suara: bahasa persis lalu awalan bahasa; suara lokal didahulukan. */
export function chooseVoice(voices: readonly VoiceLike[], lang: string, allowRemote: boolean): VoiceLike | null {
  const want = norm(lang);
  const base = want.split("-")[0] ?? want;
  const exact = voices.filter((v) => norm(v.lang) === want);
  const prefix = voices.filter((v) => norm(v.lang).split("-")[0] === base);
  const pick = (list: VoiceLike[]): VoiceLike | null => list.find((v) => v.default) ?? list[0] ?? null;
  const local = pick(exact.filter((v) => v.localService)) ?? pick(prefix.filter((v) => v.localService));
  if (local) return local;
  if (!allowRemote) return null;
  return pick(exact) ?? pick(prefix);
}

export class TextToSpeech {
  private networkConsent: boolean | null = null;
  private pending = new Set<() => void>();

  constructor(private readonly deps: TtsDeps = {}) {}

  resetConsent(): void {
    this.networkConsent = null;
  }

  private synth(): SynthLike | null {
    if (this.deps.synth !== undefined) return this.deps.synth;
    return (globalThis as unknown as { speechSynthesis?: SynthLike }).speechSynthesis ?? null;
  }

  private async voices(synth: SynthLike): Promise<VoiceLike[]> {
    const now = synth.getVoices();
    if (now.length > 0 || !synth.addEventListener) return now;
    return new Promise((resolve) => {
      const done = (): void => {
        synth.removeEventListener?.("voiceschanged", done);
        resolve(synth.getVoices());
      };
      synth.addEventListener?.("voiceschanged", done);
      setTimeout(done, this.deps.voicesTimeoutMs ?? 1000);
    });
  }

  /** Ucapkan teks. Selalu resolve setelah selesai/gagal/dibatalkan. */
  async speak(rawText: string, lang: string): Promise<void> {
    const synth = this.synth();
    const text = String(rawText ?? "").slice(0, MAX_TTS_CHARS).trim();
    if (!text) return;
    if (!synth) {
      this.notify("warning", "tts-unsupported", "Browser ini tidak mendukung suara (text-to-speech).");
      return;
    }
    const voices = await this.voices(synth);
    let voice = chooseVoice(voices, lang, false);
    if (!voice) {
      if (this.networkConsent === null) {
        const ask = this.deps.requestNetworkConsent;
        this.networkConsent = ask ? await ask("speech-synthesis").catch(() => false) : false;
      }
      voice = this.networkConsent ? chooseVoice(voices, lang, true) : null;
      if (!voice) {
        this.notify(
          "warning",
          "tts-no-local-voice",
          `Tidak ada suara offline untuk bahasa ${lang} di perangkat ini; suara online butuh izin internet.`,
        );
        return;
      }
    }
    const make = this.deps.createUtterance ?? ((t: string) => new SpeechSynthesisUtterance(t) as unknown as UtteranceLike);
    const u = make(text);
    u.lang = voice.lang;
    u.voice = voice;
    u.rate = 1;
    u.pitch = 1;
    u.volume = 1;
    await new Promise<void>((resolve) => {
      // Safari iOS kadang tidak pernah memanggil onend: batas waktu supaya skrip tidak macet.
      const guard = setTimeout(() => finish(), 4000 + text.length * 120);
      const finish = (): void => {
        clearTimeout(guard);
        this.pending.delete(finish);
        u.onend = u.onerror = null;
        resolve();
      };
      this.pending.add(finish);
      u.onend = finish;
      u.onerror = finish;
      try {
        synth.speak(u);
      } catch {
        finish();
      }
    });
  }

  cancel(): void {
    const synth = this.synth();
    try {
      synth?.cancel();
    } catch {
      // abaikan
    }
    for (const finish of [...this.pending]) finish();
  }

  private notify(level: AiNotice["level"], code: string, message: string): void {
    this.deps.notice?.({ level, code, message });
  }
}
