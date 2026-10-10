/**
 * Data ekstensi Music: drum, instrumen, tabel MIDI, batas, dan getInfo().
 * Nilai (urutan, sampel, releaseTime, tabel MIDI_INSTRUMENTS/MIDI_DRUMS, batas) disalin dari
 * scratch-vm 4.8.102 src/extensions/scratch3_music/index.js (BSD-3-Clause, lihat THIRD_PARTY.md).
 */
import type { ExtensionInfo, ExtensionMenuItem } from "@kody/engine";
import { MUSIC_BLOCK_ICON_URI, MUSIC_MENU_ICON_URI } from "./icons";

export const MUSIC_EXTENSION_ID = "music";
export const MUSIC_STATE_KEY = "Scratch.music";

export type MusicLocale = "id" | "en";

export const MIDI_NOTE_RANGE = { min: 0, max: 130 } as const;
export const BEAT_RANGE = { min: 0, max: 100 } as const;
export const TEMPO_RANGE = { min: 20, max: 500 } as const;
/** Jumlah suara bersamaan maksimum (CONCURRENCY_LIMIT). */
export const CONCURRENCY_LIMIT = 30;

export interface MusicState {
  currentInstrument: number;
}

export function defaultMusicState(): MusicState {
  return { currentInstrument: 0 };
}

export interface DrumInfo {
  name: string;
  nameId: string;
  /** Nama file sampel di assets/drums/ tanpa .mp3. */
  fileName: string;
}

export interface InstrumentInfo {
  name: string;
  nameId: string;
  dirName: string;
  /** undefined -> 0.01 detik seperti Scratch. */
  releaseTime?: number;
  /** Nada MIDI tiap sampel (urut naik). */
  samples: readonly number[];
}

export const DRUM_INFO: readonly DrumInfo[] = [
  { name: "(1) Snare Drum", nameId: "(1) Drum Senar", fileName: "1-snare" },
  { name: "(2) Bass Drum", nameId: "(2) Drum Bass", fileName: "2-bass-drum" },
  { name: "(3) Side Stick", nameId: "(3) Pukulan Pinggir", fileName: "3-side-stick" },
  { name: "(4) Crash Cymbal", nameId: "(4) Simbal Crash", fileName: "4-crash-cymbal" },
  { name: "(5) Open Hi-Hat", nameId: "(5) Hi-Hat Terbuka", fileName: "5-open-hi-hat" },
  { name: "(6) Closed Hi-Hat", nameId: "(6) Hi-Hat Tertutup", fileName: "6-closed-hi-hat" },
  { name: "(7) Tambourine", nameId: "(7) Tamborin", fileName: "7-tambourine" },
  { name: "(8) Hand Clap", nameId: "(8) Tepuk Tangan", fileName: "8-hand-clap" },
  { name: "(9) Claves", nameId: "(9) Klaves", fileName: "9-claves" },
  { name: "(10) Wood Block", nameId: "(10) Balok Kayu", fileName: "10-wood-block" },
  { name: "(11) Cowbell", nameId: "(11) Lonceng Sapi", fileName: "11-cowbell" },
  { name: "(12) Triangle", nameId: "(12) Triangel", fileName: "12-triangle" },
  { name: "(13) Bongo", nameId: "(13) Bongo", fileName: "13-bongo" },
  { name: "(14) Conga", nameId: "(14) Konga", fileName: "14-conga" },
  { name: "(15) Cabasa", nameId: "(15) Kabasa", fileName: "15-cabasa" },
  { name: "(16) Guiro", nameId: "(16) Guiro", fileName: "16-guiro" },
  { name: "(17) Vibraslap", nameId: "(17) Vibraslap", fileName: "17-vibraslap" },
  { name: "(18) Cuica", nameId: "(18) Cuica", fileName: "18-cuica" },
];

export const INSTRUMENT_INFO: readonly InstrumentInfo[] = [
  { name: "(1) Piano", nameId: "(1) Piano", dirName: "1-piano", releaseTime: 0.5, samples: [24, 36, 48, 60, 72, 84, 96, 108] },
  { name: "(2) Electric Piano", nameId: "(2) Piano Elektrik", dirName: "2-electric-piano", releaseTime: 0.5, samples: [60] },
  { name: "(3) Organ", nameId: "(3) Organ", dirName: "3-organ", releaseTime: 0.5, samples: [60] },
  { name: "(4) Guitar", nameId: "(4) Gitar", dirName: "4-guitar", releaseTime: 0.5, samples: [60] },
  { name: "(5) Electric Guitar", nameId: "(5) Gitar Elektrik", dirName: "5-electric-guitar", releaseTime: 0.5, samples: [60] },
  { name: "(6) Bass", nameId: "(6) Bas", dirName: "6-bass", releaseTime: 0.25, samples: [36, 48] },
  { name: "(7) Pizzicato", nameId: "(7) Pizzicato", dirName: "7-pizzicato", releaseTime: 0.25, samples: [60] },
  { name: "(8) Cello", nameId: "(8) Selo", dirName: "8-cello", releaseTime: 0.1, samples: [36, 48, 60] },
  { name: "(9) Trombone", nameId: "(9) Trombon", dirName: "9-trombone", samples: [36, 48, 60] },
  { name: "(10) Clarinet", nameId: "(10) Klarinet", dirName: "10-clarinet", samples: [48, 60] },
  { name: "(11) Saxophone", nameId: "(11) Saksofon", dirName: "11-saxophone", samples: [36, 60, 84] },
  { name: "(12) Flute", nameId: "(12) Seruling", dirName: "12-flute", samples: [60, 72] },
  { name: "(13) Wooden Flute", nameId: "(13) Seruling Kayu", dirName: "13-wooden-flute", samples: [60, 72] },
  { name: "(14) Bassoon", nameId: "(14) Bason", dirName: "14-bassoon", samples: [36, 48, 60] },
  { name: "(15) Choir", nameId: "(15) Paduan Suara", dirName: "15-choir", releaseTime: 0.25, samples: [48, 60, 72] },
  { name: "(16) Vibraphone", nameId: "(16) Vibrafon", dirName: "16-vibraphone", releaseTime: 0.5, samples: [60, 72] },
  { name: "(17) Music Box", nameId: "(17) Kotak Musik", dirName: "17-music-box", releaseTime: 0.25, samples: [60] },
  { name: "(18) Steel Drum", nameId: "(18) Drum Baja", dirName: "18-steel-drum", releaseTime: 0.5, samples: [60] },
  { name: "(19) Marimba", nameId: "(19) Marimba", dirName: "19-marimba", samples: [60] },
  { name: "(20) Synth Lead", nameId: "(20) Synth Lead", dirName: "20-synth-lead", releaseTime: 0.1, samples: [60] },
  { name: "(21) Synth Pad", nameId: "(21) Synth Pad", dirName: "21-synth-pad", releaseTime: 0.25, samples: [60] },
];

/** Program MIDI (0-based) -> instrumen Scratch (1-based). Untuk midiSetInstrument (Scratch 2). */
// prettier-ignore
export const MIDI_INSTRUMENTS: readonly number[] = [
  1, 1, 1, 1, 2, 2, 4, 4, 17, 17, 17, 16, 19, 16, 17, 17,
  3, 3, 3, 3, 3, 3, 3, 3, 4, 4, 5, 5, 5, 5, 5, 5,
  6, 6, 6, 6, 6, 6, 6, 6, 8, 8, 8, 8, 8, 7, 8, 19,
  8, 8, 8, 8, 15, 15, 15, 19, 9, 9, 9, 9, 9, 9, 9, 9,
  11, 11, 11, 11, 14, 14, 14, 10, 12, 12, 13, 13, 13, 13, 12, 12,
  20, 20, 20, 20, 20, 20, 20, 20, 21, 21, 21, 21, 21, 21, 21, 21,
  21, 21, 21, 21, 21, 21, 21, 21, 4, 4, 4, 4, 17, 14, 8, 10,
  17, 17, 18, 19, 1, 1, 1, 1, 21, 21, 21, 21, 21, 21, 21, 21,
];

/** Nada drum MIDI 35.. -> [drum Scratch 0-based, pitch, decay?]. Untuk midiPlayDrumForBeats. */
// prettier-ignore
export const MIDI_DRUMS: readonly (readonly number[])[] = [
  [1, -4], [1, 0], [2, 0], [0, 0], [7, 0], [0, 2], [1, -6, 4], [5, 0],
  [1, -3, 3.2], [5, 0], [1, 0, 3], [4, -8], [1, 4, 3], [1, 7, 2.7], [3, -8], [1, 10, 2.7],
  [4, -2], [3, -11], [4, 2], [6, 0], [3, 0, 3.5], [10, 0], [3, -8, 3.5], [16, -6],
  [4, 2], [12, 2], [12, 0], [13, 0, 0.2], [13, 0, 2], [13, -5, 2], [12, 12], [12, 5],
  [10, 19], [10, 12], [14, 0], [14, 0], [17, 12], [17, 5], [15, 0], [15, 0],
  [8, 0], [9, 0], [9, -4], [17, -5], [17, 0], [11, -6, 1], [11, -6, 3],
];

/** _buildMenu: value = String(index + 1). */
function buildMenu(names: readonly string[]): ExtensionMenuItem[] {
  return names.map((text, index) => ({ text, value: String(index + 1) }));
}

interface MusicMessages {
  categoryName: string;
  playDrumForBeats: string;
  restForBeats: string;
  playNoteForBeats: string;
  setInstrument: string;
  setTempo: string;
  changeTempo: string;
  getTempo: string;
}

const EN: MusicMessages = {
  categoryName: "Music",
  playDrumForBeats: "play drum [DRUM] for [BEATS] beats",
  restForBeats: "rest for [BEATS] beats",
  playNoteForBeats: "play note [NOTE] for [BEATS] beats",
  setInstrument: "set instrument to [INSTRUMENT]",
  setTempo: "set tempo to [TEMPO]",
  changeTempo: "change tempo by [TEMPO]",
  getTempo: "tempo",
};

const ID: MusicMessages = {
  categoryName: "Musik",
  playDrumForBeats: "mainkan drum [DRUM] selama [BEATS] ketukan",
  restForBeats: "diam selama [BEATS] ketukan",
  playNoteForBeats: "mainkan nada [NOTE] selama [BEATS] ketukan",
  setInstrument: "atur instrumen ke [INSTRUMENT]",
  setTempo: "atur tempo ke [TEMPO]",
  changeTempo: "ubah tempo sebesar [TEMPO]",
  getTempo: "tempo",
};

export function getMusicInfo(locale: MusicLocale = "id"): ExtensionInfo {
  const m = locale === "en" ? EN : ID;
  const drumNames = DRUM_INFO.map((d) => (locale === "en" ? d.name : d.nameId));
  const instNames = INSTRUMENT_INFO.map((i) => (locale === "en" ? i.name : i.nameId));
  return {
    id: MUSIC_EXTENSION_ID,
    name: m.categoryName,
    color1: "#0FBD8C",
    color2: "#0DA57A",
    color3: "#0B8E69",
    menuIconURI: MUSIC_MENU_ICON_URI,
    blockIconURI: MUSIC_BLOCK_ICON_URI,
    blocks: [
      {
        opcode: "playDrumForBeats",
        blockType: "command",
        text: m.playDrumForBeats,
        arguments: {
          DRUM: { type: "number", menu: "DRUM", defaultValue: 1 },
          BEATS: { type: "number", defaultValue: 0.25 },
        },
      },
      {
        opcode: "midiPlayDrumForBeats",
        blockType: "command",
        text: m.playDrumForBeats,
        arguments: {
          DRUM: { type: "number", menu: "DRUM", defaultValue: 1 },
          BEATS: { type: "number", defaultValue: 0.25 },
        },
        hideFromPalette: true,
      },
      {
        opcode: "restForBeats",
        blockType: "command",
        text: m.restForBeats,
        arguments: { BEATS: { type: "number", defaultValue: 0.25 } },
      },
      {
        opcode: "playNoteForBeats",
        blockType: "command",
        text: m.playNoteForBeats,
        arguments: {
          NOTE: { type: "note", defaultValue: 60 },
          BEATS: { type: "number", defaultValue: 0.25 },
        },
      },
      {
        opcode: "setInstrument",
        blockType: "command",
        text: m.setInstrument,
        arguments: { INSTRUMENT: { type: "number", menu: "INSTRUMENT", defaultValue: 1 } },
      },
      {
        opcode: "midiSetInstrument",
        blockType: "command",
        text: m.setInstrument,
        arguments: { INSTRUMENT: { type: "number", defaultValue: 1 } },
        hideFromPalette: true,
      },
      {
        opcode: "setTempo",
        blockType: "command",
        text: m.setTempo,
        arguments: { TEMPO: { type: "number", defaultValue: 60 } },
      },
      {
        opcode: "changeTempo",
        blockType: "command",
        text: m.changeTempo,
        arguments: { TEMPO: { type: "number", defaultValue: 20 } },
      },
      { opcode: "getTempo", blockType: "reporter", text: m.getTempo },
    ],
    menus: {
      DRUM: { acceptReporters: true, items: buildMenu(drumNames) },
      INSTRUMENT: { acceptReporters: true, items: buildMenu(instNames) },
    },
  };
}
