/**
 * Perekam mikrofon (padanan scratch-gui lib/audio/audio-recorder.js). Mikrofon hanya dinyalakan
 * setelah pengguna membuka dialog rekam, level dilaporkan per frame, dan semua track dihentikan
 * pada dispose(). Audio tetap di browser; tidak ada yang dikirim ke server.
 */
import { autoTrimRecording, computeRMS } from "./sound-edit";
import { decodeSoundBytes, getAudioContext } from "./sound-media";

/**
 * Jenis MIME MediaRecorder yang didukung browser ini, urut preferensi. Safari/iPad hanya merekam
 * audio/mp4 (AAC); Chrome/Firefox webm/ogg Opus. "" = biarkan browser memilih.
 */
export function pickRecorderMime(isSupported: (mime: string) => boolean): string {
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/aac", "audio/ogg;codecs=opus"]) {
    try {
      if (isSupported(m)) return m;
    } catch {
      // isTypeSupported melempar di beberapa versi Safari lama
    }
  }
  return "";
}

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
  /** Cadangan bila ScriptProcessorNode tidak ada: rekam terkompresi lalu dekode saat berhenti. */
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private autoStopTimer: ReturnType<typeof setTimeout> | null = null;
  private onAutoStop: (() => void) | undefined;

  /** Minta izin mikrofon lalu mulai melaporkan level (0..~1). */
  async startListening(onLevel: (level: number) => void, onAutoStop?: () => void): Promise<void> {
    const md = typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
    if (!md?.getUserMedia) throw new Error("Mikrofon tidak tersedia");
    this.onAutoStop = onAutoStop;
    // iPad Safari: AudioContext hanya boleh dilanjutkan dekat aksi pengguna, jadi sebelum await.
    const ctx = getAudioContext();
    void ctx.resume?.();
    const stream = await md.getUserMedia({ audio: true });
    if (this.disposed) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    void ctx.resume?.();
    this.stream = stream;
    this.source = ctx.createMediaStreamSource(stream);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    const data = new Float32Array(this.analyser.frequencyBinCount);
    const tick = (): void => {
      if (this.disposed || !this.analyser) return;
      this.analyser.getFloatTimeDomainData(data);
      onLevel(computeRMS(data));
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
    this.source.connect(this.analyser);
    if (typeof ctx.createScriptProcessor !== "function") return;
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
    this.analyser.connect(this.processor);
    this.processor.connect(ctx.destination);
  }

  startRecording(): void {
    // Dipanggil dari tombol Rekam (aksi pengguna): kesempatan kedua membuka AudioContext di iPad.
    void getAudioContext().resume?.();
    this.buffers = [];
    this.chunks = [];
    this.recording = true;
    if (this.processor || !this.stream || typeof MediaRecorder === "undefined") return;
    const mime = pickRecorderMime((m) => MediaRecorder.isTypeSupported(m));
    const mr = mime ? new MediaRecorder(this.stream, { mimeType: mime }) : new MediaRecorder(this.stream);
    mr.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    mr.start(250);
    this.mediaRecorder = mr;
    this.autoStopTimer = setTimeout(() => {
      if (this.recording) {
        this.recording = false;
        this.onAutoStop?.();
      }
    }, MAX_RECORD_SECONDS * 1000);
  }

  async stop(): Promise<RecordingResult> {
    this.recording = false;
    if (this.autoStopTimer) clearTimeout(this.autoStopTimer);
    this.autoStopTimer = null;
    const mr = this.mediaRecorder;
    if (mr) {
      this.mediaRecorder = null;
      if (mr.state !== "inactive") {
        await new Promise<void>((resolve) => {
          mr.onstop = () => resolve();
          mr.stop();
        });
      }
      const blob = new Blob(this.chunks, { type: mr.mimeType || "audio/mp4" });
      this.chunks = [];
      const pcm = blob.size > 0 ? await decodeSoundBytes(new Uint8Array(await blob.arrayBuffer())) : { samples: new Float32Array(0), sampleRate: getAudioContext().sampleRate };
      const { levels, trimStart, trimEnd } = autoTrimRecording(pcm.samples);
      return { samples: pcm.samples, sampleRate: pcm.sampleRate, levels, trimStart, trimEnd };
    }
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
    if (this.autoStopTimer) clearTimeout(this.autoStopTimer);
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      try {
        this.mediaRecorder.stop();
      } catch {
        // sudah berhenti
      }
    }
    this.mediaRecorder = null;
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
