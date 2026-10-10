/**
 * Antarmuka audio yang dipakai engine (blok suara, loudness) dan ekstensi musik.
 * Diimplementasikan oleh packages/audio (WebAudio). targetKey = target.id; clone punya kunci sendiri
 * tetapi berbagi soundId milik sprite asli, sama seperti scratch-audio SoundBank + EffectChain.
 */

export interface SoundEffects {
  /** Scratch: pitch, playbackRate = 2^(pitch/10/12). */
  pitch: number;
  /** Scratch: pan -100..100. */
  pan: number;
  /** Scratch: volume 0..100. */
  volume: number;
}

export interface DecodedSound {
  soundId: string;
  rate: number;
  sampleCount: number;
}

export interface IAudioEngine {
  /** null kalau WebAudio tidak tersedia (tes node). */
  readonly context: AudioContext | null;
  decodeSound(data: ArrayBuffer, dataFormat: string): Promise<DecodedSound>;
  /**
   * Mainkan sound untuk target. Kalau sound yang sama sedang diputar target yang sama,
   * dihentikan dulu (perilaku scratch-audio). Promise resolve saat selesai ATAU dihentikan.
   */
  playSound(targetKey: string, soundId: string): Promise<void>;
  stopSound(targetKey: string, soundId: string): void;
  /** Tanpa argumen = hentikan semua sound semua target. */
  stopAllSounds(targetKey?: string): void;
  isSoundPlaying(targetKey: string, soundId: string): boolean;
  setEffects(targetKey: string, effects: SoundEffects): void;
  /** Dipanggil saat clone dihapus. */
  disposeTarget(targetKey: string): void;
  getSoundDuration(soundId: string): number;
  /** Loudness 0..100 dari mikrofon; -1 kalau mikrofon belum/tidak diizinkan (scratch-audio). */
  getLoudness(): number;
  /** Node keluaran per target (setelah efek) untuk ekstensi musik. */
  getTargetOutput(targetKey: string): AudioNode | null;
  /** Buka kunci AudioContext pada gesture pengguna pertama. */
  resume(): Promise<void>;
}
