import { describe, expect, it, vi } from "vitest";
import { createAudioEngine } from "./audio-engine";
import { panToGains, pitchToPlaybackRate } from "./effects";
import { computeLoudness } from "./loudness";
import {
  buildAdpcmWav,
  MockAudioContext,
  MockGain,
  MockNode,
  type MockSource,
  pcmBytes,
} from "./test-utils/mock-audio-context";

let idCounter = 0;
function setup() {
  const ctx = new MockAudioContext();
  const engine = createAudioEngine({
    context: ctx.asAudioContext(),
    resumeOnGesture: false,
    getUserMedia: null,
    createId: () => `s${++idCounter}`,
  });
  const master = engine.getMasterInput() as unknown as MockGain;
  return { ctx, engine, master };
}

const lastSource = (ctx: MockAudioContext): MockSource => {
  const s = ctx.sources().at(-1);
  if (!s) throw new Error("tidak ada source");
  return s;
};

/** Ikuti sambungan dari node sampai destination; kembalikan jenis node yang dilewati. */
function pathFrom(node: MockNode, ctx: MockAudioContext): string[] {
  const out: string[] = [];
  let cur: MockNode | undefined = node;
  let guard = 0;
  while (cur && cur !== ctx.destination && guard++ < 20) {
    out.push(cur.kind);
    cur = [...cur.connections][0];
  }
  if (cur === ctx.destination) out.push("destination");
  return out;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("rumus efek (scratch-audio)", () => {
  it("pitch -> playbackRate 2^(pitch/10/12)", () => {
    expect(pitchToPlaybackRate(0)).toBe(1);
    expect(pitchToPlaybackRate(120)).toBe(2);
    expect(pitchToPlaybackRate(-120)).toBe(0.5);
    expect(pitchToPlaybackRate(10)).toBeCloseTo(Math.pow(2, 1 / 12), 12);
  });
  it("pan equal-power", () => {
    expect(panToGains(-100)).toEqual({ left: 1, right: 0 });
    const c = panToGains(0);
    expect(c.left).toBeCloseTo(Math.SQRT1_2, 12);
    expect(c.right).toBeCloseTo(Math.SQRT1_2, 12);
    expect(panToGains(100).right).toBe(1);
  });
  it("loudness: RMS, halus 0.6, *1.63, akar, *100, bulat, maks 100", () => {
    const a = computeLoudness(new Float32Array([0.1, -0.1, 0.1, -0.1]), undefined);
    expect(a.loudness).toBe(Math.round(Math.sqrt(0.1 * 1.63) * 100));
    // Turun mendadak ke 0 -> ditahan 0.6 x nilai sebelumnya.
    const b = computeLoudness(new Float32Array(4), a.rms);
    expect(b.rms).toBeCloseTo(a.rms * 0.6, 7);
    expect(computeLoudness(new Float32Array([1, 1]), undefined).loudness).toBe(100);
  });
});

describe("AudioEngine", () => {
  it("decodeSound mengembalikan rate & sampleCount dari buffer (load-sound.js)", async () => {
    const { engine } = setup();
    const pcm = await engine.decodeSound(pcmBytes(), "wav");
    expect(pcm).toMatchObject({ rate: 44100, sampleCount: 1000 });
    expect(pcm.soundId).not.toBe("");
    const adpcm = await engine.decodeSound(buildAdpcmWav(868, 7), "wav");
    expect(adpcm).toMatchObject({ rate: 22050, sampleCount: 1706 });
    expect(engine.getSoundDuration(adpcm.soundId)).toBeCloseTo(1706 / 22050, 9);
    const empty = await engine.decodeSound(new ArrayBuffer(0), "wav");
    expect(empty.sampleCount).toBe(1);
  });

  it("tanpa WebAudio: no-op aman", async () => {
    const engine = createAudioEngine({ createContext: () => null, resumeOnGesture: false });
    expect(engine.context).toBeNull();
    expect(await engine.decodeSound(pcmBytes(), "wav")).toEqual({ soundId: "", rate: 0, sampleCount: 0 });
    await expect(engine.playSound("t", "x")).resolves.toBeUndefined();
    expect(engine.getLoudness()).toBe(-1);
    expect(engine.getTargetOutput("t")).toBeNull();
  });

  it("play: promise selesai saat ended; graf bypass pada efek default", async () => {
    const { ctx, engine } = setup();
    const { soundId } = await engine.decodeSound(pcmBytes(), "wav");
    engine.setEffects("A", { pitch: 0, pan: 0, volume: 100 });
    let done = false;
    void engine.playSound("A", soundId).then(() => (done = true));
    const src = lastSource(ctx);
    expect(src.started).toBe(true);
    expect(engine.isSoundPlaying("A", soundId)).toBe(true);
    // source -> chain input -> master -> destination (pan 0 & volume 100 tidak disisipkan).
    expect(pathFrom(src, ctx)).toEqual(["source", "gain", "gain", "destination"]);
    src.fireEnded();
    await flush();
    expect(done).toBe(true);
    expect(engine.isSoundPlaying("A", soundId)).toBe(false);
  });

  it("efek pan/volume disisipkan, pitch mengubah playbackRate", async () => {
    const { ctx, engine } = setup();
    const { soundId } = await engine.decodeSound(pcmBytes(), "wav");
    engine.setEffects("A", { pitch: 120, pan: 50, volume: 40 });
    void engine.playSound("A", soundId);
    const src = lastSource(ctx);
    expect(src.playbackRate.value).toBe(2);
    // source -> chain in -> volume gain -> pan in -> (left gain) -> merger -> master -> dest
    expect(pathFrom(src, ctx)).toEqual(["source", "gain", "gain", "gain", "gain", "merger", "gain", "destination"]);
    const volGain = [...([...src.connections][0] as MockNode).connections][0] as MockGain;
    expect(volGain.gain.last()).toEqual({ method: "linearRampToValueAtTime", args: [0.4, 0.025] });
    // Efek berubah saat sound berjalan -> diterapkan ke rantai milik target.
    engine.setEffects("A", { pitch: -120, pan: 0, volume: 100 });
    expect(src.playbackRate.value).toBe(0.5);
    expect(pathFrom(src, ctx)).toEqual(["source", "gain", "gain", "destination"]);
    // Target lain tidak memengaruhi sound milik A.
    engine.setEffects("B", { pitch: 360, pan: 0, volume: 100 });
    expect(src.playbackRate.value).toBe(0.5);
  });

  it("main ulang sound yang sama: yang lama memudar 25 ms, promise lama resolve", async () => {
    const { ctx, engine } = setup();
    const { soundId } = await engine.decodeSound(pcmBytes(), "wav");
    const first = engine.playSound("A", soundId);
    const src1 = lastSource(ctx);
    ctx.currentTime = 1; // lewat jendela isStarting
    const second = engine.playSound("A", soundId);
    const src2 = lastSource(ctx);
    expect(src2).not.toBe(src1);
    await expect(first).resolves.toBeUndefined();
    expect(src1.stoppedAt).toBeCloseTo(1.025, 9);
    const fade = [...src1.connections][0] as MockGain;
    expect(fade.gain.last()).toEqual({ method: "linearRampToValueAtTime", args: [0, 1.025] });
    src1.fireEnded(); // fade selesai -> player lama dibuang, tidak memengaruhi yang baru
    let secondDone = false;
    void second.then(() => (secondDone = true));
    await flush();
    expect(secondDone).toBe(false);
    src2.fireEnded();
    await flush();
    expect(secondDone).toBe(true);
  });

  it("main ulang dalam jendela isStarting (<25 ms): tidak membuat source baru", async () => {
    const { ctx, engine } = setup();
    const { soundId } = await engine.decodeSound(pcmBytes(), "wav");
    const first = engine.playSound("A", soundId);
    const count = ctx.sources().length;
    ctx.currentTime = 0.01;
    void engine.playSound("A", soundId);
    expect(ctx.sources().length).toBe(count);
    await expect(first).resolves.toBeUndefined();
  });

  it("sound yang sama dimainkan target lain: pemutaran lama dihentikan (satu player per sound)", async () => {
    const { ctx, engine } = setup();
    const { soundId } = await engine.decodeSound(pcmBytes(), "wav");
    const a = engine.playSound("A", soundId);
    const srcA = lastSource(ctx);
    void engine.playSound("B", soundId);
    await expect(a).resolves.toBeUndefined();
    expect(srcA.stoppedAt).not.toBeNull();
    expect(engine.isSoundPlaying("B", soundId)).toBe(true);
    expect(engine.isSoundPlaying("A", soundId)).toBe(false);
  });

  it("stopAllSounds per target dan global, stopSound hanya milik target", async () => {
    const { ctx, engine } = setup();
    const s1 = (await engine.decodeSound(pcmBytes(), "wav")).soundId;
    const s2 = (await engine.decodeSound(pcmBytes(), "wav")).soundId;
    void engine.playSound("A", s1);
    const srcA = lastSource(ctx);
    void engine.playSound("B", s2);
    const srcB = lastSource(ctx);
    engine.stopSound("B", s1); // bukan milik B
    expect(srcA.stoppedAt).toBeNull();
    engine.stopAllSounds("A");
    expect(srcA.stoppedAt).not.toBeNull();
    expect(srcB.stoppedAt).toBeNull();
    engine.stopAllSounds();
    expect(srcB.stoppedAt).not.toBeNull();
  });

  it("getTargetOutput: gain volume target ke master (seperti Music)", () => {
    const { engine, master } = setup();
    engine.setEffects("A", { pitch: 0, pan: 0, volume: 30 });
    const out = engine.getTargetOutput("A") as unknown as MockGain;
    expect(out.gain.last()).toEqual({ method: "setValueAtTime", args: [0.3, 0] });
    expect(out.connections.has(master)).toBe(true);
  });

  it("unloadSound & sound tak dikenal tidak melempar", async () => {
    const { engine } = setup();
    const { soundId } = await engine.decodeSound(pcmBytes(), "wav");
    engine.unloadSound(soundId);
    await expect(engine.playSound("A", soundId)).resolves.toBeUndefined();
    expect(engine.getAudioBuffer(soundId)).toBeNull();
  });

  it("resume() membangunkan context yang suspended", async () => {
    const { ctx, engine } = setup();
    expect(ctx.state).toBe("suspended");
    await engine.resume();
    expect(ctx.state).toBe("running");
  });
});

describe("loudness mikrofon", () => {
  function micSetup(result: "ok" | "deny") {
    const ctx = new MockAudioContext();
    const track = { stop: vi.fn() };
    const stream = { active: true, getTracks: () => [track] } as unknown as MediaStream;
    const getUserMedia = vi.fn(() => (result === "ok" ? Promise.resolve(stream) : Promise.reject(new Error("denied"))));
    const onMic = vi.fn();
    const engine = createAudioEngine({
      context: ctx.asAudioContext(),
      resumeOnGesture: false,
      getUserMedia,
      onMicrophoneActiveChange: onMic,
    });
    return { ctx, engine, getUserMedia, onMic, track };
  }

  it("izin diminta hanya saat loudness dibaca, sekali saja", async () => {
    const { ctx, engine, getUserMedia, onMic, track } = micSetup("ok");
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(engine.getLoudness()).toBe(-1);
    expect(engine.getLoudness()).toBe(-1);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    await flush();
    expect(onMic).toHaveBeenCalledWith(true);
    const analyser = ctx.nodes.find((n) => n.kind === "analyser") as unknown as { fill: number };
    analyser.fill = 0.25;
    expect(engine.getLoudness()).toBe(Math.round(Math.sqrt(0.25 * 1.63) * 100));
    engine.releaseMicrophone();
    expect(track.stop).toHaveBeenCalled();
    expect(onMic).toHaveBeenLastCalledWith(false);
    expect(engine.getLoudness()).toBe(-1);
    expect(getUserMedia).toHaveBeenCalledTimes(2);
  });

  it("izin ditolak: tetap -1 dan tidak meminta berulang", async () => {
    const { engine, getUserMedia } = micSetup("deny");
    expect(engine.getLoudness()).toBe(-1);
    await flush();
    expect(engine.getLoudness()).toBe(-1);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it("dispose mematikan mikrofon", async () => {
    const { engine, track } = micSetup("ok");
    engine.getLoudness();
    await flush();
    (engine as unknown as { dispose(): void }).dispose();
    expect(track.stop).toHaveBeenCalled();
  });
});

void MockNode;
