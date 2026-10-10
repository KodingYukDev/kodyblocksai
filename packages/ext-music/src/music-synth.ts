/**
 * Sintesis WebAudio cadangan untuk drum & instrumen ekstensi Music. Dipakai selama sampel mp3
 * belum termuat atau gagal dimuat (offline / fetch diblokir), supaya blok tetap berbunyi.
 * Buffer dibuat sekali per sampel dan disimpan di cache oleh music-samples.ts.
 * Generator acak deterministik (LCG) agar hasil sama setiap kali.
 */

export interface SampleBufferFactory {
  createBuffer(numberOfChannels: number, length: number, sampleRate: number): AudioBuffer;
  readonly sampleRate: number;
}

type Shape = "piano" | "pluck" | "organ" | "bowed" | "wind" | "reed" | "mallet" | "choir" | "lead" | "pad";

/** Karakter tiap instrumen (indeks 0-based sama dengan INSTRUMENT_INFO). */
const INSTRUMENT_SHAPES: readonly Shape[] = [
  "piano", "piano", "organ", "pluck", "pluck", "pluck", "pluck", "bowed", "reed", "reed", "reed",
  "wind", "wind", "reed", "choir", "mallet", "mallet", "mallet", "mallet", "lead", "pad",
];

function midiToHz(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

function makeRandom(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function harmonicsFor(shape: Shape): readonly number[] {
  switch (shape) {
    case "organ":
      return [1, 0.8, 0.6, 0.4, 0.2, 0.15, 0.1];
    case "reed":
      return [1, 0.1, 0.6, 0.1, 0.4, 0.1, 0.25];
    case "wind":
      return [1, 0.25, 0.08, 0.04];
    case "bowed":
      return [1, 0.6, 0.45, 0.35, 0.25, 0.2, 0.15, 0.1];
    case "mallet":
      return [1, 0, 0, 0.3, 0, 0, 0, 0, 0, 0.1];
    case "choir":
      return [1, 0.5, 0.3, 0.2, 0.1];
    case "lead":
      return [1, 0.5, 0.33, 0.25, 0.2, 0.16, 0.14, 0.12];
    case "pad":
      return [1, 0.4, 0.2, 0.1];
    case "pluck":
      return [1, 0.7, 0.5, 0.35, 0.25, 0.15];
    case "piano":
    default:
      return [1, 0.55, 0.3, 0.18, 0.1, 0.06];
  }
}

function envelope(shape: Shape, t: number): number {
  const attack = shape === "pad" || shape === "choir" || shape === "bowed" ? 0.08 : shape === "wind" ? 0.04 : 0.005;
  const a = Math.min(1, t / attack);
  switch (shape) {
    case "piano":
      return a * Math.exp(-t * 1.6);
    case "pluck":
      return a * Math.exp(-t * 2.5);
    case "mallet":
      return a * Math.exp(-t * 3);
    default:
      return a * Math.exp(-t * 0.25);
  }
}

/** Buffer nada instrumen (sampel pada nada MIDI `sampleNote`). */
export function synthInstrumentSample(factory: SampleBufferFactory, instrument: number, sampleNote: number): AudioBuffer {
  const shape = INSTRUMENT_SHAPES[instrument] ?? "piano";
  const rate = factory.sampleRate;
  const seconds = shape === "mallet" || shape === "pluck" ? 2 : 3;
  const length = Math.floor(rate * seconds);
  const buffer = factory.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  const f0 = midiToHz(sampleNote);
  const harmonics = harmonicsFor(shape);
  const nyquist = rate / 2;
  let norm = 0;
  for (const h of harmonics) norm += h;
  for (let i = 0; i < length; i++) {
    const t = i / rate;
    const vibrato = shape === "choir" || shape === "bowed" || shape === "wind" ? 1 + 0.004 * Math.sin(2 * Math.PI * 5 * t) : 1;
    let v = 0;
    for (let k = 0; k < harmonics.length; k++) {
      const amp = harmonics[k] ?? 0;
      // Nada dasar selalu ada (dibatasi di bawah Nyquist); harmonik di atas Nyquist dibuang.
      const f = k === 0 ? Math.min(f0 * vibrato, nyquist * 0.9) : f0 * (k + 1) * vibrato;
      if (amp === 0 || f >= nyquist) continue;
      v += amp * Math.sin(2 * Math.PI * f * t);
    }
    data[i] = (0.5 * v * envelope(shape, t)) / norm;
  }
  return buffer;
}

interface DrumRecipe {
  /** Frekuensi nada (Hz) atau 0 untuk tanpa nada. */
  tone: number;
  /** Frekuensi akhir sapuan nada. */
  toneEnd: number;
  toneDecay: number;
  noise: number;
  noiseDecay: number;
  /** Koefisien high-pass satu kutub 0..1 untuk derau (makin besar makin tipis). */
  brightness: number;
  seconds: number;
}

/** Resep sederhana tiap drum (indeks 0-based sama dengan DRUM_INFO). */
const DRUM_RECIPES: readonly DrumRecipe[] = [
  { tone: 190, toneEnd: 150, toneDecay: 20, noise: 0.8, noiseDecay: 14, brightness: 0.6, seconds: 0.4 }, // snare
  { tone: 110, toneEnd: 45, toneDecay: 9, noise: 0.05, noiseDecay: 40, brightness: 0.2, seconds: 0.6 }, // bass drum
  { tone: 420, toneEnd: 380, toneDecay: 60, noise: 0.4, noiseDecay: 60, brightness: 0.7, seconds: 0.15 }, // side stick
  { tone: 0, toneEnd: 0, toneDecay: 1, noise: 0.9, noiseDecay: 1.6, brightness: 0.92, seconds: 2.5 }, // crash
  { tone: 0, toneEnd: 0, toneDecay: 1, noise: 0.7, noiseDecay: 5, brightness: 0.95, seconds: 0.8 }, // open hi-hat
  { tone: 0, toneEnd: 0, toneDecay: 1, noise: 0.7, noiseDecay: 35, brightness: 0.95, seconds: 0.2 }, // closed hi-hat
  { tone: 0, toneEnd: 0, toneDecay: 1, noise: 0.6, noiseDecay: 9, brightness: 0.97, seconds: 0.5 }, // tambourine
  { tone: 0, toneEnd: 0, toneDecay: 1, noise: 0.9, noiseDecay: 22, brightness: 0.75, seconds: 0.3 }, // hand clap
  { tone: 2500, toneEnd: 2500, toneDecay: 30, noise: 0, noiseDecay: 1, brightness: 0, seconds: 0.2 }, // claves
  { tone: 1100, toneEnd: 1000, toneDecay: 28, noise: 0.1, noiseDecay: 60, brightness: 0.5, seconds: 0.25 }, // wood block
  { tone: 560, toneEnd: 540, toneDecay: 9, noise: 0.05, noiseDecay: 40, brightness: 0.5, seconds: 0.5 }, // cowbell
  { tone: 4000, toneEnd: 4000, toneDecay: 1.5, noise: 0, noiseDecay: 1, brightness: 0, seconds: 2 }, // triangle
  { tone: 400, toneEnd: 330, toneDecay: 14, noise: 0.1, noiseDecay: 40, brightness: 0.4, seconds: 0.35 }, // bongo
  { tone: 260, toneEnd: 220, toneDecay: 10, noise: 0.1, noiseDecay: 40, brightness: 0.4, seconds: 0.45 }, // conga
  { tone: 0, toneEnd: 0, toneDecay: 1, noise: 0.5, noiseDecay: 18, brightness: 0.97, seconds: 0.3 }, // cabasa
  { tone: 0, toneEnd: 0, toneDecay: 1, noise: 0.6, noiseDecay: 4, brightness: 0.85, seconds: 0.5 }, // guiro
  { tone: 0, toneEnd: 0, toneDecay: 1, noise: 0.6, noiseDecay: 2.5, brightness: 0.9, seconds: 1.2 }, // vibraslap
  { tone: 600, toneEnd: 900, toneDecay: 6, noise: 0.1, noiseDecay: 20, brightness: 0.5, seconds: 0.5 }, // cuica
];

export function synthDrumSample(factory: SampleBufferFactory, drum: number): AudioBuffer {
  const recipe = DRUM_RECIPES[drum] ?? DRUM_RECIPES[0];
  const r = recipe as DrumRecipe;
  const rate = factory.sampleRate;
  const length = Math.max(1, Math.floor(rate * r.seconds));
  const buffer = factory.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  const random = makeRandom(drum + 1);
  // Derau berulang (guiro/vibraslap) memakai modulasi amplitudo.
  const rattle = drum === 15 ? 30 : drum === 16 ? 25 : 0;
  let phase = 0;
  let prevNoise = 0;
  let prevOut = 0;
  for (let i = 0; i < length; i++) {
    const t = i / rate;
    let v = 0;
    if (r.tone > 0) {
      // Dibatasi di bawah Nyquist agar nada tinggi (triangle) tidak hilang di sample rate rendah.
      const f = Math.min(r.toneEnd + (r.tone - r.toneEnd) * Math.exp(-t * 30), rate * 0.45);
      phase += (2 * Math.PI * f) / rate;
      v += Math.sin(phase) * Math.exp(-t * r.toneDecay);
    }
    if (r.noise > 0) {
      const white = random() * 2 - 1;
      // High-pass satu kutub.
      const hp = r.brightness * (prevOut + white - prevNoise);
      prevNoise = white;
      prevOut = hp;
      const mix = r.brightness > 0 ? hp : white;
      const am = rattle > 0 ? 0.5 + 0.5 * Math.sin(2 * Math.PI * rattle * t) : 1;
      v += r.noise * mix * am * Math.exp(-t * r.noiseDecay);
    }
    const fadeOut = Math.min(1, (length - i) / (rate * 0.01));
    data[i] = 0.6 * v * fadeOut;
  }
  return buffer;
}
