/**
 * Efek editor suara, versi DSP murni (tanpa OfflineAudioContext) supaya bisa dites & jalan di
 * semua browser. Parameter, tata letak sampel, dan penyesuaian seleksi diport dari scratch-gui
 * src/lib/audio/audio-effects.js + effects/*.js (BSD-3, lewat fork KodyBlocks). Node WebAudio
 * (delay, waveshaper, biquad, compressor) ditiru dengan rumus spesifikasi Web Audio.
 * Lihat THIRD_PARTY.md.
 */
import type { PcmSound } from "./wav";

export const EFFECT_TYPES = {
  ROBOT: "robot",
  REVERSE: "reverse",
  LOUDER: "higher",
  SOFTER: "lower",
  FASTER: "faster",
  SLOWER: "slower",
  ECHO: "echo",
  FADEIN: "fade in",
  FADEOUT: "fade out",
  MUTE: "mute",
} as const;

export type EffectName = (typeof EFFECT_TYPES)[keyof typeof EFFECT_TYPES];

export const ECHO_DELAY_TIME = 0.25;
export const ECHO_TAIL_SECONDS = 0.75;
/** Terts mayor, seperti scratch-gui. */
export const PITCH_RATIO = Math.pow(2, 4 / 12);

export interface EffectResult extends PcmSound {
  /** Seleksi baru (0..1) setelah efek, sama dengan adjustedTrimStart/End scratch-gui. */
  trimStart: number;
  trimEnd: number;
}

interface Layout {
  sampleCount: number;
  playbackRate: number;
  trimStartSeconds: number;
  trimEndSeconds: number;
  adjustedTrimEndSeconds: number;
  adjustedTrimStart: number;
  adjustedTrimEnd: number;
}

/** Hitung panjang keluaran & seleksi baru (konstruktor AudioEffects). */
export function effectLayout(length: number, sampleRate: number, name: EffectName, trimStart: number, trimEnd: number): Layout {
  const trimStartSeconds = (trimStart * length) / sampleRate;
  const trimEndSeconds = (trimEnd * length) / sampleRate;
  let sampleCount = length;
  const affected = Math.floor((trimEndSeconds - trimStartSeconds) * sampleRate);
  let adjustedAffected = affected;
  const unaffected = sampleCount - affected;
  let playbackRate = 1;
  if (name === EFFECT_TYPES.ECHO) {
    sampleCount = Math.max(sampleCount, Math.floor((trimEndSeconds + ECHO_TAIL_SECONDS) * sampleRate));
  } else if (name === EFFECT_TYPES.FASTER || name === EFFECT_TYPES.SLOWER) {
    playbackRate = name === EFFECT_TYPES.FASTER ? PITCH_RATIO : 1 / PITCH_RATIO;
    adjustedAffected = Math.floor(affected / playbackRate);
    sampleCount = unaffected + adjustedAffected;
  }
  const duration = sampleCount / sampleRate;
  const adjustedTrimEndSeconds = trimStartSeconds + adjustedAffected / sampleRate;
  return {
    sampleCount,
    playbackRate,
    trimStartSeconds,
    trimEndSeconds,
    adjustedTrimEndSeconds,
    adjustedTrimStart: trimStartSeconds / duration,
    adjustedTrimEnd: adjustedTrimEndSeconds / duration,
  };
}

/** Kurva automasi AudioParam sederhana: daftar event setValueAtTime / ramp. */
type ParamEvent = { t: number; v: number; ramp: "set" | "linear" | "exp" };

function paramValueAt(events: readonly ParamEvent[], initial: number, t: number): number {
  let value = initial;
  let prevT = 0;
  let prevV = initial;
  for (const e of events) {
    if (e.t <= t) {
      value = e.v;
      prevT = e.t;
      prevV = e.v;
      continue;
    }
    if (e.ramp === "set") return value;
    const span = e.t - prevT;
    if (span <= 0) return e.v;
    const k = (t - prevT) / span;
    if (e.ramp === "linear") return prevV + (e.v - prevV) * k;
    if (prevV > 0 && e.v > 0) return prevV * Math.pow(e.v / prevV, k);
    return prevV;
  }
  return value;
}

function gainCurve(events: ParamEvent[], initial: number, length: number, rate: number): Float32Array {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) out[i] = paramValueAt(events, initial, i / rate);
  return out;
}

/** Spesifikasi DynamicsCompressorNode (disederhanakan): knee lunak, attack 0, release, makeup gain. */
export function compress(input: Float32Array, rate: number, threshold = -5, knee = 15, ratio = 12, release = 0.25): Float32Array {
  const curveDb = (xDb: number): number => {
    const lo = threshold - knee / 2;
    const hi = threshold + knee / 2;
    if (xDb <= lo) return xDb;
    if (xDb >= hi) return threshold + (xDb - threshold) / ratio;
    const d = xDb - lo;
    return xDb + ((1 / ratio - 1) * d * d) / (2 * knee);
  };
  const makeup = Math.pow(1 / Math.pow(10, curveDb(0) / 20), 0.6);
  const out = new Float32Array(input.length);
  const releaseCoef = Math.exp(-1 / (release * rate));
  let envDb = 0; // reduksi gain saat ini (<= 0)
  for (let i = 0; i < input.length; i++) {
    const x = input[i] ?? 0;
    const level = Math.abs(x);
    const xDb = level > 1e-9 ? 20 * Math.log10(level) : -180;
    const target = curveDb(xDb) - xDb;
    envDb = target < envDb ? target : target + (envDb - target) * releaseCoef;
    out[i] = x * Math.pow(10, envDb / 20) * makeup;
  }
  return out;
}

/** Diode node robot-effect.js (WaveShaper 1024 titik, tanpa interpolasi oversample). */
export function diode(v: number, vb = 0.2, vl = 0.4, h = 0.65): number {
  if (v <= vb) return 0;
  if (v <= vl) return h * (Math.pow(v - vb, 2) / (2 * vl - 2 * vb));
  return h * v - h * vl + h * (Math.pow(v - vb, 2) / (2 * vl - 2 * vb));
}

const DIODE_CURVE = Float32Array.from({ length: 1024 }, (_, i) => diode(2 * (i / 1024) - 1));

/** WaveShaperNode: input [-1,1] dipetakan linear ke kurva. */
export function waveShape(x: number, curve: Float32Array = DIODE_CURVE): number {
  const n = curve.length;
  const v = ((n - 1) * (Math.max(-1, Math.min(1, x)) + 1)) / 2;
  const k = Math.floor(v);
  if (k >= n - 1) return curve[n - 1] ?? 0;
  const f = v - k;
  return (1 - f) * (curve[k] ?? 0) + f * (curve[k + 1] ?? 0);
}

/** Biquad highpass (rumus Audio EQ Cookbook, Q dalam dB seperti Web Audio). */
export function highpass(input: Float32Array, rate: number, freq: number, qDb = 1): Float32Array {
  const w0 = (2 * Math.PI * freq) / rate;
  const q = Math.pow(10, qDb / 20);
  const alpha = Math.sin(w0) / (2 * q);
  const cos = Math.cos(w0);
  const a0 = 1 + alpha;
  const b0 = (1 + cos) / 2 / a0;
  const b1 = -(1 + cos) / a0;
  const b2 = b0;
  const a1 = (-2 * cos) / a0;
  const a2 = (1 - alpha) / a0;
  const out = new Float32Array(input.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const x = input[i] ?? 0;
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    out[i] = y;
  }
  return out;
}

function applyGain(src: Float32Array, gains: Float32Array): Float32Array {
  const out = new Float32Array(gains.length);
  for (let i = 0; i < out.length; i++) out[i] = (src[i] ?? 0) * (gains[i] ?? 1);
  return out;
}

function resampleSegment(seg: Float32Array, rate: number, outLen: number): Float32Array {
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const p = i * rate;
    const k = Math.floor(p);
    const f = p - k;
    out[i] = (seg[k] ?? 0) * (1 - f) + (seg[k + 1] ?? seg[k] ?? 0) * f;
  }
  return out;
}

function reverseRange(src: Float32Array, start: number, end: number): Float32Array {
  const out = new Float32Array(src);
  let counter = 0;
  for (let i = 0; i < src.length; i++) {
    if (i >= start && i < end) {
      out[i] = src[end - counter - 1] ?? 0;
      counter++;
    }
  }
  return out;
}

/**
 * Terapkan efek pada seleksi [trimStart, trimEnd] (0..1). Seleksi null = seluruh suara,
 * seperti handleEffect scratch-gui. Mengembalikan null bila suara < 2 sampel (tidak diproses).
 */
export function applyEffect(sound: PcmSound, name: EffectName, trimStart: number | null = null, trimEnd: number | null = null): EffectResult | null {
  const { samples, sampleRate: rate } = sound;
  if (samples.length < 2) return null;
  const ts = trimStart ?? 0;
  const te = trimEnd ?? 1;
  const L = effectLayout(samples.length, rate, name, ts, te);
  const n = L.sampleCount;
  const startT = L.trimStartSeconds;
  const endT = L.adjustedTrimEndSeconds;
  const padded = new Float32Array(n);
  padded.set(samples.subarray(0, Math.min(n, samples.length)));
  let out: Float32Array;

  switch (name) {
    case EFFECT_TYPES.REVERSE:
      out = reverseRange(samples, Math.floor(L.trimStartSeconds * rate), Math.floor(L.trimEndSeconds * rate));
      break;
    case EFFECT_TYPES.FASTER:
    case EFFECT_TYPES.SLOWER: {
      const s0 = Math.floor(startT * rate);
      const affected = Math.floor((L.trimEndSeconds - L.trimStartSeconds) * rate);
      const adj = Math.floor(affected / L.playbackRate);
      out = new Float32Array(n);
      out.set(samples.subarray(0, s0));
      out.set(resampleSegment(samples.subarray(s0, s0 + affected), L.playbackRate, adj), s0);
      out.set(samples.subarray(s0 + affected).subarray(0, Math.max(0, n - s0 - adj)), s0 + adj);
      break;
    }
    case EFFECT_TYPES.LOUDER:
    case EFFECT_TYPES.SOFTER: {
      const v = name === EFFECT_TYPES.LOUDER ? 1.25 : 0.75;
      const ramp = 0.01;
      out = applyGain(
        padded,
        gainCurve(
          [
            { t: Math.max(0, startT - ramp), v: 1, ramp: "set" },
            { t: startT, v, ramp: "exp" },
            { t: endT, v, ramp: "set" },
            { t: endT + ramp, v: 1, ramp: "exp" },
          ],
          1,
          n,
          rate,
        ),
      );
      break;
    }
    case EFFECT_TYPES.FADEIN:
    case EFFECT_TYPES.FADEOUT: {
      const fadeIn = name === EFFECT_TYPES.FADEIN;
      out = applyGain(
        padded,
        gainCurve(
          [
            { t: 0, v: 1, ramp: "set" },
            { t: startT, v: fadeIn ? 0 : 1, ramp: "set" },
            { t: endT, v: fadeIn ? 1 : 0, ramp: "linear" },
            { t: endT, v: 1, ramp: "set" },
          ],
          1,
          n,
          rate,
        ),
      );
      // setValueAtTime(1, end) menimpa nilai akhir ramp pada titik end; sampel sebelum end tetap ramp.
      break;
    }
    case EFFECT_TYPES.MUTE: {
      const ramp = 0.001;
      out = applyGain(
        padded,
        gainCurve(
          [
            { t: Math.max(0, startT - ramp), v: 1, ramp: "set" },
            { t: startT, v: 0, ramp: "linear" },
            { t: endT, v: 0, ramp: "set" },
            { t: endT + ramp, v: 1, ramp: "linear" },
          ],
          1,
          n,
          rate,
        ),
      );
      break;
    }
    case EFFECT_TYPES.ECHO: {
      const d = Math.round(ECHO_DELAY_TIME * rate);
      const sum = new Float32Array(n);
      const delayOut = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        if (i >= d) {
          const j = i - d;
          const tj = j / rate;
          const effIn = tj >= startT && tj < endT ? 0.75 * (padded[j] ?? 0) : 0;
          delayOut[i] = effIn + 0.3 * (delayOut[j] ?? 0);
        }
        sum[i] = (padded[i] ?? 0) + (delayOut[i] ?? 0);
      }
      out = compress(sum, rate);
      break;
    }
    case EFFECT_TYPES.ROBOT: {
      const eff = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const t = i / rate;
        eff[i] = t >= startT && t < endT ? (padded[i] ?? 0) : 0;
      }
      const hp = highpass(eff, rate, 1000);
      const sum = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const t = i / rate;
        const inSel = t >= startT && t < endT;
        const osc = 0.5 * Math.sin(2 * Math.PI * 50 * t);
        const x = eff[i] ?? 0;
        const carrier = -(waveShape(osc) + waveShape(-osc));
        const modulated = waveShape(-(x + osc)) + waveShape(x + osc) + (hp[i] ?? 0);
        // Di luar seleksi (x = 0) suku osilator saling meniadakan, jadi cukup dihitung di dalamnya.
        sum[i] = inSel ? carrier + modulated : 0;
      }
      const wet = compress(sum, rate);
      out = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const t = i / rate;
        out[i] = t >= startT && t < endT ? (wet[i] ?? 0) : (padded[i] ?? 0);
      }
      break;
    }
    default:
      out = new Float32Array(samples);
  }
  return { samples: out, sampleRate: rate, trimStart: L.adjustedTrimStart, trimEnd: L.adjustedTrimEnd };
}
