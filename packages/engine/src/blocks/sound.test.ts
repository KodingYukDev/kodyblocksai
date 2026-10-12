import { describe, expect, it } from "vitest";
import type { IAudioEngine, SoundEffects } from "../types/audio";
import type { BlockUtility, IRuntime, PrimitiveFn, RuntimeEventMap } from "../types/runtime";
import type { ITarget } from "../types/target";
import { TypedEmitter } from "../util/event-emitter";
import { createSoundBlocks, getSoundIndex, SOUND_STATE_KEY, type SoundBlocksState } from "./sound";

class FakeAudio {
  readonly log: string[] = [];
  readonly effects = new Map<string, SoundEffects>();
  readonly pending: { target: string; soundId: string; resolve: () => void }[] = [];
  readonly context = null;
  decodeSound = (): never => {
    throw new Error("tidak dipakai");
  };
  playSound(target: string, soundId: string): Promise<void> {
    this.log.push(`play ${target} ${soundId}`);
    return new Promise((resolve) => this.pending.push({ target, soundId, resolve }));
  }
  stopSound(target: string, soundId: string): void {
    this.log.push(`stop ${target} ${soundId}`);
  }
  stopAllSounds(target?: string): void {
    this.log.push(`stopAll ${target ?? "*"}`);
  }
  isSoundPlaying(): boolean {
    return false;
  }
  setEffects(target: string, fx: SoundEffects): void {
    this.effects.set(target, { ...fx });
  }
  disposeTarget(target: string): void {
    this.log.push(`dispose ${target}`);
  }
  getSoundDuration(): number {
    return 0;
  }
  getLoudness(): number {
    return -1;
  }
  getTargetOutput(): null {
    return null;
  }
  resume(): Promise<void> {
    return Promise.resolve();
  }
}

interface FakeTarget {
  id: string;
  volume: number;
  sprite: { sounds: { name: string; soundId: string }[] };
  state: Map<string, unknown>;
  getCustomState<T>(k: string): T | undefined;
  setCustomState<T>(k: string, v: T): void;
}

function makeTarget(id: string, sounds: string[], soundIds = sounds.map((_, i) => `${id}-snd${i}`)): FakeTarget {
  const state = new Map<string, unknown>();
  return {
    id,
    volume: 100,
    sprite: { sounds: sounds.map((name, i) => ({ name, soundId: soundIds[i] ?? "" })) },
    state,
    getCustomState: <T,>(k: string) => state.get(k) as T | undefined,
    setCustomState: <T,>(k: string, v: T) => void state.set(k, v),
  };
}

function setup(withAudio = true) {
  const emitter = new TypedEmitter<RuntimeEventMap>();
  const audio = new FakeAudio();
  const targets: FakeTarget[] = [makeTarget("stage", []), makeTarget("cat", ["meow", "2", "pop"])];
  const runtime = {
    targets,
    audioEngine: withAudio ? (audio as unknown as IAudioEngine) : null,
    on: emitter.on.bind(emitter),
    emit: emitter.emit.bind(emitter),
  } as unknown as IRuntime;
  const pkg = createSoundBlocks(runtime);
  const prims = pkg.getPrimitives();
  const cat = targets[1] as FakeTarget;
  const util = (t: FakeTarget = cat) => ({ target: t as unknown as ITarget }) as unknown as BlockUtility;
  const run = (op: string, args: Record<string, unknown>, t?: FakeTarget) => {
    const fn = prims[op] as PrimitiveFn;
    return fn(args, util(t));
  };
  return { emitter, audio, targets, cat, run, pkg, runtime };
}

const effectsOf = (t: FakeTarget) => (t.getCustomState<SoundBlocksState>(SOUND_STATE_KEY) as SoundBlocksState).effects;

describe("sound menu -> indeks (Scratch3SoundBlocks._getSoundIndex)", () => {
  const t = makeTarget("x", ["meow", "2", "pop"]) as unknown as ITarget;
  it.each([
    ["meow", 0],
    ["2", 1], // nama persis menang
    [2, 1], // angka 2 tidak === "2" -> nomor 2 -> indeks 1
    [1, 0],
    ["3", 2],
    [4, 0], // wrapClamp
    [0, 2],
    [-1, 1],
    ["1.9", 0],
    [" 2", 1], // parseInt mengabaikan spasi depan; nama " 2" tidak ada
    ["abc", -1],
    ["", -1],
    [true, -1],
  ])("%j -> %i", (input, expected) => {
    expect(getSoundIndex(input, t)).toBe(expected);
  });
  it("sprite tanpa sound -> -1", () => {
    expect(getSoundIndex(1, makeTarget("y", []) as unknown as ITarget)).toBe(-1);
  });
});

describe("primitive Sound", () => {
  it("daftar primitive & monitor sama dengan scratch-vm", () => {
    const { pkg } = setup();
    expect(Object.keys(pkg.getPrimitives()).sort()).toEqual(
      [
        "sound_beats_menu",
        "sound_changeeffectby",
        "sound_changevolumeby",
        "sound_cleareffects",
        "sound_effects_menu",
        "sound_play",
        "sound_playuntildone",
        "sound_seteffectto",
        "sound_setvolumeto",
        "sound_sounds_menu",
        "sound_stopallsounds",
        "sound_volume",
      ].sort(),
    );
    const mon = pkg.getMonitored?.().sound_volume;
    expect(mon?.isSpriteSpecific).toBe(true);
    expect(mon?.getId?.("abc", {})).toBe("abc_volume");
    expect(pkg.getHats?.()).toEqual({});
  });

  it("play tidak mengembalikan promise; playuntildone menunggu", async () => {
    const { run, audio } = setup();
    expect(run("sound_play", { SOUND_MENU: "meow" })).toBeUndefined();
    const p = run("sound_playuntildone", { SOUND_MENU: "pop" }) as Promise<void>;
    expect(p).toBeInstanceOf(Promise);
    expect(audio.log).toEqual(["play cat cat-snd0", "play cat cat-snd2"]);
    // Volume target selalu dikirim sebelum main (setEffectsFromTarget).
    expect(audio.effects.get("cat")).toEqual({ pitch: 0, pan: 0, volume: 100 });
    audio.pending[1]?.resolve();
    await expect(p).resolves.toBeUndefined();
    expect(run("sound_playuntildone", { SOUND_MENU: "nope" })).toBeUndefined();
  });

  it("STOP_FOR_TARGET hanya menghentikan sound yang ditunggu; play biasa menghapus status tunggu", () => {
    const { run, audio, emitter, cat } = setup();
    void run("sound_playuntildone", { SOUND_MENU: "meow" });
    void run("sound_playuntildone", { SOUND_MENU: "pop" });
    run("sound_play", { SOUND_MENU: "pop" }); // pop tidak lagi ditunggu
    audio.log.length = 0;
    emitter.emit("STOP_FOR_TARGET", { target: cat as unknown as ITarget });
    expect(audio.log).toEqual(["stop cat cat-snd0"]);
    audio.log.length = 0;
    emitter.emit("STOP_FOR_TARGET", { target: cat as unknown as ITarget });
    expect(audio.log).toEqual([]);
  });

  it("stop all sounds: per target hidup, membersihkan status tunggu", () => {
    const { run, audio, emitter, cat } = setup();
    void run("sound_playuntildone", { SOUND_MENU: "meow" });
    audio.log.length = 0;
    expect(run("sound_stopallsounds", {})).toBeUndefined();
    expect(audio.log).toEqual(["stopAll stage", "stopAll cat"]);
    audio.log.length = 0;
    emitter.emit("STOP_FOR_TARGET", { target: cat as unknown as ITarget });
    expect(audio.log).toEqual([]);
  });

  it("efek: cast, huruf kecil, clamp, yield via Promise", () => {
    const { run, cat, audio } = setup();
    expect(run("sound_seteffectto", { EFFECT: "PITCH", VALUE: "500" })).toBeInstanceOf(Promise);
    expect(effectsOf(cat).pitch).toBe(360);
    run("sound_changeeffectby", { EFFECT: "pitch", VALUE: -1000 });
    expect(effectsOf(cat).pitch).toBe(-360);
    run("sound_seteffectto", { EFFECT: "pan", VALUE: "abc" });
    expect(effectsOf(cat).pan).toBe(0);
    run("sound_changeeffectby", { EFFECT: "pan", VALUE: 30 });
    run("sound_changeeffectby", { EFFECT: "pan", VALUE: "30" });
    expect(effectsOf(cat).pan).toBe(60);
    expect(audio.effects.get("cat")).toEqual({ pitch: -360, pan: 60, volume: 100 });
    // Efek tak dikenal: tidak yield, tapi state tetap dibuat.
    expect(run("sound_seteffectto", { EFFECT: "volume", VALUE: 10 })).toBeUndefined();
    expect(run("sound_seteffectto", { EFFECT: "hasOwnProperty", VALUE: 10 })).toBeUndefined();
    expect(run("sound_cleareffects", {})).toBeUndefined();
    expect(effectsOf(cat)).toEqual({ pitch: 0, pan: 0 });
    expect(audio.effects.get("cat")).toEqual({ pitch: 0, pan: 0, volume: 100 });
  });

  it("volume: clamp 0..100, yield, reporter", () => {
    const { run, cat, audio } = setup();
    expect(run("sound_setvolumeto", { VOLUME: "-10" })).toBeInstanceOf(Promise);
    expect(cat.volume).toBe(0);
    run("sound_changevolumeby", { VOLUME: 35.5 });
    expect(cat.volume).toBe(35.5);
    run("sound_changevolumeby", { VOLUME: 1000 });
    expect(run("sound_volume", {})).toBe(100);
    run("sound_setvolumeto", { VOLUME: "x" });
    expect(cat.volume).toBe(0);
    expect(audio.effects.get("cat")?.volume).toBe(0);
  });

  it("menu primitive mengembalikan nilai field apa adanya", () => {
    const { run } = setup();
    expect(run("sound_sounds_menu", { SOUND_MENU: "meow" })).toBe("meow");
    expect(run("sound_beats_menu", { BEATS: "0.25" })).toBe("0.25");
    expect(run("sound_effects_menu", { EFFECT: "PAN" })).toBe("PAN");
  });

  it("green flag & stop membersihkan efek semua target; stop menghentikan sound", () => {
    const { run, cat, emitter, audio } = setup();
    run("sound_seteffectto", { EFFECT: "pitch", VALUE: 50 });
    emitter.emit("PROJECT_START", undefined);
    expect(effectsOf(cat).pitch).toBe(0);
    run("sound_seteffectto", { EFFECT: "pan", VALUE: 50 });
    audio.log.length = 0;
    emitter.emit("PROJECT_STOP_ALL", undefined);
    expect(effectsOf(cat).pan).toBe(0);
    // Per target (seperti Scratch) lalu global: suara clone yang sudah dihapus ikut berhenti.
    expect(audio.log).toEqual(["stopAll stage", "stopAll cat", "stopAll *"]);
  });

  it("clone menyalin state suara (salinan dalam) dan menyinkronkan efek", () => {
    const { run, cat, emitter, audio } = setup();
    run("sound_seteffectto", { EFFECT: "pitch", VALUE: 70 });
    const clone = makeTarget("clone1", ["meow"]);
    clone.volume = 40;
    emitter.emit("TARGET_WAS_CREATED", { target: clone as unknown as ITarget, source: cat as unknown as ITarget });
    expect(effectsOf(clone).pitch).toBe(70);
    effectsOf(clone).pitch = 1;
    expect(effectsOf(cat).pitch).toBe(70);
    expect(audio.effects.get("clone1")).toEqual({ pitch: 70, pan: 0, volume: 40 });
    // Sumber tanpa state: clone tidak diberi state.
    const c2 = makeTarget("clone2", []);
    emitter.emit("TARGET_WAS_CREATED", { target: c2 as unknown as ITarget, source: makeTarget("z", []) as unknown as ITarget });
    expect(c2.getCustomState(SOUND_STATE_KEY)).toBeUndefined();
    emitter.emit("TARGET_WAS_REMOVED", { target: clone as unknown as ITarget });
    expect(audio.log).toContain("dispose clone1");
  });

  it("tanpa audio engine: tidak crash, state tetap berubah", () => {
    const { run, cat } = setup(false);
    expect(run("sound_play", { SOUND_MENU: 1 })).toBeUndefined();
    expect(run("sound_playuntildone", { SOUND_MENU: 1 })).toBeUndefined();
    expect(run("sound_stopallsounds", {})).toBeUndefined();
    run("sound_seteffectto", { EFFECT: "pan", VALUE: 20 });
    expect(effectsOf(cat).pan).toBe(20);
    expect(run("sound_setvolumeto", { VOLUME: 10 })).toBeInstanceOf(Promise);
    expect(cat.volume).toBe(10);
  });

  it("sound tanpa soundId (gagal dekode) dilewati", () => {
    const { run, audio, targets } = setup();
    const t = makeTarget("broken", ["a"], [""]);
    targets.push(t);
    expect(run("sound_playuntildone", { SOUND_MENU: "a" }, t)).toBeUndefined();
    expect(audio.log).toEqual([]);
  });
});
