/**
 * Primitive kategori Sound - padanan scratch-vm 4.8.102 src/blocks/scratch3_sound.js
 * (BSD-3-Clause, (c) 2016 MIT; logika diport baris demi baris, termasuk urutan cast, clamp,
 * pencarian sound nama -> nomor, waitingSounds, dan Promise.resolve() sebagai yield).
 * Pemilik: agent engine-sound.
 *
 * Perbedaan struktur: Scratch memakai `sprite.soundBank`; di sini satu `runtime.audioEngine` dengan
 * `targetKey = target.id`. Tanpa audio engine semua perintah suara jadi no-op seperti Scratch tanpa
 * soundBank, tetapi state (efek, volume) tetap berubah.
 */
import { Cast } from "../cast";
import type { ScratchValue } from "../types/project-model";
import type {
  BlockArgs,
  BlockPackage,
  BlockPackageFactory,
  BlockUtility,
  IRuntime,
  MonitoredMetadata,
  PrimitiveFn,
} from "../types/runtime";
import type { ITarget } from "../types/target";
import { MathUtil } from "../util/math-util";

/** Kunci custom state target (Scratch3SoundBlocks.STATE_KEY). */
export const SOUND_STATE_KEY = "Scratch.sound";

export type SoundEffectName = "pitch" | "pan";

export interface SoundBlocksState {
  effects: Record<SoundEffectName, number>;
}

/** Batas efek (Scratch3SoundBlocks.EFFECT_RANGE). */
export const SOUND_EFFECT_RANGE: Readonly<Record<SoundEffectName, { min: number; max: number }>> = {
  pitch: { min: -360, max: 360 },
  pan: { min: -100, max: 100 },
};

/** Rentang yang dipakai ekstensi Music (Scratch3SoundBlocks.MIDI_NOTE_RANGE/BEAT_RANGE/TEMPO_RANGE). */
export const MIDI_NOTE_RANGE = { min: 36, max: 96 } as const;
export const BEAT_RANGE = { min: 0, max: 100 } as const;
export const TEMPO_RANGE = { min: 20, max: 500 } as const;

const defaultSoundState = (): SoundBlocksState => ({ effects: { pitch: 0, pan: 0 } });

/** Salin dalam seperti Clone.simple (JSON). */
const cloneState = (s: SoundBlocksState): SoundBlocksState => JSON.parse(JSON.stringify(s)) as SoundBlocksState;

const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** Ambil/buat state suara target (Scratch3SoundBlocks._getSoundState). */
export function getSoundState(target: ITarget): SoundBlocksState {
  let state = target.getCustomState<SoundBlocksState>(SOUND_STATE_KEY);
  if (!state) {
    state = defaultSoundState();
    target.setCustomState(SOUND_STATE_KEY, state);
  }
  return state;
}

/** Cari indeks sound berdasarkan nama persis (perbandingan ===, tanpa cast). */
export function getSoundIndexByName(soundName: unknown, target: ITarget): number {
  const sounds = target.sprite.sounds;
  for (let i = 0; i < sounds.length; i++) {
    if (sounds[i]?.name === soundName) return i;
  }
  return -1;
}

/** Indeks sound dari menu: nama dulu, lalu nomor 1-based (wrapClamp); -1 kalau tidak ketemu. */
export function getSoundIndex(soundName: unknown, target: ITarget): number {
  const len = target.sprite.sounds.length;
  if (len === 0) return -1;
  const index = getSoundIndexByName(soundName, target);
  if (index !== -1) return index;
  const oneIndexedIndex = parseInt(String(soundName), 10);
  if (!isNaN(oneIndexedIndex)) return MathUtil.wrapClamp(oneIndexedIndex - 1, 0, len - 1);
  return -1;
}

class SoundBlocks {
  /** soundId yang ditunggu "play until done", per target id. */
  readonly waitingSounds: Record<string, Set<string>> = {};

  constructor(private readonly runtime: IRuntime) {
    runtime.on("PROJECT_STOP_ALL", () => {
      this.stopAllSounds();
      // Tombol stop membungkam semuanya, termasuk suara clone yang sudah dihapus (di Scratch suara
      // itu berbunyi sampai habis karena targetnya tidak lagi ada di runtime.targets).
      this.runtime.audioEngine?.stopAllSounds();
    });
    runtime.on("PROJECT_STOP_ALL", () => this.clearEffectsForAllTargets());
    runtime.on("STOP_FOR_TARGET", ({ target }) => this.stopWaitingSoundsForTarget(target));
    runtime.on("PROJECT_START", () => this.clearEffectsForAllTargets());
    runtime.on("TARGET_WAS_CREATED", ({ target, source }) => this.onTargetCreated(target, source));
    runtime.on("TARGET_WAS_REMOVED", ({ target }) => this.onTargetRemoved(target));
  }

  private onTargetCreated(newTarget: ITarget, sourceTarget: ITarget | null): void {
    if (!sourceTarget) return;
    const state = sourceTarget.getCustomState<SoundBlocksState>(SOUND_STATE_KEY);
    if (state && newTarget) {
      newTarget.setCustomState(SOUND_STATE_KEY, cloneState(state));
      this.syncEffectsForTarget(newTarget);
    }
  }

  private onTargetRemoved(target: ITarget): void {
    delete this.waitingSounds[target.id];
    this.runtime.audioEngine?.disposeTarget(target.id);
  }

  getPrimitives(): Record<string, PrimitiveFn> {
    return {
      sound_play: (args, util) => this.playSound(args, util),
      sound_playuntildone: (args, util) => this.playSoundAndWait(args, util),
      sound_stopallsounds: () => this.stopAllSounds(),
      sound_seteffectto: (args, util) => this.updateEffect(args, util, false),
      sound_changeeffectby: (args, util) => this.updateEffect(args, util, true),
      sound_cleareffects: (_args, util) => this.clearEffectsForTarget(util.target),
      sound_sounds_menu: (args) => args.SOUND_MENU as ScratchValue,
      sound_beats_menu: (args) => args.BEATS as ScratchValue,
      sound_effects_menu: (args) => args.EFFECT as ScratchValue,
      sound_setvolumeto: (args, util) => this.updateVolume(Cast.toNumber(args.VOLUME as ScratchValue), util),
      sound_changevolumeby: (args, util) =>
        this.updateVolume(Cast.toNumber(args.VOLUME as ScratchValue) + util.target.volume, util),
      sound_volume: (_args, util) => util.target.volume,
    };
  }

  getMonitored(): Record<string, MonitoredMetadata> {
    return {
      sound_volume: {
        isSpriteSpecific: true,
        getId: (targetId) => `${targetId}_volume`,
      },
    };
  }

  playSound(args: BlockArgs, util: BlockUtility): void {
    // Promise sengaja tidak dikembalikan: satu-satunya beda dengan "until done".
    void this.startSound(args, util, false);
  }

  playSoundAndWait(args: BlockArgs, util: BlockUtility): Promise<void> | undefined {
    return this.startSound(args, util, true);
  }

  private startSound(args: BlockArgs, util: BlockUtility, storeWaiting: boolean): Promise<void> | undefined {
    const index = getSoundIndex(args.SOUND_MENU, util.target);
    if (index < 0) return undefined;
    const { target } = util;
    const sound = target.sprite.sounds[index];
    const audio = this.runtime.audioEngine;
    if (!sound || !audio || !sound.soundId) return undefined;
    if (storeWaiting) this.addWaitingSound(target.id, sound.soundId);
    else this.removeWaitingSound(target.id, sound.soundId);
    // setEffectsFromTarget: volume target selalu terbaca saat mulai main.
    this.pushEffects(target);
    return audio.playSound(target.id, sound.soundId);
  }

  private addWaitingSound(targetId: string, soundId: string): void {
    (this.waitingSounds[targetId] ??= new Set()).add(soundId);
  }

  private removeWaitingSound(targetId: string, soundId: string): void {
    this.waitingSounds[targetId]?.delete(soundId);
  }

  stopAllSounds(): void {
    // Hanya target yang masih hidup (Scratch: runtime.targets), termasuk clone.
    for (const target of this.runtime.targets) this.stopAllSoundsForTarget(target);
  }

  private stopAllSoundsForTarget(target: ITarget): void {
    const audio = this.runtime.audioEngine;
    if (!audio) return;
    audio.stopAllSounds(target.id);
    this.waitingSounds[target.id]?.clear();
  }

  private stopWaitingSoundsForTarget(target: ITarget): void {
    const audio = this.runtime.audioEngine;
    if (!audio) return;
    const waiting = this.waitingSounds[target.id];
    if (!waiting) return;
    for (const soundId of waiting.values()) audio.stopSound(target.id, soundId);
    waiting.clear();
  }

  private updateEffect(args: BlockArgs, util: BlockUtility, change: boolean): Promise<void> | undefined {
    const effect = Cast.toString(args.EFFECT as ScratchValue).toLowerCase();
    const value = Cast.toNumber(args.VALUE as ScratchValue);
    const state = getSoundState(util.target);
    if (!hasOwn(state.effects, effect)) return undefined;
    const name = effect as SoundEffectName;
    if (change) state.effects[name] += value;
    else state.effects[name] = value;
    const { min, max } = SOUND_EFFECT_RANGE[name];
    state.effects[name] = MathUtil.clamp(state.effects[name], min, max);
    this.syncEffectsForTarget(util.target);
    // Yield sampai tick berikutnya.
    return Promise.resolve();
  }

  /** Kirim efek target ke audio engine (padanan _syncEffectsForTarget). */
  private syncEffectsForTarget(target: ITarget | null | undefined): void {
    if (!target || !this.runtime.audioEngine) return;
    this.pushEffects(target);
  }

  private pushEffects(target: ITarget): void {
    const audio = this.runtime.audioEngine;
    if (!audio) return;
    const state = target.getCustomState<SoundBlocksState>(SOUND_STATE_KEY);
    audio.setEffects(target.id, {
      pitch: state?.effects.pitch ?? 0,
      pan: state?.effects.pan ?? 0,
      volume: target.volume,
    });
  }

  clearEffectsForTarget(target: ITarget): void {
    const state = getSoundState(target);
    for (const effect of Object.keys(state.effects) as SoundEffectName[]) state.effects[effect] = 0;
    this.syncEffectsForTarget(target);
  }

  private clearEffectsForAllTargets(): void {
    for (const target of this.runtime.targets) this.clearEffectsForTarget(target);
  }

  private updateVolume(volume: number, util: BlockUtility): Promise<void> {
    util.target.volume = MathUtil.clamp(volume, 0, 100);
    this.syncEffectsForTarget(util.target);
    // Yield sampai tick berikutnya.
    return Promise.resolve();
  }
}

export const createSoundBlocks: BlockPackageFactory = (runtime: IRuntime): BlockPackage => {
  const blocks = new SoundBlocks(runtime);
  return {
    getPrimitives: () => blocks.getPrimitives(),
    getHats: () => ({}),
    getMonitored: () => blocks.getMonitored(),
  };
};
