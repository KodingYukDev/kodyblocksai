/**
 * Mikrofon untuk classifier suara: hanya membaca spektrum (AnalyserNode) secara lokal.
 * Tidak ada perekaman, tidak ada pengiriman audio. stop() menghentikan track + menutup AudioContext.
 */
import { TypedEmitter } from "@kody/engine";
import type { MediaStreamLike } from "./camera";

export interface AnalyserLike {
  fftSize: number;
  smoothingTimeConstant: number;
  readonly frequencyBinCount: number;
  getFloatFrequencyData(out: Float32Array): void;
}

export interface AudioContextLike {
  readonly sampleRate: number;
  createMediaStreamSource(stream: never): { connect(node: unknown): void; disconnect(): void };
  createAnalyser(): AnalyserLike;
  close(): Promise<void>;
  resume?(): Promise<void>;
}

export interface MicrophoneDeps {
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStreamLike>;
  createAudioContext?: () => AudioContextLike;
  isHidden?: () => boolean;
}

export type MicrophoneEventMap = {
  "permission-requested": void;
  "permission-result": { granted: boolean; reason?: string };
  "active-change": { active: boolean };
};

export const MIC_CONSTRAINTS: MediaStreamConstraints = {
  video: false,
  audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
};

export class MicrophoneController {
  readonly events = new TypedEmitter<MicrophoneEventMap>();
  private stream: MediaStreamLike | null = null;
  private context: AudioContextLike | null = null;
  private source: { disconnect(): void } | null = null;
  private analyser: AnalyserLike | null = null;
  private pending: Promise<boolean> | null = null;
  private generation = 0;
  private buffer: Float32Array | null = null;

  constructor(private readonly deps: MicrophoneDeps = {}) {}

  get active(): boolean {
    return this.stream !== null;
  }

  get sampleRate(): number {
    return this.context?.sampleRate ?? 48000;
  }

  start(): Promise<boolean> {
    if (this.stream) return Promise.resolve(true);
    if (this.pending) return this.pending;
    if ((this.deps.isHidden ?? documentHidden)()) {
      this.events.emit("permission-result", { granted: false, reason: "hidden" });
      return Promise.resolve(false);
    }
    const generation = this.generation;
    const run = async (): Promise<boolean> => {
      const md = globalThis.navigator?.mediaDevices;
      const getUserMedia = this.deps.getUserMedia ?? (md?.getUserMedia ? (c: MediaStreamConstraints) => md.getUserMedia(c) : undefined);
      if (!getUserMedia) {
        this.events.emit("permission-result", { granted: false, reason: "unsupported" });
        return false;
      }
      this.events.emit("permission-requested", undefined);
      let stream: MediaStreamLike;
      try {
        stream = await getUserMedia(MIC_CONSTRAINTS);
      } catch (err) {
        this.events.emit("permission-result", { granted: false, reason: (err as { name?: string }).name ?? "Error" });
        return false;
      }
      if (generation !== this.generation) {
        for (const t of stream.getTracks()) t.stop();
        return false;
      }
      const ctx = this.deps.createAudioContext ? this.deps.createAudioContext() : (new AudioContext() as unknown as AudioContextLike);
      await ctx.resume?.();
      const source = ctx.createMediaStreamSource(stream as never);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);
      this.stream = stream;
      this.context = ctx;
      this.source = source;
      this.analyser = analyser;
      this.buffer = new Float32Array(analyser.frequencyBinCount);
      this.events.emit("permission-result", { granted: true });
      this.events.emit("active-change", { active: true });
      return true;
    };
    const pending = run().finally(() => {
      if (this.pending === pending) this.pending = null;
    });
    this.pending = pending;
    return pending;
  }

  /** Spektrum dB terbaru (buffer dipakai ulang), atau null bila mikrofon mati. */
  readSpectrum(): Float32Array | null {
    if (!this.analyser || !this.buffer) return null;
    this.analyser.getFloatFrequencyData(this.buffer);
    return this.buffer;
  }

  stop(): void {
    this.generation++;
    this.pending = null;
    const wasActive = this.stream !== null;
    if (this.stream) for (const t of this.stream.getTracks()) t.stop();
    try {
      this.source?.disconnect();
    } catch {
      // sudah terputus
    }
    void this.context?.close().catch(() => {});
    this.stream = null;
    this.context = null;
    this.source = null;
    this.analyser = null;
    this.buffer = null;
    if (wasActive) this.events.emit("active-change", { active: false });
  }

  dispose(): void {
    this.stop();
    this.events.removeAllListeners();
  }
}

function documentHidden(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}
