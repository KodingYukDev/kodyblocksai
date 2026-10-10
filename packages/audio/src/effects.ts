/**
 * Efek suara Scratch: Pan, Pitch, Volume.
 * Port dari scratch-audio 1.0.325 src/effects/{Effect,PanEffect,PitchEffect,VolumeEffect}.js
 * (BSD-3-Clause, (c) 2016 MIT). Logika "patch" (efek hanya disambung ke graf bila nilainya bukan
 * default) dipertahankan: pan 0 dan volume 100 = bypass, sehingga level suara identik Scratch.
 */

/** Konteks yang dibutuhkan efek & player (bagian dari AudioEngine). */
export interface AudioCore {
  readonly audioContext: BaseAudioContext;
  readonly currentTime: number;
  /** Konstanta waktu transisi parameter (detik), scratch-audio DECAY_DURATION. */
  readonly DECAY_DURATION: number;
  /** Jeda sebelum transisi (detik), scratch-audio DECAY_WAIT. */
  readonly DECAY_WAIT: number;
}

export const DECAY_DURATION = 0.025;
export const DECAY_WAIT = 0.05;

/** Clamp efek sesuai scratch-vm Scratch3SoundBlocks.EFFECT_RANGE: pitch -360..360, pan -100..100. */
export const EFFECT_RANGE = {
  pitch: { min: -360, max: 360 },
  pan: { min: -100, max: 100 },
} as const;

/** playbackRate dari nilai efek pitch: 2^((pitch/10)/12), persis PitchEffect.getRatio. */
export function pitchToPlaybackRate(pitch: number): number {
  const interval = pitch / 10;
  return Math.pow(2, interval / 12);
}

/** Gain kiri/kanan equal-power dari nilai pan -100..100, persis PanEffect._set. */
export function panToGains(pan: number): { left: number; right: number } {
  const p = (pan + 100) / 200;
  return { left: Math.cos((p * Math.PI) / 2), right: Math.sin((p * Math.PI) / 2) };
}

/** Sesuatu yang punya node masukan (engine, efek, chain). */
export interface InputProvider {
  getInputNode(): AudioNode;
  /** Tujuan keluaran (untuk deteksi sambungan melingkar). */
  readonly target?: InputProvider | null;
}

/** Pemilik efek: EffectChain (mengelola banyak player) atau satu SoundPlayer (efek fade). */
export interface EffectOwner {
  connect(target: InputProvider): unknown;
  getSoundPlayers?(): PlaybackRateSink[];
}

export interface PlaybackRateSink {
  setPlaybackRate(value: number): void;
}

export type EffectName = "pan" | "pitch" | "volume";

export abstract class Effect implements InputProvider {
  abstract readonly name: EffectName;
  value: number;
  initialized = false;
  inputNode: AudioNode | null = null;
  outputNode: AudioNode | null = null;
  target: InputProvider | null = null;
  protected lastPatchTime: number | undefined = undefined;

  constructor(
    readonly audioEngine: AudioCore,
    public audioPlayer: EffectOwner | null,
    readonly lastEffect: Effect | null,
  ) {
    this.value = this.DEFAULT_VALUE;
  }

  get DEFAULT_VALUE(): number {
    return 0;
  }

  /** Apakah efek ini sedang disisipkan di graf audio. */
  get isPatch(): boolean {
    return this.initialized && (this.value !== this.DEFAULT_VALUE || this.audioPlayer === null);
  }

  getInputNode(): AudioNode {
    if (this.isPatch && this.inputNode) return this.inputNode;
    if (!this.target) throw new Error(`${this.name}: efek belum tersambung`);
    return this.target.getInputNode();
  }

  protected abstract initialize(): void;
  protected abstract applyValue(value: number): void;

  set(value: number): void {
    if (!this.initialized) this.initialize();
    const wasPatch = this.isPatch;
    if (wasPatch) this.lastPatchTime = this.audioEngine.currentTime;
    this.applyValue(value);
    if (this.isPatch !== wasPatch && this.target !== null) this.connect(this.target);
  }

  /** Dipanggil saat daftar player pemilik berubah. */
  update(): void {}

  clear(): void {
    this.set(this.DEFAULT_VALUE);
  }

  connect(target: InputProvider): void {
    let sub: InputProvider | null | undefined = target;
    while (sub) {
      if (sub === this) throw new Error("Effect cannot connect to itself");
      sub = sub.target;
    }
    this.target = target;
    if (this.outputNode !== null) this.outputNode.disconnect();
    const { currentTime, DECAY_DURATION: decay } = this.audioEngine;
    const recentlyPatched = this.lastPatchTime !== undefined && this.lastPatchTime + decay < currentTime;
    if (this.outputNode && (this.isPatch || recentlyPatched)) {
      this.outputNode.connect(target.getInputNode());
    }
    if (this.lastEffect === null) {
      if (this.audioPlayer !== null) this.audioPlayer.connect(this);
    } else {
      this.lastEffect.connect(this);
    }
  }

  dispose(): void {
    this.inputNode = null;
    this.outputNode = null;
    this.target = null;
    this.initialized = false;
  }
}

export class PanEffect extends Effect {
  readonly name = "pan";
  private leftGain: GainNode | null = null;
  private rightGain: GainNode | null = null;
  private merger: ChannelMergerNode | null = null;

  protected initialize(): void {
    const ctx = this.audioEngine.audioContext;
    const input = ctx.createGain();
    this.leftGain = ctx.createGain();
    this.rightGain = ctx.createGain();
    this.merger = ctx.createChannelMerger(2);
    this.inputNode = input;
    this.outputNode = this.merger;
    input.connect(this.leftGain);
    input.connect(this.rightGain);
    this.leftGain.connect(this.merger, 0, 0);
    this.rightGain.connect(this.merger, 0, 1);
    this.initialized = true;
  }

  protected applyValue(value: number): void {
    this.value = value;
    const { left, right } = panToGains(value);
    const { currentTime, DECAY_WAIT: wait, DECAY_DURATION: decay } = this.audioEngine;
    this.leftGain?.gain.setTargetAtTime(left, currentTime + wait, decay);
    this.rightGain?.gain.setTargetAtTime(right, currentTime + wait, decay);
  }

  override dispose(): void {
    if (!this.initialized) return;
    this.inputNode?.disconnect();
    this.leftGain?.disconnect();
    this.rightGain?.disconnect();
    this.merger?.disconnect();
    this.leftGain = null;
    this.rightGain = null;
    this.merger = null;
    super.dispose();
  }
}

/** Pitch tidak menyisipkan node; ia mengubah playbackRate semua player pemilik. */
export class PitchEffect extends Effect {
  readonly name = "pitch";
  ratio = 1;

  override get isPatch(): boolean {
    return false;
  }

  override getInputNode(): AudioNode {
    if (!this.target) throw new Error("pitch: efek belum tersambung");
    return this.target.getInputNode();
  }

  protected initialize(): void {
    this.initialized = true;
  }

  protected applyValue(value: number): void {
    this.value = value;
    this.ratio = pitchToPlaybackRate(value);
    this.updatePlayers();
  }

  override update(): void {
    this.updatePlayers();
  }

  private updatePlayers(): void {
    const players = this.audioPlayer?.getSoundPlayers?.();
    if (!players) return;
    for (const p of players) p.setPlaybackRate(this.ratio);
  }
}

export class VolumeEffect extends Effect {
  readonly name = "volume";

  override get DEFAULT_VALUE(): number {
    return 100;
  }

  protected initialize(): void {
    const gain = this.audioEngine.audioContext.createGain();
    this.inputNode = gain;
    this.outputNode = gain;
    this.initialized = true;
  }

  protected applyValue(value: number): void {
    this.value = value;
    const gain = (this.outputNode as GainNode | null)?.gain;
    const { currentTime, DECAY_DURATION: decay } = this.audioEngine;
    gain?.linearRampToValueAtTime(value / 100, currentTime + decay);
  }

  override dispose(): void {
    if (!this.initialized) return;
    this.outputNode?.disconnect();
    super.dispose();
  }
}
