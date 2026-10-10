const path = require('path');
const ref = process.argv[2];
const out = process.argv[3];
const Cast = require(path.join(ref, 'src/util/cast.js'));
const MathUtil = require(path.join(ref, 'src/util/math-util.js'));
const Ops = require(path.join(ref, 'src/blocks/scratch3_operators.js'));
const ops = new Ops({});
function enc(v) {
  if (v === undefined) return {$: 'undefined'};
  if (typeof v === 'number') {
    if (Number.isNaN(v)) return {$: 'NaN'};
    if (v === Infinity) return {$: 'Infinity'};
    if (v === -Infinity) return {$: '-Infinity'};
    if (Object.is(v, -0)) return {$: '-0'};
  }
  if (Array.isArray(v)) return v.map(enc);
  return v;
}
const values = [
  '', ' ', '  \t\n', '0', '-0', '0.0', '1', '-1', '1.5', '.5', '5.', '1e3', '1E3', '1e-7', '1e400',
  '0x1A', '0X1a', '0b101', '0o17', '0x', ' 12 ', '12abc', 'abc', 'ABC', 'Abc', 'false', 'FALSE', 'False', 'true',
  'Infinity', '-Infinity', 'infinity', 'NaN', 'nan', '+5', '- 5', '1,5', '١٢', '\u00a05\u00a0', '#ff0000', '#F00', '#abz',
  '10', '9', '100', 'a', 'b', 'B', 'apple', 'Apple', 'é', 'E',
  0, -0, 1, -1, 0.1, 0.2, 0.30000000000000004, 1.5, -1.5, 2.5, -2.5, 123, 1e21, 1e-7, 255, 16777215, 4294967295,
  NaN, Infinity, -Infinity, true, false, null, undefined
];
const lengths = [0, 1, 3, 10];
const rows = [];
for (const v of values) {
  const r = {in: enc(v)};
  r.toNumber = enc(Cast.toNumber(v));
  r.toBoolean = Cast.toBoolean(v);
  r.toString = Cast.toString(v);
  r.isWhiteSpace = Cast.isWhiteSpace(v);
  r.isInt = Cast.isInt(v);
  r.rgb = enc(Cast.toRgbColorList(v));
  r.round = enc(ops.round({NUM: v}));
  r.length = ops.length({STRING: v});
  r.not = ops.not({OPERAND: v});
  r.mathop = {};
  for (const m of ['abs','floor','ceiling','sqrt','sin','cos','tan','asin','acos','atan','ln','log','e ^','10 ^','ABS','bogus']) {
    r.mathop[m] = enc(ops.mathop({OPERATOR: m, NUM: v}));
  }
  r.listIndex = lengths.map(len => [enc(Cast.toListIndex(v, len, true)), enc(Cast.toListIndex(v, len, false))]);
  rows.push(r);
}
const pairValues = values;
const pairs = [];
for (const a of pairValues) for (const b of pairValues) {
  const c = Cast.compare(a, b);
  pairs.push([enc(a), enc(b), c < 0 ? -1 : c > 0 ? 1 : (c === 0 ? 0 : 'NaN')]);
}
const arithValues = ['', ' ', '0', '1', '-1', '1.5', '0x10', 'abc', '7', '-7', '3', '-3', 0, 1, -1, 7, -7, 3, -3, 0.5, 2.5, Infinity, -Infinity, NaN, true, false, '1e3', 5.5, -5.5];
const arith = [];
for (const a of arithValues) for (const b of arithValues) {
  arith.push({a: enc(a), b: enc(b),
    add: enc(ops.add({NUM1: a, NUM2: b})), sub: enc(ops.subtract({NUM1: a, NUM2: b})),
    mul: enc(ops.multiply({NUM1: a, NUM2: b})), div: enc(ops.divide({NUM1: a, NUM2: b})),
    mod: enc(ops.mod({NUM1: a, NUM2: b})), join: ops.join({STRING1: a, STRING2: b}),
    contains: ops.contains({STRING1: a, STRING2: b}), letterOf: ops.letterOf({LETTER: a, STRING: 'Hello'}),
    letterOfB: ops.letterOf({LETTER: b, STRING: a}),
    and: ops.and({OPERAND1: a, OPERAND2: b}), or: ops.or({OPERAND1: a, OPERAND2: b})});
}
const tan = [];
for (let d = -720; d <= 720; d += 15) tan.push([d, enc(MathUtil.tan(d))]);
for (const d of [0.5, 89.9999, 90.0000001, -90, 450, -450, 1e10, NaN]) tan.push([enc(d), enc(MathUtil.tan(d))]);
require('fs').writeFileSync(out, JSON.stringify({source: 'scratch-vm 4.8.102 (BSD-3) _reference/bsd3-local', rows, pairs, arith, tan}));
console.log(rows.length, pairs.length, arith.length, tan.length);
