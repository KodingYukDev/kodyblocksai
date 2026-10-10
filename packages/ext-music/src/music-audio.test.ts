import { describe, expect, it } from "vitest";
import { DECAY_DURATION, ratioForPitchInterval, selectSampleIndexForNote, WebAudioMusicOutput } from "./music-audio";
import type { MusicAudioContext } from "./music-audio";
import { CONCURRENCY_LIMIT, DRUM_INFO, INSTRUMENT_INFO } from "./music-info";
import { MusicSampleBank, musicSampleUrlsFromBase } from "./music-samples";
import type { SampleContext } from "./music-samples";
import oracle from "./__fixtures__/music-oracle.json";

class FakeParam {
  value = 1;
  events: [string, number, number][] = [];
  setValueAtTime(v: number, t: number) {
    this.events.push(["set", v, t]);
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.events.push(["ramp", v, t]);
  }
}

class FakeNode {
  connections: FakeNode[] = [];
  connect(n: FakeNode) {
    this.connections.push(n);
    return n;
  }
  disconnect() {
    this.connections = [];
  }
}

class FakeGain extends FakeNode {
  gain = new FakeParam();
}

class FakeSource extends FakeNode {
  buffer: unknown = null;
  playbackRate = new FakeParam();
  onended: (() => void) | null = null;
  started = 0;
  stops: (number | undefined)[] = [];
  start() {
    this.started++;
  }
  stop(t?: number) {
    this.stops.push(t);
  }
  end() {
    this.onended?.();
  }
}

class FakeBuffer {
  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.data = new Float32Array(length);
  }
  data: Float32Array;
  getChannelData() {
    return this.data;
  }
}

function makeCtx() {
  const sources: FakeSource[] = [];
  const gains: FakeGain[] = [];
  const ctx = {
    currentTime: 10,
    sampleRate: 8000,
    createGain: () => {
      const g = new FakeGain();
      gains.push(g);
      return g;
    },
    createBufferSource: () => {
      const s = new FakeSource();
      sources.push(s);
      return s;
    },
    createBuffer: (c: number, l: number, r: number) => new FakeBuffer(c, l, r),
    decodeAudioData: async (d: ArrayBuffer) => ({ decoded: d.byteLength }) as unknown as AudioBuffer,
  };
  return { ctx, sources, gains };
}

const fakeSamples = {
  getDrum: (i: number) => ({ drum: i }) as unknown as AudioBuffer,
  getInstrumentSample: (i: number, s: number) => ({ inst: i, sample: s }) as unknown as AudioBuffer,
};

function makeOutput() {
  const { ctx, sources, gains } = makeCtx();
  const dest = new FakeNode();
  const out = new WebAudioMusicOutput(ctx as unknown as MusicAudioContext, dest as unknown as AudioNode, fakeSamples);
  return { out, ctx, sources, gains, dest };
}

describe("pemilihan sampel & pitch", () => {
  it("selectSampleIndexForNote = oracle", () => {
    for (const row of oracle.selectSample) {
      expect(selectSampleIndexForNote(row.note, row.samples), JSON.stringify(row)).toBe(row.out);
    }
  });
  it("ratioForPitchInterval", () => {
    expect(ratioForPitchInterval(0)).toBe(1);
    expect(ratioForPitchInterval(12)).toBe(2);
    expect(ratioForPitchInterval(-12)).toBe(0.5);
  });
});

describe("WebAudioMusicOutput", () => {
  it("drum: gain volume ke master, sumber dimulai", () => {
    const { out, sources, gains, dest } = makeOutput();
    out.playDrum(3, 0.4);
    expect(sources).toHaveLength(1);
    expect(sources[0]?.buffer).toEqual({ drum: 3 });
    expect(sources[0]?.started).toBe(1);
    expect(gains[0]?.gain.events).toEqual([["set", 0.4, 10]]);
    expect(gains[0]?.connections).toEqual([dest]);
    expect(out.concurrency).toBe(1);
    sources[0]?.end();
    expect(out.concurrency).toBe(0);
  });

  it("nada: sampel terdekat, playbackRate, release & stop sesuai releaseTime", () => {
    const { out, sources, gains } = makeOutput();
    out.playNote(0, 62, 0.5, 1); // piano, sampel 60, release 0.5
    const src = sources[0];
    expect(src?.buffer).toEqual({ inst: 0, sample: 3 });
    expect(src?.playbackRate.value).toBeCloseTo(Math.pow(2, 2 / 12), 12);
    expect(src?.stops).toEqual([11]);
    expect(gains[1]?.gain.events).toEqual([
      ["set", 1, 10.5],
      ["ramp", 0.0001, 11],
    ]);
    out.playNote(8, 60, 1, 1); // trombone tanpa releaseTime -> 0.01
    expect(sources[1]?.stops[0]).toBeCloseTo(11.01, 12);
  });

  it("drum sama dalam masa start (25 ms): tidak ada suara baru, sumber dialihkan", () => {
    const { out, ctx, sources, gains } = makeOutput();
    out.playDrum(0, 1);
    ctx.currentTime += DECAY_DURATION / 2;
    out.playDrum(0, 0.5);
    expect(sources).toHaveLength(1);
    expect(sources[0]?.connections).toEqual([gains[1]]);
    // Scratch: listener once('stop') lama + baru terpanggil -> penghitung turun.
    expect(out.concurrency).toBe(0);
    sources[0]?.end();
    expect(out.concurrency).toBe(0);
  });

  it("drum sama setelah masa start: suara lama tetap jalan (take), suara baru dimulai", () => {
    const { out, ctx, sources } = makeOutput();
    out.playDrum(0, 1);
    ctx.currentTime += 0.1;
    out.playDrum(0, 1);
    expect(sources).toHaveLength(2);
    expect(sources[0]?.stops).toEqual([]);
    expect(out.concurrency).toBe(1);
    sources[0]?.end(); // suara lama yang diambil alih tidak memengaruhi penghitung
    expect(out.concurrency).toBe(1);
    sources[1]?.end();
    expect(out.concurrency).toBe(0);
  });

  it("drum berbeda tidak saling memengaruhi", () => {
    const { out, sources } = makeOutput();
    out.playDrum(0, 1);
    out.playDrum(1, 1);
    expect(sources).toHaveLength(2);
    expect(out.concurrency).toBe(2);
  });

  it("batas konkurensi: suara ke-32 ditolak (penghitung > 30)", () => {
    const { out, sources, ctx } = makeOutput();
    let n = 0;
    for (let inst = 0; inst < INSTRUMENT_INFO.length && n < 40; inst++) {
      for (let note = 40; note < 42 && n < 40; note++) {
        out.playNote(inst, note, 1, 1);
        n++;
      }
    }
    expect(sources).toHaveLength(CONCURRENCY_LIMIT + 1);
    expect(out.concurrency).toBe(CONCURRENCY_LIMIT + 1);
    sources[0]?.end();
    ctx.currentTime += 1;
    out.playDrum(5, 1);
    expect(sources).toHaveLength(CONCURRENCY_LIMIT + 2);
  });

  it("dispose menghentikan semua sumber", () => {
    const { out, sources } = makeOutput();
    out.playDrum(0, 1);
    out.playNote(0, 60, 1, 1);
    out.dispose();
    expect(sources.every((s) => s.stops.length >= 1)).toBe(true);
    expect(out.concurrency).toBe(0);
  });
});

describe("MusicSampleBank", () => {
  it("tanpa fetch: semua drum & sampel instrumen tersedia lewat sintesis (terbatas, tidak senyap)", async () => {
    const { ctx } = makeCtx();
    const bank = new MusicSampleBank(ctx as unknown as SampleContext, { fetch: async () => ({ ok: false, arrayBuffer: async () => new ArrayBuffer(0) }) });
    await bank.loadAll();
    for (let d = 0; d < DRUM_INFO.length; d++) {
      const data = (bank.getDrum(d) as unknown as FakeBuffer).data;
      let peak = 0;
      for (const v of data) {
        expect(Number.isFinite(v)).toBe(true);
        peak = Math.max(peak, Math.abs(v));
      }
      expect(peak, `drum ${d}`).toBeGreaterThan(0.01);
      expect(peak).toBeLessThanOrEqual(1);
      expect(bank.isSampleLoaded("drum", d)).toBe(false);
    }
    INSTRUMENT_INFO.forEach((info, i) => {
      info.samples.forEach((_, s) => {
        const data = (bank.getInstrumentSample(i, s) as unknown as FakeBuffer).data;
        let peak = 0;
        for (const v of data) peak = Math.max(peak, Math.abs(v));
        expect(peak, `inst ${i}/${s}`).toBeGreaterThan(0.01);
        expect(peak).toBeLessThanOrEqual(1);
      });
    });
    // cache: objek yang sama
    expect(bank.getDrum(0)).toBe(bank.getDrum(0));
  });

  it("memuat mp3 dari URL milik sendiri dan memakainya menggantikan sintesis", async () => {
    const { ctx } = makeCtx();
    const urls: string[] = [];
    const bank = new MusicSampleBank(ctx as unknown as SampleContext, {
      urls: musicSampleUrlsFromBase("/music"),
      fetch: async (url) => {
        urls.push(url);
        return { ok: true, arrayBuffer: async () => new ArrayBuffer(urls.length) };
      },
    });
    await bank.loadAll();
    await bank.loadAll(); // hanya sekali
    const total = DRUM_INFO.length + INSTRUMENT_INFO.reduce((n, i) => n + i.samples.length, 0);
    expect(urls).toHaveLength(total);
    expect(total).toBe(61);
    expect(urls).toContain("/music/drums/1-snare.mp3");
    expect(urls).toContain("/music/instruments/1-piano/108.mp3");
    expect(urls.every((u) => u.startsWith("/music/"))).toBe(true);
    expect(bank.isSampleLoaded("drum", 0)).toBe(true);
    expect(bank.isSampleLoaded("instrument", 0, 7)).toBe(true);
    expect(bank.getDrum(0)).toHaveProperty("decoded");
  });

  it("gagal decode per sampel tidak menggagalkan yang lain", async () => {
    const { ctx } = makeCtx();
    let i = 0;
    const bank = new MusicSampleBank(ctx as unknown as SampleContext, {
      fetch: async () => {
        i++;
        if (i % 2 === 0) throw new Error("jaringan");
        return { ok: true, arrayBuffer: async () => new ArrayBuffer(4) };
      },
    });
    await expect(bank.loadAll()).resolves.toBeUndefined();
    expect(bank.isSampleLoaded("drum", 0)).toBe(true);
    expect(bank.isSampleLoaded("drum", 1)).toBe(false);
    expect(bank.getDrum(1)).toBeInstanceOf(FakeBuffer);
  });
});
