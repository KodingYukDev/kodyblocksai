import { describe, expect, it, vi } from "vitest";
import { validateExtensionInfo } from "@kody/engine/extension-manager";
import type { BlockUtility, IRuntime, ITarget } from "@kody/engine";
import { createMusicExtension, createMusicExtensionWithOptions } from "./music";
import type { MusicSoundOutput } from "./music-audio";
import { getMusicInfo, MUSIC_STATE_KEY } from "./music-info";
import oracle from "./__fixtures__/music-oracle.json";

type Enc = number | string | boolean | null | { $: string };
function dec(v: Enc): unknown {
  if (v && typeof v === "object") return { NaN: NaN, Infinity: Infinity, "-Infinity": -Infinity, "-0": -0 }[v.$];
  return v;
}

type Handler = (p: unknown) => void;

function makeTarget(volume = 100): ITarget {
  const state: Record<string, unknown> = {};
  return {
    volume,
    getCustomState: (k: string) => state[k],
    setCustomState: (k: string, v: unknown) => {
      state[k] = v;
    },
  } as unknown as ITarget;
}

function makeRuntime() {
  const handlers = new Map<string, Set<Handler>>();
  const stage = { tempo: 60 } as { tempo: number };
  let editing: ITarget | null = null;
  const runtime = {
    audioEngine: null,
    stage,
    getTargetForStage: () => stage,
    getEditingTarget: () => editing,
    setEditing: (t: ITarget | null) => {
      editing = t;
    },
    on: (ev: string, fn: Handler) => {
      if (!handlers.has(ev)) handlers.set(ev, new Set());
      handlers.get(ev)?.add(fn);
      return () => handlers.get(ev)?.delete(fn);
    },
    emit: (ev: string, payload: unknown) => {
      for (const fn of handlers.get(ev) ?? []) fn(payload);
    },
    handlers,
  };
  return runtime as unknown as IRuntime & {
    stage: { tempo: number };
    setEditing(t: ITarget | null): void;
    emit(ev: string, p: unknown): void;
    handlers: Map<string, Set<Handler>>;
  };
}

/** BlockUtility tiruan dengan jam manual (pola stack timer scratch-vm). */
function makeUtil(runtime: IRuntime, target: ITarget) {
  let now = 0;
  const frame: Record<string, unknown> = {};
  const util = {
    target,
    runtime,
    stackFrame: frame,
    yielded: 0,
    timerMs: null as number | null,
    stackTimerNeedsInit: () => !frame.timer,
    startStackTimer: (ms: number) => {
      frame.timer = { start: now };
      frame.duration = ms;
      util.timerMs = ms;
    },
    stackTimerFinished: () => now - (frame.timer as { start: number }).start >= (frame.duration as number),
    yield: () => {
      util.yielded++;
    },
    advance: (ms: number) => {
      now += ms;
    },
    reset: () => {
      for (const k of Object.keys(frame)) delete frame[k];
      util.yielded = 0;
      util.timerMs = null;
    },
  };
  return util;
}

function fakeOutput() {
  const drums: [number, number][] = [];
  const notes: [number, number, number, number][] = [];
  const out: MusicSoundOutput = {
    playDrum: (d, v) => void drums.push([d, v]),
    playNote: (i, n, s, v) => void notes.push([i, n, s, v]),
    concurrency: 0,
    dispose: vi.fn(),
  };
  return { out, drums, notes };
}

describe("ext-music getInfo", () => {
  it("lolos validateExtensionInfo (id & en)", () => {
    expect(validateExtensionInfo(getMusicInfo("id"))).toEqual([]);
    expect(validateExtensionInfo(getMusicInfo("en"))).toEqual([]);
  });

  it("struktur (en) identik scratch3_music.getInfo()", () => {
    const ours = getMusicInfo("en");
    const ref = oracle.info as Record<string, unknown>;
    expect(ours.id).toBe(ref.id);
    expect(ours.name).toBe(ref.name);
    expect(ours.blockIconURI).toBe(ref.blockIconURI);
    expect(ours.menuIconURI).toBe(ref.menuIconURI);
    expect(ours.blocks).toEqual(ref.blocks);
    expect(ours.menus).toEqual(ref.menus);
  });

  it("versi Indonesia: opcode, argumen, dan value menu sama", () => {
    const en = getMusicInfo("en");
    const id = getMusicInfo("id");
    const strip = (info: typeof en) => info.blocks.map((b) => (b === "---" ? b : { ...b, text: "" }));
    expect(strip(id)).toEqual(strip(en));
    for (const menu of ["DRUM", "INSTRUMENT"]) {
      const v = (info: typeof en) => (info.menus?.[menu]?.items as { value: string }[]).map((i) => i.value);
      expect(v(id)).toEqual(v(en));
    }
    expect((id.menus?.DRUM?.items as unknown[]).length).toBe(18);
    expect((id.menus?.INSTRUMENT?.items as unknown[]).length).toBe(21);
  });
});

describe("ext-music = oracle scratch-vm", () => {
  it("setInstrument & midiSetInstrument", () => {
    const runtime = makeRuntime();
    const music = createMusicExtensionWithOptions(runtime, { output: fakeOutput().out });
    const p = music.getPrimitives();
    for (const row of oracle.setInstrument) {
      const t = makeTarget();
      p.setInstrument?.({ INSTRUMENT: dec(row.in as Enc) }, makeUtil(runtime, t) as unknown as BlockUtility);
      expect(music.getMusicState(t).currentInstrument, JSON.stringify(row.in)).toBe(dec(row.out as Enc));
    }
    for (const row of oracle.midiSetInstrument) {
      const t = makeTarget();
      p.midiSetInstrument?.({ INSTRUMENT: dec(row.in as Enc) }, makeUtil(runtime, t) as unknown as BlockUtility);
      expect(music.getMusicState(t).currentInstrument, JSON.stringify(row.in)).toBe(dec(row.out as Enc));
    }
  });

  it("setTempo / changeTempo / getTempo", () => {
    const runtime = makeRuntime();
    const music = createMusicExtension(runtime);
    const p = music.getPrimitives();
    const util = makeUtil(runtime, makeTarget()) as unknown as BlockUtility;
    for (const row of oracle.setTempo) {
      runtime.stage.tempo = 60;
      p.setTempo?.({ TEMPO: dec(row.in as Enc) }, util);
      expect(runtime.stage.tempo, JSON.stringify(row.in)).toBe(dec(row.out as Enc));
    }
    for (const row of oracle.changeTempo) {
      runtime.stage.tempo = 100;
      p.changeTempo?.({ TEMPO: dec(row.in as Enc) }, util);
      expect(runtime.stage.tempo).toBe(dec(row.out as Enc));
      expect(p.getTempo?.({}, util)).toBe(dec(row.getTempo as Enc));
    }
  });

  type Rec = { drum?: number; note?: number; noteDur?: number; timer?: number };

  const runCase = (
    opcode: string,
    args: Record<string, unknown>,
    tempo: number,
  ): { rec: Rec; yielded: number } => {
    const runtime = makeRuntime();
    runtime.stage.tempo = tempo;
    const { out, drums, notes } = fakeOutput();
    const music = createMusicExtensionWithOptions(runtime, { output: out });
    const util = makeUtil(runtime, makeTarget());
    music.getPrimitives()[opcode]?.(args, util as unknown as BlockUtility);
    const rec: Rec = {};
    if (drums[0]) rec.drum = drums[0][0];
    if (notes[0]) {
      rec.note = notes[0][1];
      rec.noteDur = notes[0][2];
    }
    if (util.timerMs !== null) rec.timer = util.timerMs / 1000;
    return { rec, yielded: util.yielded };
  };

  const decRec = (r: Record<string, Enc>): Rec => {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) o[k] = dec(v);
    return o as Rec;
  };

  it("playDrumForBeats: nomor drum (round, wrapClamp) & durasi", () => {
    for (const row of oracle.playDrum) {
      const { rec, yielded } = runCase("playDrumForBeats", { DRUM: dec(row.drum as Enc), BEATS: dec(row.beats as Enc) }, row.tempo);
      const exp = decRec(row.rec as Record<string, Enc>);
      expect(rec.drum, JSON.stringify(row)).toBe(exp.drum);
      expect(rec.timer).toBeCloseTo(exp.timer as number, 12);
      expect(yielded).toBe(1);
    }
  });

  it("midiPlayDrumForBeats", () => {
    for (const row of oracle.midiPlayDrum) {
      const { rec } = runCase("midiPlayDrumForBeats", { DRUM: dec(row.drum as Enc), BEATS: 0.5 }, row.tempo);
      const exp = decRec(row.rec as Record<string, Enc>);
      expect(rec.drum, JSON.stringify(row)).toBe(exp.drum);
      expect(rec.timer).toBeCloseTo(exp.timer as number, 12);
    }
  });

  it("restForBeats", () => {
    for (const row of oracle.rest) {
      const { rec, yielded } = runCase("restForBeats", { BEATS: dec(row.beats as Enc) }, row.tempo);
      const exp = decRec(row.rec as Record<string, Enc>);
      expect(rec.timer, JSON.stringify(row)).toBeCloseTo(exp.timer as number, 12);
      expect(yielded).toBe(1);
    }
  });

  it("playNoteForBeats: clamp nada 0..130, beat 0 = diam tanpa yield", () => {
    for (const row of oracle.playNote) {
      const { rec, yielded } = runCase("playNoteForBeats", { NOTE: dec(row.note as Enc), BEATS: dec(row.beats as Enc) }, row.tempo);
      const exp = decRec(row.rec as Record<string, Enc>);
      const label = JSON.stringify(row);
      expect(rec.note, label).toBe(exp.note);
      if (exp.noteDur === undefined) {
        expect(rec.noteDur, label).toBeUndefined();
        expect(rec.timer, label).toBeUndefined();
        expect(yielded, label).toBe(0);
      } else {
        expect(rec.noteDur, label).toBeCloseTo(exp.noteDur, 12);
        expect(rec.timer, label).toBeCloseTo(exp.timer as number, 12);
        expect(yielded, label).toBe(1);
      }
    }
  });
});

describe("ext-music timer & state", () => {
  it("blok menunggu selama 60/tempo*beat lalu lanjut tanpa membunyikan ulang", () => {
    const runtime = makeRuntime();
    runtime.stage.tempo = 120;
    const { out, drums } = fakeOutput();
    const p = createMusicExtensionWithOptions(runtime, { output: out }).getPrimitives();
    const util = makeUtil(runtime, makeTarget(50));
    const u = util as unknown as BlockUtility;
    p.playDrumForBeats?.({ DRUM: "2", BEATS: 1 }, u);
    expect(drums).toEqual([[1, 0.5]]);
    expect(util.timerMs).toBe(500);
    util.advance(499);
    p.playDrumForBeats?.({ DRUM: "2", BEATS: 1 }, u);
    expect(util.yielded).toBe(2);
    util.advance(1);
    p.playDrumForBeats?.({ DRUM: "2", BEATS: 1 }, u);
    expect(util.yielded).toBe(2);
    expect(drums).toHaveLength(1);
  });

  it("nada memakai instrumen target dan volume target", () => {
    const runtime = makeRuntime();
    const { out, notes } = fakeOutput();
    const p = createMusicExtensionWithOptions(runtime, { output: out }).getPrimitives();
    const t = makeTarget(30);
    const util = makeUtil(runtime, t);
    p.setInstrument?.({ INSTRUMENT: 8 }, util as unknown as BlockUtility);
    p.playNoteForBeats?.({ NOTE: 64, BEATS: 0.5 }, util as unknown as BlockUtility);
    expect(notes).toEqual([[7, 64, 0.5, 0.3]]);
  });

  it("tanpa audio engine & tanpa output: diam, tetapi timer tetap jalan", () => {
    const runtime = makeRuntime();
    const p = createMusicExtension(runtime).getPrimitives();
    const util = makeUtil(runtime, makeTarget());
    p.playNoteForBeats?.({ NOTE: 60, BEATS: 1 }, util as unknown as BlockUtility);
    expect(util.timerMs).toBe(1000);
  });

  it("tanpa stage: getTempo = 60 dan setTempo tidak error", () => {
    const runtime = makeRuntime();
    (runtime as unknown as { getTargetForStage: () => undefined }).getTargetForStage = () => undefined;
    const music = createMusicExtension(runtime);
    music.getPrimitives().setTempo?.({ TEMPO: 200 }, {} as BlockUtility);
    expect(music.getTempo()).toBe(60);
  });

  it("clone menyalin instrumen (deep), sumber tanpa state diabaikan", () => {
    const runtime = makeRuntime();
    const music = createMusicExtension(runtime);
    const src = makeTarget();
    const util = makeUtil(runtime, src) as unknown as BlockUtility;
    music.getPrimitives().setInstrument?.({ INSTRUMENT: 5 }, util);
    const clone = makeTarget();
    runtime.emit("TARGET_WAS_CREATED", { target: clone, source: src });
    expect(clone.getCustomState(MUSIC_STATE_KEY)).toEqual({ currentInstrument: 4 });
    expect(clone.getCustomState(MUSIC_STATE_KEY)).not.toBe(src.getCustomState(MUSIC_STATE_KEY));
    const clone2 = makeTarget();
    runtime.emit("TARGET_WAS_CREATED", { target: clone2, source: makeTarget() });
    expect(clone2.getCustomState(MUSIC_STATE_KEY)).toBeUndefined();
  });

  it("playNoteForPicker memainkan 0.25 detik di target yang diedit, cek kategori", () => {
    const runtime = makeRuntime();
    const { out, notes } = fakeOutput();
    const music = createMusicExtensionWithOptions(runtime, { output: out, locale: "en" });
    music.playNoteForPicker(60);
    expect(notes).toHaveLength(0);
    runtime.setEditing(makeTarget());
    music.playNoteForPicker(62, "Pen");
    music.playNoteForPicker(62, "Music");
    expect(notes).toEqual([[0, 62, 0.25, 1]]);
  });

  it("dispose melepas listener runtime dan output", () => {
    const runtime = makeRuntime();
    const { out } = fakeOutput();
    const music = createMusicExtensionWithOptions(runtime, { output: out });
    music.dispose?.();
    expect(runtime.handlers.get("TARGET_WAS_CREATED")?.size ?? 0).toBe(0);
    expect(out.dispose).toHaveBeenCalled();
  });
});
