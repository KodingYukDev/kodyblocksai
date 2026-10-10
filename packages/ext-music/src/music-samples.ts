/**
 * Bank sampel ekstensi Music. Sampel mp3 asli Scratch (scratch-vm 4.8.102, BSD-3-Clause) di-vendor
 * di packages/ext-music/assets dan dibundel Vite sebagai asset terpisah (dimuat on-demand dari
 * origin sendiri, bukan dari URL di project). Selama belum termuat / gagal, dipakai sintesis.
 */
import { DRUM_INFO, INSTRUMENT_INFO } from "./music-info";
import { synthDrumSample, synthInstrumentSample } from "./music-synth";

export interface MusicSampleUrls {
  drum(fileName: string): string;
  instrument(dirName: string, note: number): string;
}

/** URL asset hasil bundel Vite (pola `new URL(template, import.meta.url)`). */
export const defaultMusicSampleUrls: MusicSampleUrls = {
  drum: (fileName) => new URL(`../assets/drums/${fileName}.mp3`, import.meta.url).href,
  instrument: (dirName, note) => new URL(`../assets/instruments/${dirName}/${note}.mp3`, import.meta.url).href,
};

/** URL di bawah base path tertentu, mis. "/music/" bila app menyalin assets ke public. */
export function musicSampleUrlsFromBase(base: string): MusicSampleUrls {
  const root = base.endsWith("/") ? base : `${base}/`;
  return {
    drum: (fileName) => `${root}drums/${fileName}.mp3`,
    instrument: (dirName, note) => `${root}instruments/${dirName}/${note}.mp3`,
  };
}

/** Bagian BaseAudioContext yang dipakai bank sampel (memudahkan tes). */
export interface SampleContext {
  readonly sampleRate: number;
  createBuffer(numberOfChannels: number, length: number, sampleRate: number): AudioBuffer;
  decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer>;
}

export type FetchLike = (url: string) => Promise<{ ok: boolean; arrayBuffer(): Promise<ArrayBuffer> }>;

export interface MusicSampleBankOptions {
  urls?: MusicSampleUrls;
  fetch?: FetchLike;
}

export class MusicSampleBank {
  private readonly drums: (AudioBuffer | undefined)[] = [];
  private readonly instruments: (AudioBuffer | undefined)[][] = INSTRUMENT_INFO.map(() => []);
  private readonly synthDrums = new Map<number, AudioBuffer>();
  private readonly synthInstruments = new Map<string, AudioBuffer>();
  private loading: Promise<void> | null = null;
  private readonly urls: MusicSampleUrls;
  private readonly fetchFn: FetchLike | null;

  constructor(
    private readonly context: SampleContext,
    options: MusicSampleBankOptions = {},
  ) {
    this.urls = options.urls ?? defaultMusicSampleUrls;
    this.fetchFn = options.fetch ?? (typeof fetch === "function" ? (url) => fetch(url) : null);
  }

  /** Muat semua sampel sekali (padanan _loadAllSounds). Gagal per sampel diabaikan (pakai sintesis). */
  loadAll(): Promise<void> {
    if (this.loading) return this.loading;
    const jobs: Promise<void>[] = [];
    DRUM_INFO.forEach((info, index) => {
      jobs.push(this.load(this.urls.drum(info.fileName)).then((b) => void (this.drums[index] = b)));
    });
    INSTRUMENT_INFO.forEach((info, instIndex) => {
      info.samples.forEach((note, sampleIndex) => {
        jobs.push(
          this.load(this.urls.instrument(info.dirName, note)).then((b) => {
            const arr = this.instruments[instIndex];
            if (arr) arr[sampleIndex] = b;
          }),
        );
      });
    });
    this.loading = Promise.all(jobs).then(() => undefined);
    return this.loading;
  }

  isSampleLoaded(kind: "drum" | "instrument", index: number, sampleIndex = 0): boolean {
    if (kind === "drum") return this.drums[index] !== undefined;
    return this.instruments[index]?.[sampleIndex] !== undefined;
  }

  getDrum(drumIndex: number): AudioBuffer {
    const loaded = this.drums[drumIndex];
    if (loaded) return loaded;
    let synth = this.synthDrums.get(drumIndex);
    if (!synth) {
      synth = synthDrumSample(this.context, drumIndex);
      this.synthDrums.set(drumIndex, synth);
    }
    return synth;
  }

  getInstrumentSample(instIndex: number, sampleIndex: number): AudioBuffer {
    const loaded = this.instruments[instIndex]?.[sampleIndex];
    if (loaded) return loaded;
    const key = `${instIndex}:${sampleIndex}`;
    let synth = this.synthInstruments.get(key);
    if (!synth) {
      const sampleNote = INSTRUMENT_INFO[instIndex]?.samples[sampleIndex] ?? 60;
      synth = synthInstrumentSample(this.context, instIndex, sampleNote);
      this.synthInstruments.set(key, synth);
    }
    return synth;
  }

  private async load(url: string): Promise<AudioBuffer | undefined> {
    if (!this.fetchFn) return undefined;
    try {
      const res = await this.fetchFn(url);
      if (!res.ok) return undefined;
      const data = await res.arrayBuffer();
      return await this.context.decodeAudioData(data);
    } catch {
      return undefined;
    }
  }
}
