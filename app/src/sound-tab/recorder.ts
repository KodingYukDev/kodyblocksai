/**
 * Perekam mikrofon (padanan scratch-gui lib/audio/audio-recorder.js). Mikrofon hanya dinyalakan
 * setelah pengguna membuka dialog rekam, level dilaporkan per frame, dan semua track dihentikan
 * pada dispose(). Audio tetap di browser; tidak ada yang dikirim ke server.
 */
import { autoTrimRecording, computeRMS } from "./sound-edit";
import { getAudioContext } from "./sound-media";

export const RECORD_BUFFER_LENGTH = 8192;
/** Batas rekaman agar memori tetap kecil (scratch-gui tidak membatasi; kita batasi 30 detik). */
export const MAX_RECORD_SECONDS = 30;

export interface RecordingResult {
  samples: Float32Array;
  sampleRate: number;
  levels: number[];
  trimStart: number;
  trimEnd: number;
}

export class AudioRecorder {
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private analyser: AnalyserNode | null = null;
  private buffers: Float32Array[] = [];
  private recording = false;
  private disposed = false;
  private raf = 0;

  /** Minta izin mikrofon lalu mulai melaporkan level (0..~1). */
  async startListening(onLevel: (level: number) => void, onAutoStop?: () => void): Promise<void> {
    const md = navigator.mediaDevices;
    if (!md?.getUserMedia) throw new Error("Mikrofon tidak tersedia");
    const stream = await md.getUserMedia({ audio: true });
    if (this.disposed) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    const ctx = getAudioContext();
    void ctx.resume?.();
    this.stream = stream;
    this.source = ctx.createMediaStreamSource(stream);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.processor = ctx.createScriptProcessor(RECORD_BUFFER_LENGTH, 1, 1);
    const maxBuffers = Math.ceil((MAX_RECORD_SECONDS * ctx.sampleRate) / RECORD_BUFFER_LENGTH);
    this.processor.onaudioprocess = (ev) => {
      if (!this.recording || this.disposed) return;
      this.buffers.push(new Float32Array(ev.inputBuffer.getChannelData(0)));
      if (this.buffers.length >= maxBuffers) {
        this.recording = false;
        onAutoStop?.();
      }
    };
    const data = new Float32Array(this.analyser.frequencyBinCount);
    const tick = (): void => {
      if (this.disposed || !this.analyser) return;
      this.analyser.getFloatTimeDomainData(data);
      onLevel(computeRMS(data));
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
    this.source.connect(this.analyser);
    this.analyser.connect(this.processor);
    this.processor.connect(ctx.destination);
  }

  startRecording(): void {
    this.buffers = [];
    this.recording = true;
  }

  stop(): RecordingResult {
    this.recording = false;
    const samples = new Float32Array(this.buffers.reduce((n, b) => n + b.length, 0));
    let o = 0;
    for (const b of this.buffers) {
      samples.set(b, o);
      o += b.length;
    }
    const { levels, trimStart, trimEnd } = autoTrimRecording(samples);
    return { samples, sampleRate: getAudioContext().sampleRate, levels, trimStart, trimEnd };
  }

  get active(): boolean {
    return this.stream !== null && !this.disposed;
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    if (this.processor) {
      this.processor.onaudioprocess = null;
      this.processor.disconnect();
    }
    this.analyser?.disconnect();
    this.source?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
}
