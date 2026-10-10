/**
 * Rantai efek per sound (Pan, Pitch, Volume). Port dari scratch-audio 1.0.325
 * src/effects/EffectChain.js (BSD-3-Clause, (c) 2016 MIT).
 *
 * Aliran sinyal: player -> chain.input -> Volume -> (Pitch: tanpa node) -> Pan -> tujuan.
 */
import {
  type AudioCore,
  type Effect,
  type EffectName,
  type EffectOwner,
  type InputProvider,
  PanEffect,
  PitchEffect,
  type PlaybackRateSink,
  VolumeEffect,
} from "./effects";

export interface EffectValues {
  pitch?: number;
  pan?: number;
  volume?: number;
}

export class EffectChain implements EffectOwner, InputProvider {
  readonly inputNode: GainNode;
  target: InputProvider | null = null;
  readonly pan: PanEffect;
  readonly pitch: PitchEffect;
  readonly volume: VolumeEffect;
  /** Urutan scratch-audio: [Pan, Pitch, Volume]; firstEffect = Pan (paling dekat keluaran). */
  private readonly effects: Effect[];
  private readonly players = new Set<PlaybackRateSink>();

  constructor(private readonly audioEngine: AudioCore) {
    this.inputNode = audioEngine.audioContext.createGain();
    // Dibuat terbalik agar setiap efek merujuk efek hulunya (lastEffect).
    this.volume = new VolumeEffect(audioEngine, this, null);
    this.pitch = new PitchEffect(audioEngine, this, this.volume);
    this.pan = new PanEffect(audioEngine, this, this.pitch);
    this.effects = [this.pan, this.pitch, this.volume];
  }

  private get firstEffect(): Effect {
    return this.pan;
  }
  private get lastEffect(): Effect {
    return this.volume;
  }

  clone(): EffectChain {
    const chain = new EffectChain(this.audioEngine);
    if (this.target) chain.connect(this.target);
    return chain;
  }

  addSoundPlayer(player: PlaybackRateSink): void {
    if (!this.players.has(player)) {
      this.players.add(player);
      this.update();
    }
  }

  removeSoundPlayer(player: PlaybackRateSink): void {
    this.players.delete(player);
  }

  getSoundPlayers(): PlaybackRateSink[] {
    return [...this.players];
  }

  getInputNode(): AudioNode {
    return this.inputNode;
  }

  connect(target: InputProvider): void {
    if (target === this.lastEffect) {
      this.inputNode.disconnect();
      this.inputNode.connect(this.lastEffect.getInputNode());
      return;
    }
    if (target === this.firstEffect) return;
    this.target = target;
    this.firstEffect.connect(target);
  }

  /**
   * Setel efek dari nilai target (padanan setEffectsFromTarget). Hanya nilai yang ada yang disetel,
   * urutan Pan, Pitch, Volume.
   */
  setEffectValues(values: EffectValues): void {
    for (const effect of this.effects) {
      const v = values[effect.name];
      if (typeof v === "number") effect.set(v);
    }
  }

  set(name: EffectName, value: number): void {
    this[name].set(value);
  }

  update(): void {
    for (const e of this.effects) e.update();
  }

  clear(): void {
    for (const e of this.effects) e.clear();
  }

  dispose(): void {
    this.players.clear();
    for (const e of this.effects) e.dispose();
    this.inputNode.disconnect();
  }
}
