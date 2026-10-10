// Pembuat fixture oracle Pen. Menjalankan scratch3_pen ASLI dari _reference/bsd3-local (BSD-3)
// dengan stub dependensi UI, lalu menyimpan state pena setelah tiap operasi.
// Pakai: node gen-pen-oracle.cjs <path scratch-vm bsd3-local> <out.json>
const path = require('path');
const fs = require('fs');
const Module = require('module');
const ref = process.argv[2];
const out = process.argv[3];
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'format-message') return (opts) => opts.default;
  if (request.endsWith('util/log')) return {warn () {}, log () {}, error () {}};
  if (request.endsWith('sprites/rendered-target')) return {EVENT_TARGET_MOVED: 'TARGET_MOVED'};
  return origLoad.apply(this, arguments);
};
const Pen = require(path.join(ref, 'src/extensions/scratch3_pen/index.js'));
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
const C = (v) => ['setPenColorToColor', {COLOR: v}];
const P = (op, param, value) => [op, {COLOR_PARAM: param, VALUE: value}];
const cases = {
  defaults: [['penUp', {}]],
  setColorHex: [C('#ff0000'), C('#00ff00'), C('#0000ff'), C('#123456'), C('#fff'), C('#000000'), C('#808080')],
  setColorDecimal: [C(0), C(16711680), C(-16777216), C(0x80ff0000), C(0x01ffffff), C('16777215'), C('abc'), C(true), C(NaN)],
  colorParamWrap: [
    P('changePenColorParamBy', 'color', 10), P('changePenColorParamBy', 'color', 50), P('changePenColorParamBy', 'color', -200),
    P('setPenColorParamTo', 'color', 100), P('setPenColorParamTo', 'color', 100.5), P('setPenColorParamTo', 'color', 101),
    P('setPenColorParamTo', 'color', -0.5), P('setPenColorParamTo', 'color', '1e3'), P('setPenColorParamTo', 'color', 'x'),
    P('setPenColorParamTo', 'color', -1), P('changePenColorParamBy', 'color', 12345.678)
  ],
  colorParamClamp: [
    P('setPenColorParamTo', 'saturation', 150), P('changePenColorParamBy', 'saturation', -30), P('setPenColorParamTo', 'saturation', -5),
    P('setPenColorParamTo', 'brightness', 42.5), P('changePenColorParamBy', 'brightness', 100), P('changePenColorParamBy', 'brightness', -250),
    P('setPenColorParamTo', 'transparency', 50), P('changePenColorParamBy', 'transparency', 70), P('setPenColorParamTo', 'transparency', '-3'),
    P('setPenColorParamTo', 'brightness', 60), P('setPenColorParamTo', 'saturation', 37)
  ],
  colorParamUnknown: [P('setPenColorParamTo', 'COLOR', 20), P('setPenColorParamTo', 'hue', 20), P('changePenColorParamBy', '', 5), P('setPenColorParamTo', 0, 3)],
  size: [
    ['changePenSizeBy', {SIZE: 5}], ['changePenSizeBy', {SIZE: -100}], ['setPenSizeTo', {SIZE: 2000}], ['setPenSizeTo', {SIZE: '7.5'}],
    ['setPenSizeTo', {SIZE: 0}], ['setPenSizeTo', {SIZE: 'abc'}], ['changePenSizeBy', {SIZE: 0.25}], ['setPenSizeTo', {SIZE: Infinity}], ['setPenSizeTo', {SIZE: -Infinity}]
  ],
  legacyHue: [
    ['setPenHueToNumber', {HUE: 0}], ['setPenHueToNumber', {HUE: 70}], ['changePenHueBy', {HUE: 30}], ['changePenHueBy', {HUE: -500}],
    ['setPenHueToNumber', {HUE: 'abc'}], ['setPenHueToNumber', {HUE: 199}]
  ],
  legacyShade: [
    ['setPenShadeToNumber', {SHADE: 0}], ['setPenShadeToNumber', {SHADE: 25}], ['setPenShadeToNumber', {SHADE: 75}], ['setPenShadeToNumber', {SHADE: 150}],
    ['setPenShadeToNumber', {SHADE: -30}], ['setPenShadeToNumber', {SHADE: 450}], ['changePenShadeBy', {SHADE: 10}], ['changePenShadeBy', {SHADE: -300}],
    ['setPenShadeToNumber', {SHADE: 'x'}]
  ],
  mixed: [
    C('#3366cc'), ['changePenShadeBy', {SHADE: 20}], P('changePenColorParamBy', 'transparency', 25), ['changePenHueBy', {HUE: 15}],
    P('setPenColorParamTo', 'saturation', 10), ['setPenShadeToNumber', {SHADE: 99.5}], C('#00000000'), C('#ff8800'), ['setPenHueToNumber', {HUE: 33.3}]
  ],
  penDownUp: [['penDown', {}], ['penDown', {}], ['penUp', {}], ['penUp', {}]]
};
const rows = {};
for (const [name, ops] of Object.entries(cases)) {
  const runtime = {on () {}, renderer: null, requestRedraw () {}};
  const pen = new Pen(runtime);
  const state = {};
  const target = {
    x: 0, y: 0,
    getCustomState: k => state[k],
    setCustomState: (k, v) => { state[k] = v; },
    addListener () {}, removeListener () {}
  };
  const util = {target};
  rows[name] = ops.map(([op, args]) => {
    pen[op](args, util);
    return {op, args: enc(args), state: enc(pen._getPenState(target))};
  });
}
const info = new Pen({on () {}, renderer: null}).getInfo();
fs.writeFileSync(out, JSON.stringify({cases: rows, info}));
console.log('wrote', out);
