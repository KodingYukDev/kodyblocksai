/** Resep suara pustaka orisinal (semua disintesis, bebas lisensi, CC0 KodingYuk). */
import type { SoundArt } from "../art/art-types";
import { SYNTH_RATE, concat, midi, mix, noise, normalize, pluck, tone, tremolo } from "./synth";

type Recipe = Omit<SoundArt, "samples" | "rate"> & { make: () => Float32Array };

const exp = (f0: number, f1: number, dur: number) => (t: number): number => f0 * Math.pow(f1 / f0, Math.min(1, t / dur));
const lin = (f0: number, f1: number, dur: number) => (t: number): number => f0 + (f1 - f0) * Math.min(1, t / dur);
const vib = (f0: number, rate: number, depth: number) => (t: number): number => f0 * (1 + depth * Math.sin(2 * Math.PI * rate * t));

function arpeggio(notes: number[], step: number, wave: "sine" | "square" | "triangle" = "square", tail = 0.2): Float32Array {
  const dur = step * notes.length + tail;
  return mix(dur, ...notes.map((n, i): [Float32Array, number] => [tone(midi(n), step + (i === notes.length - 1 ? tail : 0.02), wave, { attack: 0.004, release: 0.04 }, 0.35), i * step]));
}

function bell(freq: number, dur: number): Float32Array {
  return mix(
    dur,
    [tone(freq, dur, "sine", { attack: 0.002, decay: dur, sustain: 0, release: 0.01 }, 0.5)],
    [tone(freq * 2.76, dur * 0.6, "sine", { attack: 0.002, decay: dur * 0.6, sustain: 0, release: 0.01 }, 0.2)],
    [tone(freq * 5.4, dur * 0.3, "sine", { attack: 0.002, decay: dur * 0.3, sustain: 0, release: 0.01 }, 0.1)],
  );
}

function piano(note: number): Float32Array {
  const f0 = midi(note);
  const env = { attack: 0.003, decay: 0.9, sustain: 0.0, release: 0.05 };
  return mix(1, [tone(f0, 1, "triangle", env, 0.45)], [tone(f0 * 2, 1, "sine", env, 0.15)], [tone(f0 * 3, 0.5, "sine", { ...env, decay: 0.45 }, 0.06)]);
}

const RECIPES: Recipe[] = [
  { id: "pop", name: "Pop", nameEn: "Pop", category: "efek", tags: ["pendek", "gelembung", "lucu"], make: () => tone(exp(900, 180, 0.08), 0.09, "sine", { attack: 0.001, release: 0.03 }) },
  { id: "boing", name: "Boing", nameEn: "Boing", category: "kartun", tags: ["pantul", "lucu", "lompat"], make: () => tone((t) => 180 + 140 * Math.sin(2 * Math.PI * 9 * t) * Math.exp(-4 * t) + 120 * t, 0.6, "triangle", { attack: 0.002, release: 0.2 }) },
  { id: "chime", name: "Denting", nameEn: "Chime", category: "musik", tags: ["lonceng", "lembut"], make: () => mix(1.2, [bell(midi(84), 1.0)], [bell(midi(91), 0.9), 0.12]) },
  { id: "gelembung", name: "Gelembung", nameEn: "Bubbles", category: "alam", tags: ["air", "laut"], make: () => concat(...[0, 1, 2, 3].map((i) => tone(exp(400 + i * 120, 1200 + i * 100, 0.06), 0.08, "sine", { attack: 0.002, release: 0.03 }, 0.5))) },
  { id: "cicit", name: "Cicit Burung", nameEn: "Chirp", category: "hewan", tags: ["burung", "kicau"], make: () => concat(tone(exp(2400, 4200, 0.07), 0.08, "sine", { release: 0.02 }), new Float32Array(1500), tone(exp(2600, 4600, 0.06), 0.07, "sine", { release: 0.02 }), new Float32Array(900), tone(exp(4200, 2400, 0.1), 0.12, "sine", { release: 0.04 })) },
  { id: "sihir", name: "Sihir", nameEn: "Magic", category: "efek", tags: ["kilau", "fantasi"], make: () => mix(1, ...[0, 1, 2, 3, 4, 5, 6, 7].map((i): [Float32Array, number] => [tone(midi(84 + ((i * 5) % 12)), 0.3, "sine", { attack: 0.002, decay: 0.28, sustain: 0, release: 0.01 }, 0.3), i * 0.07])) },
  { id: "whoosh", name: "Wus", nameEn: "Whoosh", category: "efek", tags: ["angin", "cepat", "gerak"], make: () => noise(0.5, 3, { attack: 0.25, release: 0.25 }, 0.8, 2500, 300) },
  { id: "klik", name: "Klik", nameEn: "Click", category: "antarmuka", tags: ["tombol", "pendek"], make: () => mix(0.04, [noise(0.015, 5, { attack: 0.0005, release: 0.012 }, 0.8, 8000, 1500)], [tone(2000, 0.02, "square", { attack: 0.0005, release: 0.015 }, 0.2)]) },
  { id: "auman", name: "Auman", nameEn: "Roar", category: "hewan", tags: ["dinosaurus", "singa", "seram"], make: () => mix(1, [tone(vib(90, 22, 0.25), 1, "saw", { attack: 0.08, release: 0.4 }, 0.5)], [noise(1, 7, { attack: 0.1, release: 0.4 }, 0.35, 900)]) },
  { id: "dengung", name: "Dengung", nameEn: "Buzz", category: "hewan", tags: ["lebah", "serangga"], make: () => tremolo(tone(vib(220, 7, 0.04), 0.9, "saw", { attack: 0.05, release: 0.15 }, 0.35), 30, 0.4) },
  { id: "guk", name: "Guk", nameEn: "Woof", category: "hewan", tags: ["anjing", "gonggong"], make: () => concat(mix(0.18, [tone(exp(420, 220, 0.16), 0.18, "saw", { attack: 0.01, release: 0.08 }, 0.4)], [noise(0.18, 9, { attack: 0.005, release: 0.1 }, 0.3, 1500)]), new Float32Array(2600), mix(0.2, [tone(exp(460, 230, 0.18), 0.2, "saw", { attack: 0.01, release: 0.08 }, 0.4)], [noise(0.2, 10, { attack: 0.005, release: 0.1 }, 0.3, 1500)])) },
  { id: "meong", name: "Meong", nameEn: "Meow", category: "hewan", tags: ["kucing"], make: () => tone((t) => (t < 0.25 ? 500 + 500 * (t / 0.25) : 1000 - 450 * ((t - 0.25) / 0.45)), 0.7, "triangle", { attack: 0.05, release: 0.25 }, 0.5) },
  { id: "tendang", name: "Tendang", nameEn: "Kick", category: "olahraga", tags: ["bola", "pukul"], make: () => mix(0.2, [tone(exp(160, 50, 0.12), 0.18, "sine", { attack: 0.001, release: 0.1 }, 0.8)], [noise(0.05, 12, { attack: 0.001, release: 0.04 }, 0.4, 3000)]) },
  { id: "roket", name: "Roket", nameEn: "Rocket", category: "efek", tags: ["luar angkasa", "meluncur"], make: () => mix(1.5, [noise(1.5, 13, { attack: 0.3, release: 0.4 }, 0.6, 1200)], [tone(exp(80, 400, 1.4), 1.5, "saw", { attack: 0.3, release: 0.4 }, 0.15)]) },
  { id: "robot-bip", name: "Bip Robot", nameEn: "Robot Beeps", category: "efek", tags: ["robot", "komputer", "mesin"], make: () => concat(...[880, 660, 990, 550, 1100].map((fr) => tone(fr, 0.08, "square", { attack: 0.002, release: 0.02 }, 0.25))) },
  { id: "angin", name: "Angin", nameEn: "Wind", category: "alam", tags: ["cuaca", "udara"], make: () => tremolo(noise(1.6, 14, { attack: 0.5, release: 0.6 }, 0.7, 700), 0.8, 0.6) },
  { id: "kriuk", name: "Kriuk", nameEn: "Crunch", category: "makanan", tags: ["makan", "gigit"], make: () => concat(...[0, 1, 2].map((i) => concat(noise(0.05, 20 + i, { attack: 0.001, release: 0.03 }, 0.8, 5000, 800), new Float32Array(800)))) },
  { id: "klakson", name: "Klakson", nameEn: "Car Horn", category: "transportasi", tags: ["mobil", "jalan"], make: () => concat(mix(0.25, [tone(415, 0.25, "square", { attack: 0.01, release: 0.03 }, 0.2)], [tone(523, 0.25, "square", { attack: 0.01, release: 0.03 }, 0.2)]), new Float32Array(1500), mix(0.4, [tone(415, 0.4, "square", { attack: 0.01, release: 0.05 }, 0.2)], [tone(523, 0.4, "square", { attack: 0.01, release: 0.05 }, 0.2)])) },
  { id: "laser", name: "Laser", nameEn: "Laser", category: "game", tags: ["tembak", "luar angkasa"], make: () => tone(exp(1800, 200, 0.25), 0.28, "square", { attack: 0.002, release: 0.08 }, 0.3) },
  { id: "koin", name: "Koin", nameEn: "Coin", category: "game", tags: ["hadiah", "poin", "uang"], make: () => concat(tone(midi(83), 0.07, "square", { attack: 0.002, release: 0.01 }, 0.3), tone(midi(88), 0.3, "square", { attack: 0.002, decay: 0.28, sustain: 0, release: 0.02 }, 0.3)) },
  { id: "tada", name: "Ta-da", nameEn: "Ta-da", category: "musik", tags: ["menang", "selesai", "fanfare"], make: () => mix(1.1, [arpeggio([60, 64, 67], 0.1, "square", 0)], [mix(0.8, [tone(midi(72), 0.8, "saw", { attack: 0.01, release: 0.4 }, 0.15)], [tone(midi(76), 0.8, "saw", { attack: 0.01, release: 0.4 }, 0.15)], [tone(midi(79), 0.8, "saw", { attack: 0.01, release: 0.4 }, 0.15)]), 0.3]) },
  { id: "lompat", name: "Lompat", nameEn: "Jump", category: "game", tags: ["platformer", "loncat"], make: () => tone(exp(300, 900, 0.18), 0.2, "square", { attack: 0.002, release: 0.05 }, 0.25) },
  { id: "ledakan", name: "Ledakan", nameEn: "Explosion", category: "game", tags: ["bom", "keras"], make: () => mix(1.2, [noise(1.2, 30, { attack: 0.002, decay: 1.1, sustain: 0, release: 0.05 }, 1, 1200)], [tone(exp(120, 30, 0.8), 0.9, "sine", { attack: 0.002, decay: 0.8, sustain: 0, release: 0.05 }, 0.7)]) },
  { id: "power-up", name: "Naik Level", nameEn: "Power Up", category: "game", tags: ["level", "bonus"], make: () => arpeggio([60, 64, 67, 72, 76, 79, 84], 0.05, "square", 0.1) },
  { id: "power-down", name: "Turun Level", nameEn: "Power Down", category: "game", tags: ["kalah", "nyawa"], make: () => arpeggio([79, 74, 70, 67, 62, 58, 55], 0.07, "square", 0.15) },
  { id: "beep", name: "Bip", nameEn: "Beep", category: "antarmuka", tags: ["notifikasi", "pendek"], make: () => tone(1000, 0.15, "sine", { attack: 0.005, release: 0.02 }, 0.5) },
  { id: "salah", name: "Salah", nameEn: "Wrong", category: "antarmuka", tags: ["gagal", "error", "kuis"], make: () => concat(tone(180, 0.18, "saw", { attack: 0.005, release: 0.03 }, 0.3), new Float32Array(800), tone(140, 0.35, "saw", { attack: 0.005, release: 0.1 }, 0.3)) },
  { id: "benar", name: "Benar", nameEn: "Correct", category: "antarmuka", tags: ["sukses", "kuis", "jawaban"], make: () => arpeggio([76, 84], 0.09, "sine", 0.25) },
  { id: "sirene", name: "Sirene", nameEn: "Siren", category: "transportasi", tags: ["polisi", "darurat"], make: () => tone((t) => 700 + 350 * Math.sin(2 * Math.PI * 1.2 * t), 1.6, "triangle", { attack: 0.05, release: 0.2 }, 0.4) },
  { id: "tetes", name: "Tetes Air", nameEn: "Water Drop", category: "alam", tags: ["air", "hujan"], make: () => tone(exp(500, 1600, 0.04), 0.12, "sine", { attack: 0.001, decay: 0.1, sustain: 0, release: 0.02 }, 0.6) },
  { id: "hujan", name: "Hujan", nameEn: "Rain", category: "alam", tags: ["cuaca", "air"], make: () => mix(1.6, [noise(1.6, 40, { attack: 0.3, release: 0.4 }, 0.5, 6000, 900)], ...[0.2, 0.5, 0.8, 1.1].map((o, i): [Float32Array, number] => [tone(exp(700 + i * 100, 1500, 0.03), 0.06, "sine", { attack: 0.001, release: 0.04 }, 0.2), o])) },
  { id: "detak-jantung", name: "Detak Jantung", nameEn: "Heartbeat", category: "efek", tags: ["tegang", "jantung"], make: () => { const beat = tone(exp(90, 45, 0.1), 0.12, "sine", { attack: 0.003, release: 0.08 }, 0.9); return mix(1.2, [beat], [beat, 0.2], [beat, 0.8], [beat, 1.0]); } },
  { id: "alarm", name: "Alarm", nameEn: "Alarm", category: "antarmuka", tags: ["jam", "bangun", "peringatan"], make: () => concat(...[0, 1, 2, 3].map(() => concat(tone(1300, 0.1, "square", { attack: 0.002, release: 0.01 }, 0.25), new Float32Array(Math.round(0.08 * SYNTH_RATE))))) },
  { id: "lonceng", name: "Lonceng", nameEn: "Bell", category: "musik", tags: ["sekolah", "dering"], make: () => bell(midi(76), 1.4) },
  { id: "drum-kick", name: "Drum Bass", nameEn: "Kick Drum", category: "perkusi", tags: ["drum", "ketukan"], make: () => tone(exp(150, 45, 0.15), 0.35, "sine", { attack: 0.001, decay: 0.3, sustain: 0, release: 0.04 }, 0.9) },
  { id: "snare", name: "Snare", nameEn: "Snare Drum", category: "perkusi", tags: ["drum", "ketukan"], make: () => mix(0.25, [noise(0.25, 50, { attack: 0.001, decay: 0.2, sustain: 0, release: 0.04 }, 0.6, 7000, 1200)], [tone(190, 0.1, "triangle", { attack: 0.001, release: 0.08 }, 0.4)]) },
  { id: "hi-hat", name: "Hi-hat", nameEn: "Hi-hat", category: "perkusi", tags: ["drum", "simbal"], make: () => noise(0.1, 60, { attack: 0.001, decay: 0.08, sustain: 0, release: 0.01 }, 0.5, undefined, 6000) },
  { id: "tepuk", name: "Tepuk Tangan", nameEn: "Clap", category: "perkusi", tags: ["tangan", "ketukan"], make: () => mix(0.3, ...[0, 0.012, 0.024].map((o, i): [Float32Array, number] => [noise(0.2 - o, 70 + i, { attack: 0.001, decay: 0.15, sustain: 0, release: 0.03 }, 0.5, 5000, 800), o])) },
  { id: "piano-do", name: "Piano Do", nameEn: "Piano C", category: "musik", tags: ["piano", "nada", "c"], make: () => piano(60) },
  { id: "piano-mi", name: "Piano Mi", nameEn: "Piano E", category: "musik", tags: ["piano", "nada", "e"], make: () => piano(64) },
  { id: "piano-sol", name: "Piano Sol", nameEn: "Piano G", category: "musik", tags: ["piano", "nada", "g"], make: () => piano(67) },
  { id: "gitar", name: "Petik Gitar", nameEn: "Guitar Pluck", category: "musik", tags: ["gitar", "senar"], make: () => mix(1.2, [pluck(midi(52), 1.2, 80)], [pluck(midi(59), 1.1, 81), 0.04], [pluck(midi(64), 1.0, 82), 0.08]) },
  { id: "xilofon", name: "Xilofon", nameEn: "Xylophone", category: "musik", tags: ["nada", "pukul"], make: () => concat(...[72, 76, 79, 84].map((n) => tone(midi(n), 0.18, "sine", { attack: 0.001, decay: 0.17, sustain: 0, release: 0.01 }, 0.5))) },
  { id: "bass", name: "Bass", nameEn: "Bass", category: "musik", tags: ["nada", "rendah"], make: () => pluck(midi(36), 0.9, 90, 0.8, 0.998) },
];

/** Bangun semua suara (dinormalisasi ke puncak 0.8). */
export function soundArts(): SoundArt[] {
  return RECIPES.map(({ make, ...meta }) => ({ ...meta, rate: SYNTH_RATE, samples: normalize(make()) }));
}

export const SOUND_IDS: readonly string[] = RECIPES.map((r) => r.id);
