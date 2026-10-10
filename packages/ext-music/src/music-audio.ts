/**
 * Keluaran suara ekstensi Music di WebAudio. Meniru perilaku scratch-vm 4.8.102 scratch3_music
 * (_playDrumNum, _playNote) + scratch-audio SoundPlayer (BSD-3-Clause):
 *  - satu "player" per drum dan per (instrumen, nada);
 *  - player yang sedang berbunyi dan sudah lewat masa start (DECAY_DURATION 25 ms) "diambil alih"
 *    (take): suara lama dibiarkan selesai, suara baru dimulai;
 *  - player yang masih dalam masa start TIDAK memulai suara baru; sumber yang ada dialihkan ke
 *    rantai gain baru (dan untuk nada: playbackRate + jadwal stop baru), persis SoundPlayer.play();
 *  - penghitung konkurensi naik/turun seperti listener `once('stop')` Scratch dan suara baru
 *    ditolak bila penghitung > CONCURRENCY_LIMIT.
 * Musik langsung ke input master (tidak lewat efek pitch/pan sprite), hanya volume sprite.
 */
import { CONCURRENCY_LIMIT, INSTRUMENT_INFO } from "./music-info";

/** scratch-audio AudioEngine.DECAY_DURATION. */
export const DECAY_DURATION = 0.025;

export interface MusicSoundOutput {
  /** volume 0..1 (= target.volume / 100). */
  playDrum(drumIndex: number, volume: number): void;
  playNote(instIndex: number, note: number, durationSec: number, volume: number): void;
  /** Nilai penghitung konkurensi sekarang (untuk tes). */
  readonly concurrency: number;
  dispose(): void;
}

/** Bagian AudioContext yang dipakai. */
export interface MusicAudioContext {
  readonly currentTime: number;
  createGain(): GainNode;
  createBufferSource(): AudioBufferSourceNode;
}

export interface MusicBufferSource {
  getDrum(drumIndex: number): AudioBuffer;
  getInstrumentSample(instIndex: number, sampleIndex: number): AudioBuffer;
}

interface Voice {
  source: AudioBufferSourceNode | null;
  playing: boolean;
  startingUntil: number;
  /** Masih punya listener once('stop') yang belum terpanggil (dihitung di penghitung). */
  counted: boolean;
}

/** _selectSampleIndexForNote: sampel terdekat di bawah (atau sama dengan) nada. */
export function selectSampleIndexForNote(note: number, samples: readonly number[]): number {
  for (let i = samples.length - 1; i >= 0; i--) {
    if (note >= (samples[i] as number)) return i;
  }
  return 0;
}

/** _ratioForPitchInterval. */
export function ratioForPitchInterval(interval: number): number {
  return Math.pow(2, interval / 12);
}

export class WebAudioMusicOutput implements MusicSoundOutput {
  private counter = 0;
  private readonly voices = new Map<string, Voice>();
  private readonly live = new Set<AudioBufferSourceNode>();

  constructor(
    private readonly context: MusicAudioContext,
    private readonly destination: AudioNode,
    private readonly samples: MusicBufferSource,
  ) {}

  get concurrency(): number {
    return this.counter;
  }

  playDrum(drumIndex: number, volume: number): void {
    if (this.counter > CONCURRENCY_LIMIT) return;
    const ctx = this.context;
    const volumeGain = ctx.createGain();
    volumeGain.gain.setValueAtTime(volume, ctx.currentTime);
    volumeGain.connect(this.destination);
    this.play(`d${drumIndex}`, () => this.samples.getDrum(drumIndex), volumeGain);
  }

  playNote(instIndex: number, note: number, durationSec: number, volume: number): void {
    if (this.counter > CONCURRENCY_LIMIT) return;
    const info = INSTRUMENT_INFO[instIndex];
    if (!info) return;
    const sampleIndex = selectSampleIndexForNote(note, info.samples);
    const sampleNote = info.samples[sampleIndex] ?? 60;
    const rate = ratioForPitchInterval(note - sampleNote);

    const ctx = this.context;
    const volumeGain = ctx.createGain();
    volumeGain.gain.setValueAtTime(volume, ctx.currentTime);
    const releaseGain = ctx.createGain();
    volumeGain.connect(releaseGain);
    releaseGain.connect(this.destination);

    const releaseDuration = info.releaseTime ?? 0.01;
    const releaseStart = ctx.currentTime + durationSec;
    const releaseEnd = releaseStart + releaseDuration;
    releaseGain.gain.setValueAtTime(1, releaseStart);
    releaseGain.gain.linearRampToValueAtTime(0.0001, releaseEnd);

    const source = this.play(
      `n${instIndex}:${note}`,
      () => this.samples.getInstrumentSample(instIndex, sampleIndex),
      volumeGain,
    );
    if (source) {
      // Sama dengan Scratch: diterapkan juga ke sumber yang "digabung" (masa start).
      source.playbackRate.value = rate;
      try {
        source.stop(releaseEnd);
      } catch {
        // Beberapa implementasi lama menolak stop() kedua; abaikan seperti suara yang sudah habis.
      }
    }
  }

  dispose(): void {
    for (const src of this.live) {
      try {
        src.stop();
      } catch {
        // sudah berhenti
      }
      src.disconnect();
    }
    this.live.clear();
    this.voices.clear();
    this.counter = 0;
  }

  /** Mengembalikan sumber yang kini terhubung ke `output` (baru atau hasil gabung). */
  private play(key: string, getBuffer: () => AudioBuffer, output: AudioNode): AudioBufferSourceNode | null {
    const ctx = this.context;
    let voice = this.voices.get(key);
    if (!voice) {
      voice = { source: null, playing: false, startingUntil: 0, counted: false };
      this.voices.set(key, voice);
    }

    // SoundPlayer.isStarting: play() hanya memancarkan stop+play, sumber lama dialihkan ke gain baru.
    if (voice.playing && voice.startingUntil > ctx.currentTime && voice.source) {
      // counter++ lalu 'stop' memicu listener baru + listener lama yang masih tertunda.
      if (voice.counted) this.counter--;
      voice.counted = false;
      voice.source.disconnect();
      voice.source.connect(output);
      return voice.source;
    }

    // take(): suara lama dibiarkan berbunyi tanpa dihitung lagi.
    if (voice.playing) {
      if (voice.counted) this.counter--;
      voice.counted = false;
      voice.playing = false;
      voice.source = null;
    }

    const source = ctx.createBufferSource();
    source.buffer = getBuffer();
    source.connect(output);
    const current = voice;
    source.onended = () => {
      this.live.delete(source);
      if (current.source !== source) return;
      current.playing = false;
      current.startingUntil = 0;
      if (current.counted) this.counter--;
      current.counted = false;
    };
    this.live.add(source);
    source.start();
    voice.source = source;
    voice.playing = true;
    voice.startingUntil = ctx.currentTime + DECAY_DURATION;
    voice.counted = true;
    this.counter++;
    return source;
  }
}
