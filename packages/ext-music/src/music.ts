/**
 * Ekstensi Music - perilaku identik scratch-vm 4.8.102 extensions/scratch3_music (BSD-3-Clause):
 * drum 18, instrumen 21, tempo 20..500 di stage, beat -> detik = 60/tempo * beat (beat 0..100),
 * nada 0..130, wrapClamp nomor drum/instrumen, blok legacy MIDI Scratch 2.
 * Opcode: MUSIC_OPCODES di @kody/engine. Pemilik: agent ext-music.
 */
import { Cast } from "@kody/engine/cast";
import { MathUtil } from "@kody/engine/util/math-util";
import type { BlockArgs, BlockUtility, ExtensionModule, IRuntime, ITarget, PrimitiveFn } from "@kody/engine";
import { WebAudioMusicOutput } from "./music-audio";
import type { MusicSoundOutput } from "./music-audio";
import {
  BEAT_RANGE,
  defaultMusicState,
  DRUM_INFO,
  getMusicInfo,
  INSTRUMENT_INFO,
  MIDI_DRUMS,
  MIDI_INSTRUMENTS,
  MIDI_NOTE_RANGE,
  MUSIC_EXTENSION_ID,
  MUSIC_STATE_KEY,
  TEMPO_RANGE,
} from "./music-info";
import type { MusicLocale, MusicState } from "./music-info";
import { MusicSampleBank } from "./music-samples";
import type { MusicSampleBankOptions } from "./music-samples";

export { MUSIC_EXTENSION_ID };

export interface MusicExtensionOptions {
  locale?: MusicLocale;
  /**
   * Keluaran suara khusus (tes / host lain). Default: WebAudio dari runtime.audioEngine.context,
   * dibuat malas saat bunyi pertama.
   */
  output?: MusicSoundOutput | null;
  /** Opsi bank sampel (URL, fetch). */
  samples?: MusicSampleBankOptions;
  /** false = jangan muat mp3 (pakai sintesis saja). Default true. */
  loadSamples?: boolean;
}

export interface MusicExtensionModule extends ExtensionModule {
  getMusicState(target: ITarget): MusicState;
  /** Padanan event PLAY_NOTE (klik piano pada argumen nada) untuk target yang sedang diedit. */
  playNoteForPicker(note: number, category?: string): void;
  getTempo(): number;
}

function cloneSimple<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function clampBeats(beats: number): number {
  return MathUtil.clamp(beats, BEAT_RANGE.min, BEAT_RANGE.max);
}

export function createMusicExtensionWithOptions(runtime: IRuntime, options: MusicExtensionOptions = {}): MusicExtensionModule {
  const locale = options.locale ?? "id";
  let output: MusicSoundOutput | null = options.output ?? null;
  let bank: MusicSampleBank | null = null;

  /** Keluaran WebAudio dibuat saat audio engine sudah ada (padanan _loadAllSounds + decode). */
  const getOutput = (): MusicSoundOutput | null => {
    if (output) return output;
    const engine = runtime.audioEngine;
    const ctx = engine?.context ?? null;
    if (!engine || !ctx) return null;
    bank = new MusicSampleBank(ctx, options.samples);
    if (options.loadSamples !== false) void bank.loadAll();
    // scratch-audio: musik ke engine.getInputNode() (master), bukan ke rantai efek sprite.
    const master = (engine as { getInputNode?: () => AudioNode | null }).getInputNode?.() ?? ctx.destination;
    output = new WebAudioMusicOutput(ctx, master, bank);
    return output;
  };

  // Scratch memuat semua sampel saat ekstensi dibuat; lakukan juga bila audio sudah siap.
  if (!options.output && runtime.audioEngine?.context) getOutput();

  const getMusicState = (target: ITarget): MusicState => {
    let state = target.getCustomState<MusicState>(MUSIC_STATE_KEY);
    if (!state) {
      state = defaultMusicState();
      target.setCustomState(MUSIC_STATE_KEY, state);
    }
    return state;
  };

  const offCreated = runtime.on("TARGET_WAS_CREATED", ({ target, source }) => {
    if (!source) return;
    const state = source.getCustomState<MusicState>(MUSIC_STATE_KEY);
    if (state) target.setCustomState(MUSIC_STATE_KEY, cloneSimple(state));
  });

  const getTempo = (): number => {
    const stage = runtime.getTargetForStage();
    if (stage) return stage.tempo;
    return 60;
  };

  const updateTempo = (tempo: number): void => {
    const clamped = MathUtil.clamp(tempo, TEMPO_RANGE.min, TEMPO_RANGE.max);
    const stage = runtime.getTargetForStage();
    if (stage) stage.tempo = clamped;
  };

  const beatsToSec = (beats: number): number => (60 / getTempo()) * beats;

  /** Pola timer Scratch: start -> yield; berikutnya yield sampai durasi habis. */
  const startStackTimer = (util: BlockUtility, durationSec: number): void => {
    util.startStackTimer(durationSec * 1000);
    util.yield();
  };
  const checkStackTimer = (util: BlockUtility): void => {
    if (!util.stackTimerFinished()) util.yield();
  };

  const playDrumNum = (util: BlockUtility, drumNum: number): void => {
    if (util.runtime.audioEngine === null && !options.output) return;
    const out = getOutput();
    if (!out) return;
    out.playDrum(drumNum, util.target.volume / 100);
  };

  const playNote = (target: ITarget, note: number, durationSec: number): void => {
    if (runtime.audioEngine === null && !options.output) return;
    const out = getOutput();
    if (!out) return;
    const inst = getMusicState(target).currentInstrument;
    out.playNote(inst, note, durationSec, target.volume / 100);
  };

  const playDrumForBeatsImpl = (drumArg: unknown, beatsArg: unknown, util: BlockUtility): void => {
    if (util.stackTimerNeedsInit()) {
      let drumNum = Math.round(Cast.toNumber(drumArg));
      drumNum -= 1; // drum 1-based
      drumNum = MathUtil.wrapClamp(drumNum, 0, DRUM_INFO.length - 1);
      const beats = clampBeats(Cast.toNumber(beatsArg));
      playDrumNum(util, drumNum);
      startStackTimer(util, beatsToSec(beats));
    } else {
      checkStackTimer(util);
    }
  };

  const playDrumForBeats = (args: BlockArgs, util: BlockUtility): void => {
    playDrumForBeatsImpl(args.DRUM, args.BEATS, util);
  };

  const midiPlayDrumForBeats = (args: BlockArgs, util: BlockUtility): void => {
    let drumNum = Math.round(Cast.toNumber(args.DRUM));
    const midiDescription = MIDI_DRUMS[drumNum - 35];
    drumNum = midiDescription ? (midiDescription[0] as number) : 2; // default Scratch 2.0
    drumNum += 1; // _playDrumForBeats menerima nomor 1-based
    playDrumForBeatsImpl(drumNum, args.BEATS, util);
  };

  const restForBeats = (args: BlockArgs, util: BlockUtility): void => {
    if (util.stackTimerNeedsInit()) {
      const beats = clampBeats(Cast.toNumber(args.BEATS));
      startStackTimer(util, beatsToSec(beats));
    } else {
      checkStackTimer(util);
    }
  };

  const playNoteForBeats = (args: BlockArgs, util: BlockUtility): void => {
    if (util.stackTimerNeedsInit()) {
      const note = MathUtil.clamp(Cast.toNumber(args.NOTE), MIDI_NOTE_RANGE.min, MIDI_NOTE_RANGE.max);
      const beats = clampBeats(Cast.toNumber(args.BEATS));
      // Durasi 0: tidak berbunyi dan tidak yield (Scratch 2: "play note for 0 beats" diam).
      if (beats === 0) return;
      const durationSec = beatsToSec(beats);
      playNote(util.target, note, durationSec);
      startStackTimer(util, durationSec);
    } else {
      checkStackTimer(util);
    }
  };

  const setInstrumentImpl = (instArg: unknown, util: BlockUtility, mapMidi: boolean): void => {
    const state = getMusicState(util.target);
    let instNum = Math.round(Cast.toNumber(instArg));
    instNum -= 1; // instrumen 1-based
    if (mapMidi) instNum = (MIDI_INSTRUMENTS[instNum] || 0) - 1;
    instNum = MathUtil.wrapClamp(instNum, 0, INSTRUMENT_INFO.length - 1);
    state.currentInstrument = instNum;
  };

  const primitives: Record<string, PrimitiveFn> = {
    playDrumForBeats,
    midiPlayDrumForBeats,
    restForBeats,
    playNoteForBeats,
    setInstrument: (args, util) => setInstrumentImpl(args.INSTRUMENT, util, false),
    midiSetInstrument: (args, util) => setInstrumentImpl(args.INSTRUMENT, util, true),
    setTempo: (args) => updateTempo(Cast.toNumber(args.TEMPO)),
    changeTempo: (args) => updateTempo(Cast.toNumber(args.TEMPO) + getTempo()),
    getTempo: () => getTempo(),
  };

  return {
    getInfo: () => getMusicInfo(locale),
    getPrimitives: () => primitives,
    getMusicState,
    getTempo,
    playNoteForPicker: (note: number, category?: string) => {
      if (category !== undefined && category !== getMusicInfo(locale).name) return;
      const target = runtime.getEditingTarget();
      if (!target) return;
      playNote(target, note, 0.25);
    },
    dispose: () => {
      offCreated();
      output?.dispose();
      if (!options.output) output = null;
      bank = null;
    },
  };
}

export function createMusicExtension(runtime: IRuntime): MusicExtensionModule {
  return createMusicExtensionWithOptions(runtime);
}
