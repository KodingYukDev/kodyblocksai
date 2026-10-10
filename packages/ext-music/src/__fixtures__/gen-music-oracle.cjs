// Pembuat fixture oracle Music. Menjalankan scratch3_music ASLI dari _reference/bsd3-local (BSD-3)
// tanpa audio; _playDrumNum/_playNote/_startStackTimer disadap untuk mencatat nilai yang dihitung.
// Pakai: node gen-music-oracle.cjs <path scratch-vm bsd3-local> <out.json>
const path = require('path');
const fs = require('fs');
const Module = require('module');
const ref = process.argv[2];
const out = process.argv[3];
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'format-message') return (opts) => opts.default;
  if (request === './manifest') throw new Error('no manifest');
  return origLoad.apply(this, arguments);
};
const Music = require(path.join(ref, 'src/extensions/scratch3_music/index.js'));
function enc (v) {
  if (typeof v === 'number') {
    if (Number.isNaN(v)) return {$: 'NaN'};
    if (v === Infinity) return {$: 'Infinity'};
    if (v === -Infinity) return {$: '-Infinity'};
    if (Object.is(v, -0)) return {$: '-0'};
  }
  if (Array.isArray(v)) return v.map(enc);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) o[k] = enc(v[k]);
    return o;
  }
  return v;
}
const nums = [1, 2, 18, 19, 0, -1, -17, 1.4, 1.5, 2.5, -0.5, 100, '3', ' 7 ', 'abc', '', true, NaN, Infinity, -Infinity, 1e10, 21, 22];
const beats = [0.25, 0, -1, 1, 100, 101, '2', 'x', 0.5, 1e-9, Infinity];
const tempos = [60, 20, 19, 500, 501, 120.5, -10, 'abc', '200', Infinity, -Infinity, NaN];
const notes = [60, 0, -5, 130, 131, 60.5, '72', 'C', 24, 23, 108, 109, Infinity];
const midiDrums = [35, 36, 34, 81, 82, 60, 49.6, 'x', -1, 1, 0];
const midiInst = [1, 0, 128, 129, -1, 41, 74, 'x', 25.5, 200];

const runtime = {on () {}, audioEngine: null, getTargetForStage: () => stage, getEditingTarget: () => null};
let stage = {tempo: 60};
const music = new Music(runtime);
const rows = {setInstrument: [], midiSetInstrument: [], setTempo: [], changeTempo: [], playDrum: [], midiPlayDrum: [], rest: [], playNote: []};
function mkTarget () {
  const state = {};
  return {volume: 100, sprite: {soundBank: {}}, getCustomState: k => state[k], setCustomState: (k, v) => { state[k] = v; }};
}
for (const n of nums) {
  const target = mkTarget();
  music.setInstrument({INSTRUMENT: n}, {target});
  rows.setInstrument.push({in: enc(n), out: enc(music._getMusicState(target).currentInstrument)});
}
for (const n of midiInst) {
  const target = mkTarget();
  music.midiSetInstrument({INSTRUMENT: n}, {target});
  rows.midiSetInstrument.push({in: enc(n), out: enc(music._getMusicState(target).currentInstrument)});
}
for (const t of tempos) {
  stage = {tempo: 60};
  music.setTempo({TEMPO: t});
  rows.setTempo.push({in: enc(t), out: enc(stage.tempo)});
}
for (const t of tempos) {
  stage = {tempo: 100};
  music.changeTempo({TEMPO: t});
  rows.changeTempo.push({in: enc(t), out: enc(stage.tempo), getTempo: enc(music.getTempo())});
}
let rec = {};
music._playDrumNum = (util, d) => { rec.drum = d; };
music._playNote = (util, note, dur) => { rec.note = note; rec.noteDur = dur; };
music._startStackTimer = (util, dur) => { rec.timer = dur; };
const util = {target: mkTarget(), stackFrame: {}, runtime};
for (const tempo of [60, 137]) {
  for (const d of nums) for (const b of beats) {
    stage = {tempo}; rec = {}; util.stackFrame = {};
    music.playDrumForBeats({DRUM: d, BEATS: b}, util);
    rows.playDrum.push({tempo, drum: enc(d), beats: enc(b), rec: enc(rec)});
  }
  for (const d of midiDrums) {
    stage = {tempo}; rec = {}; util.stackFrame = {};
    music.midiPlayDrumForBeats({DRUM: d, BEATS: 0.5}, util);
    rows.midiPlayDrum.push({tempo, drum: enc(d), rec: enc(rec)});
  }
  for (const b of beats) {
    stage = {tempo}; rec = {}; util.stackFrame = {};
    music.restForBeats({BEATS: b}, util);
    rows.rest.push({tempo, beats: enc(b), rec: enc(rec)});
  }
  for (const n of notes) for (const b of beats) {
    stage = {tempo}; rec = {}; util.stackFrame = {};
    music.playNoteForBeats({NOTE: n, BEATS: b}, util);
    rows.playNote.push({tempo, note: enc(n), beats: enc(b), rec: enc(rec)});
  }
}
rows.selectSample = [];
for (const info of music.INSTRUMENT_INFO) {
  for (const n of [0, 23.9, 24, 35, 36, 47.5, 48, 60, 71, 72, 84, 96, 108, 130]) {
    rows.selectSample.push({samples: info.samples, note: n, out: music._selectSampleIndexForNote(n, info.samples)});
  }
}
rows.info = music.getInfo();
fs.writeFileSync(out, JSON.stringify(rows));
console.log('wrote', out);
