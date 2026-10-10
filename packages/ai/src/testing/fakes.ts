/**
 * Tiruan untuk tes paket AI: runtime minimal, kamera/mikrofon palsu, detektor palsu.
 * Hanya dipakai file *.test.ts (tidak diimpor kode produksi).
 */
import type { IRuntime, RuntimeEventMap } from "@kody/engine";
import { TypedEmitter } from "@kody/engine";
import type { Canvas2DLike, CanvasLike, MediaStreamLike, VideoElementLike } from "../devices/camera";
import type { AnalyserLike, AudioContextLike } from "../devices/microphone";
import { configureAiServices } from "../services";
import type { AiServices, AiServicesOptions } from "../services";
import type { DetectorFactories, ImageEmbedder, VisionDetector } from "../types";

export interface FakeStage {
  videoState: string;
  videoTransparency: number;
  textToSpeechLanguage: string | null;
  state: Map<string, unknown>;
  getCustomState<T>(key: string): T | undefined;
  setCustomState<T>(key: string, value: T): void;
}

export interface FakeRuntime {
  runtime: IRuntime;
  stage: FakeStage;
  emitter: TypedEmitter<RuntimeEventMap>;
  videoFrames: { frame: unknown; transparency: number; mirrored: boolean }[];
  projectChanged: number;
  snapshot: () => Promise<string>;
}

export function createFakeRuntime(opts: { withRenderer?: boolean } = {}): FakeRuntime {
  const emitter = new TypedEmitter<RuntimeEventMap>();
  const state = new Map<string, unknown>();
  const stage: FakeStage = {
    videoState: "on",
    videoTransparency: 50,
    textToSpeechLanguage: null,
    state,
    getCustomState: <T>(key: string) => state.get(key) as T | undefined,
    setCustomState: <T>(key: string, value: T) => void state.set(key, value),
  };
  const fake: FakeRuntime = {
    runtime: null as unknown as IRuntime,
    stage,
    emitter,
    videoFrames: [],
    projectChanged: 0,
    snapshot: async () => "data:image/png;base64,AAAA",
  };
  const renderer =
    opts.withRenderer === false
      ? null
      : {
          setVideoFrame: (frame: unknown, transparency: number, mirrored: boolean) =>
            fake.videoFrames.push({ frame, transparency, mirrored }),
          snapshot: () => fake.snapshot(),
        };
  fake.runtime = {
    ioDevices: { video: null },
    renderer,
    getTargetForStage: () => stage,
    on: (e: keyof RuntimeEventMap, fn: (p: never) => void) => emitter.on(e, fn as never),
    off: (e: keyof RuntimeEventMap, fn: (p: never) => void) => emitter.off(e, fn as never),
    emit: (e: keyof RuntimeEventMap, p: unknown) => emitter.emit(e, p as never),
    emitProjectChanged: () => void fake.projectChanged++,
  } as unknown as IRuntime;
  return fake;
}

export interface FakeTrack {
  stopped: boolean;
  stop(): void;
}

export function fakeStream(): MediaStreamLike & { tracks: FakeTrack[] } {
  const track: FakeTrack = {
    stopped: false,
    stop() {
      this.stopped = true;
    },
  };
  return { tracks: [track], getTracks: () => [track] };
}

export function fakeVideo(): VideoElementLike & { playing: boolean } {
  let playing = false;
  return {
    srcObject: null,
    muted: false,
    playsInline: false,
    get videoWidth() {
      return playing ? 640 : 0;
    },
    get videoHeight() {
      return playing ? 480 : 0;
    },
    get playing() {
      return playing;
    },
    play: async () => {
      playing = true;
    },
    pause: () => {
      playing = false;
    },
  };
}

export function fakeCanvas(): CanvasLike & { ops: string[] } {
  const ops: string[] = [];
  const ctx: Canvas2DLike = {
    save: () => ops.push("save"),
    restore: () => ops.push("restore"),
    translate: (x, y) => ops.push(`translate(${x},${y})`),
    scale: (x, y) => ops.push(`scale(${x},${y})`),
    clearRect: () => ops.push("clear"),
    drawImage: (_i, x, y, w, h) => ops.push(`draw(${x},${y},${w},${h})`),
    getImageData: (_x, _y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }) as unknown as ImageData,
  };
  return { width: 0, height: 0, ops, getContext: () => ctx };
}

export interface FakeMediaEnv {
  streams: (MediaStreamLike & { tracks: FakeTrack[] })[];
  requests: MediaStreamConstraints[];
  deny: boolean;
  /** Tahan getUserMedia sampai release() dipanggil. */
  hold: boolean;
  release: () => void;
  getUserMedia: (c: MediaStreamConstraints) => Promise<MediaStreamLike>;
}

export function fakeMediaEnv(): FakeMediaEnv {
  const waiting: (() => void)[] = [];
  const env: FakeMediaEnv = {
    streams: [],
    requests: [],
    deny: false,
    hold: false,
    release: () => {
      for (const w of waiting.splice(0)) w();
    },
    getUserMedia: async (c) => {
      env.requests.push(c);
      if (env.hold) await new Promise<void>((r) => waiting.push(r));
      if (env.deny) throw Object.assign(new Error("denied"), { name: "NotAllowedError" });
      const s = fakeStream();
      env.streams.push(s);
      return s;
    },
  };
  return env;
}

export function fakeAudioContext(levelDb = -30): AudioContextLike & { closed: boolean } {
  const analyser: AnalyserLike = {
    fftSize: 1024,
    smoothingTimeConstant: 0,
    get frequencyBinCount() {
      return this.fftSize / 2;
    },
    getFloatFrequencyData: (out) => out.fill(levelDb),
  };
  const ctx = {
    sampleRate: 48000,
    closed: false,
    createMediaStreamSource: () => ({ connect: () => {}, disconnect: () => {} }),
    createAnalyser: () => analyser,
    close: async () => {
      ctx.closed = true;
    },
  };
  return ctx;
}

export function fakeDetector<R>(results: R[] | (() => R)): VisionDetector<R> & { calls: number; disposed: boolean } {
  const d = {
    calls: 0,
    disposed: false,
    detect: async () => {
      const r = typeof results === "function" ? (results as () => R)() : (results[Math.min(d.calls, results.length - 1)] as R);
      d.calls++;
      return r;
    },
    dispose: () => {
      d.disposed = true;
    },
  };
  return d;
}

export function fakeEmbedder(vec: () => Float32Array): ImageEmbedder & { calls: number } {
  const e = {
    calls: 0,
    embed: async () => {
      e.calls++;
      return vec();
    },
    dispose: () => {},
  };
  return e;
}

/** Layanan AI dengan perangkat palsu (tanpa DOM). */
export function fakeServices(
  fake: FakeRuntime,
  detectors: Partial<DetectorFactories> = {},
  extra: Partial<AiServicesOptions> = {},
): { services: AiServices; media: FakeMediaEnv; canvas: ReturnType<typeof fakeCanvas> } {
  const media = fakeMediaEnv();
  const canvas = fakeCanvas();
  const services = configureAiServices(fake.runtime, {
    visibility: null,
    camera: { getUserMedia: media.getUserMedia, createVideo: fakeVideo, createCanvas: () => canvas },
    microphone: { getUserMedia: media.getUserMedia, createAudioContext: () => fakeAudioContext() },
    detectors,
    fetchVerified: async () => {
      throw new Error("jaringan tidak dipakai di tes");
    },
    speech: { ctor: null },
    tts: { synth: null },
    decodeSnapshot: async () => fakeCanvas() as unknown as HTMLCanvasElement,
    ...extra,
  });
  return { services, media, canvas };
}
