/**
 * Synthesizer kecil & deterministik untuk membuat suara pustaka orisinal (tanpa sampel rekaman).
 * Semua fungsi murni: input parameter -> Float32Array mono.
 */
import { rng } from "../art/svg-kit";

export const SYNTH_RATE = 22050;

export type Wave = "sine" | "square" | "saw" | "triangle";

export interface Env {
  attack?: number;
  decay?: number;
  sustain?: number;
  release?: number;
}

const TAU = Math.PI * 2;

export function osc(wave: Wave, phase: number): number {
  const p = phase - Math.floor(phase);
  switch (wave) {
    case "sine":
      return Math.sin(TAU * p);
    case "square":
      return p < 0.5 ? 1 : -1;
    case "saw":
      return 2 * p - 1;
    case "triangle":
      return p < 0.5 ? 4 * p - 1 : 3 - 4 * p;
  }
}

/** Amplop ADSR; durasi total = dur (release berada di ujung). */
export function envAt(t: number, dur: number, e: Env): number {
  const a = e.attack ?? 0.005;
  const d = e.decay ?? 0;
  const s = e.sustain ?? 1;
  const r = e.release ?? 0.05;
  if (t < 0 || t > dur) return 0;
  let v: number;
  if (t < a) v = t / a;
  else if (t < a + d) v = 1 - (1 - s) * ((t - a) / d);
  else v = s;
  const relStart = dur - r;
  if (t > relStart && r > 0) v *= Math.max(0, (dur - t) / r);
  return v;
}

/** Nada dengan frekuensi yang bisa berubah terhadap waktu. */
export function tone(freq: number | ((t: number) => number), dur: number, wave: Wave = "sine", env: Env = {}, gain = 0.6): Float32Array {
  const n = Math.max(1, Math.round(dur * SYNTH_RATE));
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SYNTH_RATE;
    const fr = typeof freq === "number" ? freq : freq(t);
    phase += fr / SYNTH_RATE;
    out[i] = osc(wave, phase) * envAt(t, dur, env) * gain;
  }
  return out;
}

/** Derau putih, opsional difilter low-pass satu kutub (cutoff Hz). */
export function noise(dur: number, seed: number, env: Env = {}, gain = 0.5, lowpassHz?: number, highpassHz?: number): Float32Array {
  const n = Math.max(1, Math.round(dur * SYNTH_RATE));
  const r = rng(seed);
  const out = new Float32Array(n);
  const lpA = lowpassHz ? 1 - Math.exp((-TAU * lowpassHz) / SYNTH_RATE) : 1;
  const hpA = highpassHz ? Math.exp((-TAU * highpassHz) / SYNTH_RATE) : 0;
  let lp = 0;
  let hpPrevIn = 0;
  let hpPrevOut = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SYNTH_RATE;
    let x = r() * 2 - 1;
    lp += lpA * (x - lp);
    x = lp;
    if (highpassHz) {
      const y = hpA * (hpPrevOut + x - hpPrevIn);
      hpPrevIn = x;
      hpPrevOut = y;
      x = y;
    }
    out[i] = x * envAt(t, dur, env) * gain;
  }
  return out;
}

/** Senar dipetik (Karplus-Strong). */
export function pluck(freq: number, dur: number, seed: number, gain = 0.6, damping = 0.996): Float32Array {
  const n = Math.max(1, Math.round(dur * SYNTH_RATE));
  const period = Math.max(2, Math.round(SYNTH_RATE / freq));
  const r = rng(seed);
  const buf = Float32Array.from({ length: period }, () => r() * 2 - 1);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const k = i % period;
    const next = (k + 1) % period;
    const v = buf[k] ?? 0;
    out[i] = v * gain * envAt(i / SYNTH_RATE, dur, { attack: 0.001, release: 0.05 });
    buf[k] = damping * 0.5 * (v + (buf[next] ?? 0));
  }
  return out;
}

/** Campur beberapa lapisan; offset dalam detik. */
export function mix(dur: number, ...layers: [Float32Array, number?][]): Float32Array {
  const out = new Float32Array(Math.max(1, Math.round(dur * SYNTH_RATE)));
  for (const [layer, offset = 0] of layers) {
    const o = Math.round(offset * SYNTH_RATE);
    for (let i = 0; i < layer.length && i + o < out.length; i++) out[i + o] = (out[i + o] ?? 0) + (layer[i] ?? 0);
  }
  return out;
}

/** Sambung beberapa potongan berurutan. */
export function concat(...parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Normalisasi puncak ke `peak` (default 0.8); suara hening dibiarkan. */
export function normalize(x: Float32Array, peak = 0.8): Float32Array {
  let m = 0;
  for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i] ?? 0));
  if (m === 0) return x;
  const k = peak / m;
  return x.map((v) => v * k);
}

/** Amplitudo dimodulasi (tremolo). */
export function tremolo(x: Float32Array, rate: number, depth: number): Float32Array {
  return x.map((v, i) => v * (1 - depth + depth * (0.5 + 0.5 * Math.sin((TAU * rate * i) / SYNTH_RATE))));
}

/** Frekuensi not MIDI. */
export const midi = (note: number): number => 440 * Math.pow(2, (note - 69) / 12);
