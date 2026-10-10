/** Tipe audio. IAudioEngine didefinisikan di @kody/engine; paket ini mengimplementasikannya. */
import type { IAudioEngine } from "@kody/engine";
import type { GetUserMedia } from "./loudness";

export type { DecodedSound, IAudioEngine, SoundEffects } from "@kody/engine";

export interface AudioEngineOptions {
  /** AudioContext yang sudah ada. Default: dibuat saat pertama dibutuhkan (decode/play). */
  context?: AudioContext;
  /** Pembuat AudioContext (default `new AudioContext()` bila tersedia). Untuk tes. */
  createContext?: () => AudioContext | null;
  /** Akses mikrofon (default navigator.mediaDevices.getUserMedia). null = tanpa mikrofon. */
  getUserMedia?: GetUserMedia | null;
  /** Dipanggil saat mikrofon aktif/mati, untuk indikator (`ai:device-active`). */
  onMicrophoneActiveChange?: (active: boolean) => void;
  /**
   * Pasang listener gesture (pointerdown/keydown/touchend) di `document` untuk me-resume
   * AudioContext (padanan StartAudioContext). Default true bila `document` ada.
   */
  resumeOnGesture?: boolean;
  /** Pembuat id sound; default acak (padanan uid scratch-audio). */
  createId?: () => string;
}

/** Fitur tambahan implementasi @kody/audio di luar kontrak IAudioEngine. */
export interface KodyAudioEngine extends IAudioEngine {
  /** Matikan mikrofon (mis. saat project berhenti/ditutup). */
  releaseMicrophone(): void;
  /** Buffer hasil dekode, untuk editor sound (gelombang, potong, dll). */
  getAudioBuffer(soundId: string): AudioBuffer | null;
  /** Daftarkan AudioBuffer yang sudah ada (mis. hasil rekam/edit di editor sound). */
  registerBuffer(buffer: AudioBuffer): string;
  /** Hapus sound dari bank (sound dihapus dari sprite). */
  unloadSound(soundId: string): void;
  /** Node masukan master (semua suara lewat sini). */
  getMasterInput(): AudioNode | null;
  /** Lepas semua node, listener, dan mikrofon. AudioContext milik pemanggil tidak ditutup. */
  dispose(): void;
}
