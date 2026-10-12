/**
 * Audio engine WebAudio, padanan scratch-audio AudioEngine + SoundBank (BSD-3-Clause, (c) 2016 MIT;
 * struktur SoundBank.playSound/setEffects/stop diport dari 1.0.325).
 *
 * Satu bank global berisi satu SoundPlayer + satu EffectChain per soundId. Karena soundId unik per
 * sprite (didekode per sprite), ini setara SoundBank per sprite di Scratch: sound yang sama hanya bisa
 * berbunyi sekali sekaligus di antara sprite asli dan semua clone-nya; target terakhir yang
 * memainkannya menentukan efeknya.
 */
import type { DecodedSound, SoundEffects } from "@kody/engine";
import { decodeToAudioBuffer } from "./decode";
import { EffectChain } from "./effect-chain";
import { type AudioCore, DECAY_DURATION, DECAY_WAIT, type InputProvider } from "./effects";
import { createLoudnessMeter, type LoudnessMeter } from "./loudness";
import { SoundPlayer } from "./sound-player";
import type { AudioEngineOptions, KodyAudioEngine } from "./types";

const GESTURE_EVENTS = ["pointerdown", "mousedown", "touchstart", "touchend", "keydown"] as const;

function defaultCreateContext(): AudioContext | null {
  const g = globalThis as unknown as {
    AudioContext?: new () => AudioContext;
    webkitAudioContext?: new () => AudioContext;
  };
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  if (!Ctor) return null;
  try {
    return new Ctor();
  } catch {
    return null;
  }
}

function defaultCreateId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `snd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

class AudioEngineImpl implements KodyAudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private core: AudioCore | null = null;
  private masterProvider: InputProvider | null = null;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly players = new Map<string, SoundPlayer>();
  /** Rantai efek per soundId (SoundBank.soundEffects). */
  private readonly chains = new Map<string, EffectChain>();
  /** Target terakhir yang memainkan soundId (SoundBank.playerTargets). */
  private readonly playerTargets = new Map<string, string>();
  /** Efek terakhir yang disinkronkan per target. */
  private readonly targetEffects = new Map<string, SoundEffects>();
  private loudness: LoudnessMeter | null = null;
  private gestureCleanup: (() => void) | null = null;
  private disposed = false;
  private readonly createId: () => string;

  constructor(private readonly opts: AudioEngineOptions) {
    this.createId = opts.createId ?? defaultCreateId;
    if (opts.context) this.ensureContext();
  }

  get context(): AudioContext | null {
    return this.ensureContext();
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx || this.disposed) return this.ctx;
    const ctx = this.opts.context ?? (this.opts.createContext ?? defaultCreateContext)();
    if (!ctx) return null;
    this.ctx = ctx;
    const master = ctx.createGain();
    master.connect(ctx.destination);
    this.master = master;
    this.masterProvider = { getInputNode: () => master, target: null };
    this.core = {
      audioContext: ctx,
      get currentTime() {
        return ctx.currentTime;
      },
      DECAY_DURATION,
      DECAY_WAIT,
    };
    this.installGestureResume();
    return ctx;
  }

  /**
   * iOS/iPadOS Safari: AudioContext baru selalu "suspended" sampai ada gesture, dan bisa kembali
   * "suspended"/"interrupted" setelah app ke latar belakang, telepon masuk, atau layar dikunci.
   * Karena itu listener gesture tetap terpasang (cek state murah) sampai dispose, dan saat tab
   * kembali terlihat context dicoba di-resume. Gesture pertama juga memutar buffer hening 1 sampel:
   * WebKit lama hanya "membuka kunci" audio bila ada sumber yang benar-benar diputar dalam gesture.
   */
  private installGestureResume(): void {
    const wanted = this.opts.resumeOnGesture ?? typeof document !== "undefined";
    if (!wanted || typeof document === "undefined") return;
    let unlocked = false;
    const handler = (): void => {
      const ctx = this.ctx;
      if (!ctx || this.disposed) return;
      if (!unlocked) {
        unlocked = true;
        this.playSilentBuffer(ctx);
      }
      if (ctx.state !== "running") void this.resume();
    };
    const onVisible = (): void => {
      if (document.visibilityState === "visible" && this.ctx && this.ctx.state !== "running") void this.resume();
    };
    const listenOpts: AddEventListenerOptions = { capture: true, passive: true };
    for (const ev of GESTURE_EVENTS) document.addEventListener(ev, handler, listenOpts);
    document.addEventListener("visibilitychange", onVisible);
    this.gestureCleanup = () => {
      for (const ev of GESTURE_EVENTS) document.removeEventListener(ev, handler, listenOpts);
      document.removeEventListener("visibilitychange", onVisible);
      this.gestureCleanup = null;
    };
  }

  private playSilentBuffer(ctx: AudioContext): void {
    try {
      const buffer = ctx.createBuffer(1, 1, ctx.sampleRate || 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
    } catch {
      // Context tertutup atau mock tanpa dukungan: tidak penting, resume() tetap dicoba.
    }
  }

  private getChain(soundId: string): EffectChain | null {
    const existing = this.chains.get(soundId);
    if (existing) return existing;
    if (!this.core || !this.masterProvider) return null;
    const chain = new EffectChain(this.core);
    chain.connect(this.masterProvider);
    this.chains.set(soundId, chain);
    return chain;
  }

  private addBuffer(buffer: AudioBuffer): string {
    const soundId = this.createId();
    this.buffers.set(soundId, buffer);
    if (this.core) this.players.set(soundId, new SoundPlayer(this.core, soundId, buffer));
    return soundId;
  }

  async decodeSound(data: ArrayBuffer, dataFormat: string): Promise<DecodedSound> {
    void dataFormat; // format dideteksi dari isi file, sama seperti scratch-audio
    const ctx = this.ensureContext();
    if (!ctx) return { soundId: "", rate: 0, sampleCount: 0 };
    const buffer = await decodeToAudioBuffer(ctx, data);
    const soundId = this.addBuffer(buffer);
    return { soundId, rate: buffer.sampleRate, sampleCount: buffer.length };
  }

  registerBuffer(buffer: AudioBuffer): string {
    this.ensureContext();
    return this.addBuffer(buffer);
  }

  getAudioBuffer(soundId: string): AudioBuffer | null {
    return this.buffers.get(soundId) ?? null;
  }

  playSound(targetKey: string, soundId: string): Promise<void> {
    const player = this.players.get(soundId);
    const chain = this.getChain(soundId);
    if (!player || !chain) return Promise.resolve();
    if (this.playerTargets.get(soundId) !== targetKey) {
      // Hentikan pemutaran target lain lebih dulu ("fork" keluaran sebelum efek diganti).
      player.stop();
    }
    this.playerTargets.set(soundId, targetKey);
    chain.addSoundPlayer(player);
    const fx = this.targetEffects.get(targetKey);
    if (fx) chain.setEffectValues(fx);
    player.connect(chain);
    player.play();
    return player.finished();
  }

  stopSound(targetKey: string, soundId: string): void {
    if (this.playerTargets.get(soundId) === targetKey) this.players.get(soundId)?.stop();
  }

  stopAllSounds(targetKey?: string): void {
    this.playerTargets.forEach((playerTarget, soundId) => {
      if (targetKey === undefined || playerTarget === targetKey) this.players.get(soundId)?.stop();
    });
  }

  isSoundPlaying(targetKey: string, soundId: string): boolean {
    return this.playerTargets.get(soundId) === targetKey && (this.players.get(soundId)?.isPlaying ?? false);
  }

  setEffects(targetKey: string, effects: SoundEffects): void {
    const fx: SoundEffects = { pitch: effects.pitch, pan: effects.pan, volume: effects.volume };
    this.targetEffects.set(targetKey, fx);
    this.playerTargets.forEach((playerTarget, soundId) => {
      if (playerTarget === targetKey) this.chains.get(soundId)?.setEffectValues(fx);
    });
  }

  disposeTarget(targetKey: string): void {
    // Sound yang sedang diputar clone tetap berbunyi sampai habis, sama seperti Scratch.
    this.targetEffects.delete(targetKey);
  }

  getSoundDuration(soundId: string): number {
    return this.buffers.get(soundId)?.duration ?? 0;
  }

  getLoudness(): number {
    const ctx = this.ensureContext();
    if (!ctx) return -1;
    if (!this.loudness) {
      this.loudness = createLoudnessMeter({
        context: ctx,
        getUserMedia: this.opts.getUserMedia,
        onActiveChange: this.opts.onMicrophoneActiveChange,
      });
    }
    return this.loudness.getLoudness();
  }

  releaseMicrophone(): void {
    this.loudness?.release();
  }

  getTargetOutput(targetKey: string): AudioNode | null {
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return null;
    // Sama dengan ekstensi Music Scratch: gain volume target (dibaca saat ini) langsung ke master.
    const volume = this.targetEffects.get(targetKey)?.volume ?? 100;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume / 100, ctx.currentTime);
    gain.connect(this.master);
    return gain;
  }

  getMasterInput(): AudioNode | null {
    this.ensureContext();
    return this.master;
  }

  async resume(): Promise<void> {
    const ctx = this.ensureContext();
    if (ctx && ctx.state === "suspended" && typeof ctx.resume === "function") {
      try {
        await ctx.resume();
      } catch {
        // Browser menolak tanpa gesture; dicoba lagi pada gesture berikutnya.
      }
    }
  }

  unloadSound(soundId: string): void {
    this.players.get(soundId)?.dispose();
    this.chains.get(soundId)?.dispose();
    this.players.delete(soundId);
    this.chains.delete(soundId);
    this.buffers.delete(soundId);
    this.playerTargets.delete(soundId);
  }

  dispose(): void {
    this.gestureCleanup?.();
    for (const id of [...this.players.keys()]) this.unloadSound(id);
    this.buffers.clear();
    this.playerTargets.clear();
    this.targetEffects.clear();
    this.loudness?.dispose();
    this.loudness = null;
    this.master?.disconnect();
    this.disposed = true;
  }
}

/** Buat audio engine. Tanpa WebAudio (node/tes) `context` null dan semua operasi jadi no-op. */
export function createAudioEngine(opts: AudioEngineOptions = {}): KodyAudioEngine {
  return new AudioEngineImpl(opts);
}
