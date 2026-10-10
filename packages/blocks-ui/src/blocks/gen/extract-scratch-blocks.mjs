#!/usr/bin/env node
/**
 * Generator: membaca definisi blok scratch-blocks 1.1.206 (Apache-2.0) dari
 * _reference/bsd3-local SEBAGAI DATA (dievaluasi di sandbox `vm` dengan Blockly palsu),
 * lalu menulis tabel TypeScript murni ke ../generated/. Kode produksi TIDAK mengimpor
 * scratch-blocks; hanya hasil data ini yang dipakai.
 *
 * Pemakaian:  node packages/blocks-ui/src/blocks/gen/extract-scratch-blocks.mjs [path scratch-blocks]
 *
 * Pesan (Blockly.Msg) diganti token "%{BKY_KEY}" sehingga satu definisi melayani semua bahasa;
 * tabel pesan en (msg/messages.js) dan id (msg/scratch_msgs.js) ditulis terpisah.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "generated");
const sbRoot =
  process.argv[2] ??
  join(here, "..", "..", "..", "..", "..", "..", "_reference", "bsd3-local", "scratch-blocks");

const read = (p) => readFileSync(join(sbRoot, p), "utf8");

// ---------- 1. Blockly palsu ----------
const msgProxy = new Proxy({}, { get: (_t, key) => (typeof key === "string" ? `%{BKY_${key}}` : undefined) });
const ctx = {
  console,
  goog: {
    provide() {},
    require() {},
    isObject: (o) => typeof o === "object" && o !== null,
    string: { startsWith: (s, p) => String(s).startsWith(p) },
  },
};
ctx.Blockly = {
  Blocks: {},
  Msg: msgProxy,
  Constants: { Data: {} },
  ScratchBlocks: { VerticalExtensions: {}, ProcedureUtils: {} },
  Extensions: { register() {}, registerMixin() {}, registerMutator() {}, apply() {} },
  mainWorkspace: { options: { pathToMedia: "media/" } },
  BROADCAST_MESSAGE_VARIABLE_TYPE: "broadcast_msg",
  LIST_VARIABLE_TYPE: "list",
  SCALAR_VARIABLE_TYPE: "",
  OUTPUT_SHAPE_HEXAGONAL: 1,
  OUTPUT_SHAPE_ROUND: 2,
  OUTPUT_SHAPE_SQUARE: 3,
  ALIGN_LEFT: -1,
  ALIGN_CENTRE: 0,
  ALIGN_RIGHT: 1,
  Categories: {
    motion: "motion",
    looks: "looks",
    sound: "sounds",
    pen: "pen",
    data: "data",
    dataLists: "data-lists",
    event: "events",
    control: "control",
    sensing: "sensing",
    operators: "operators",
    more: "more",
  },
  Colours: {},
  utils: { genUid: () => "uid" },
  Procedures: {},
  Variables: {},
  Events: {},
  FieldDropdown: function () {},
  Field: { register() {} },
};
vm.createContext(ctx);
vm.runInContext(read("core/colours.js"), ctx, { filename: "colours.js" });

const files = [
  ...readdirSync(join(sbRoot, "blocks_common")).map((f) => "blocks_common/" + f),
  ...readdirSync(join(sbRoot, "blocks_vertical"))
    .filter((f) => !["default_toolbox.js", "extensions.js"].includes(f))
    .map((f) => "blocks_vertical/" + f),
];
for (const f of files) {
  try {
    vm.runInContext(read(f), ctx, { filename: f });
  } catch (e) {
    console.warn(`peringatan: ${f}: ${e.message}`);
  }
}

// ---------- 2. Jalankan init() setiap blok dengan block palsu ----------
const defs = {};
const problems = [];
for (const [type, proto] of Object.entries(ctx.Blockly.Blocks)) {
  const jsons = [];
  const calls = [];
  const target = {};
  const fake = new Proxy(target, {
    get(t, p) {
      if (p === "jsonInit") return (j) => jsons.push(JSON.parse(JSON.stringify(j)));
      if (p in t) return t[p];
      if (typeof p !== "string") return undefined;
      return (...args) => {
        calls.push([p, ...args.map((a) => (typeof a === "function" ? "<fn>" : a))]);
        return fake;
      };
    },
    set(t, p, v) {
      t[p] = v;
      return true;
    },
  });
  try {
    proto.init.call(fake);
  } catch (e) {
    problems.push(`${type}: init melempar ${e.message}`);
  }
  if (jsons.length !== 1) problems.push(`${type}: jsonInit dipanggil ${jsons.length}x`);
  const json = Object.assign({}, ...jsons);
  // Opsi dropdown bernilai fungsi (mis. demo "call a function" di sound_sounds_menu) tidak serial.
  for (let n = 0; Array.isArray(json[`args${n}`]) || typeof json[`message${n}`] === "string"; n++) {
    for (const a of json[`args${n}`] ?? []) {
      if (Array.isArray(a.options)) a.options = a.options.filter((o) => typeof o[1] === "string");
    }
  }
  delete json.type;
  delete json.tooltip;
  delete json.helpUrl;
  if (calls.length) {
    problems.push(`${type}: init kustom (${calls.map((c) => c[0]).join(",")}) - didefinisikan manual di overrides.ts`);
    continue;
  }
  defs[type] = json;
}

// ---------- 3. Pesan en & id ----------
const enCtx = { goog: ctx.goog, Blockly: { Msg: {} } };
vm.createContext(enCtx);
vm.runInContext(read("msg/messages.js"), enCtx);
const en = { ...enCtx.Blockly.Msg };

const allCtx = { goog: ctx.goog, Blockly: { ScratchMsgs: { locales: {} } } };
vm.createContext(allCtx);
vm.runInContext(read("msg/scratch_msgs.js"), allCtx);
const id = allCtx.Blockly.ScratchMsgs.locales.id;
if (!id) throw new Error("locale id tidak ditemukan di scratch_msgs.js");

// ---------- 4. Media yang dirujuk ----------
const mediaRefs = new Set();
JSON.stringify(defs, (k, v) => {
  if (typeof v === "string" && v.startsWith("media/")) mediaRefs.add(v);
  return v;
});
for (const extra of ["media/dropdown-arrow.svg", "media/dropdown-arrow-dark.svg"]) mediaRefs.add(extra);
const media = {};
for (const ref of [...mediaRefs].sort()) {
  const svg = read(ref);
  media[ref] = "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
}

// ---------- 5. Tulis ----------
const header = (what) =>
  `/**\n * DIHASILKAN OTOMATIS oleh gen/extract-scratch-blocks.mjs - jangan diedit manual.\n` +
  ` * ${what}\n * Sumber: scratch-blocks 1.1.206 (Apache-2.0, (c) Google Inc. & MIT Scratch Team),\n` +
  ` * _reference/bsd3-local/scratch-blocks. Lihat THIRD_PARTY.md.\n */\n/* eslint-disable */\n`;

const compact = (obj) => {
  const lines = Object.entries(obj)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
  return `{\n${lines.join("\n")}\n}`;
};
writeFileSync(
  join(outDir, "scratch-blocks-json.ts"),
  header("Definisi JSON blok (jsonInit) blocks_vertical + blocks_common, pesan sebagai token %{BKY_*}.") +
    `import type { ScratchBlockJson } from "../json-types";\n\n` +
    `export const SCRATCH_BLOCKS_JSON: Record<string, ScratchBlockJson> = ${compact(defs)};\n`,
);

// Hanya kunci yang dipakai blok + kunci kategori/menu yang berguna untuk editor.
const usedKeys = new Set();
JSON.stringify(defs, (k, v) => {
  if (typeof v === "string") for (const m of v.matchAll(/%\{BKY_([A-Z0-9_]+)\}/g)) usedKeys.add(m[1]);
  return v;
});
for (const k of Object.keys(en)) {
  if (/^(CATEGORY_|NEW_|PROCEDURES_|DATA_|DELETE|DUPLICATE|ADD_COMMENT|CLEAN_UP|UNDO|REDO|RENAME|VARIABLE|LIST_|MOTION_|LOOKS_|SOUND_|SENSING_|EVENT_|CONTROL_|OPERATORS_)/.test(k)) usedKeys.add(k);
}
const pick = (table) =>
  Object.fromEntries([...usedKeys].sort().filter((k) => typeof table[k] === "string").map((k) => [k, table[k]]));
writeFileSync(
  join(outDir, "messages-en.ts"),
  header("Pesan bahasa Inggris (msg/messages.js).") +
    `export const MESSAGES_EN: Record<string, string> = ${compact(pick(en))};\n`,
);
writeFileSync(
  join(outDir, "messages-id.ts"),
  header("Terjemahan resmi Scratch bahasa Indonesia (msg/scratch_msgs.js locale \"id\").") +
    `export const MESSAGES_ID: Record<string, string> = ${compact(pick(id))};\n`,
);
writeFileSync(
  join(outDir, "media.ts"),
  header("Ikon blok (media/*.svg) sebagai data URI.") +
    `export const BLOCK_MEDIA: Record<string, string> = ${compact(media)};\n`,
);

console.log(`blok: ${Object.keys(defs).length}, pesan en: ${Object.keys(pick(en)).length}, id: ${Object.keys(pick(id)).length}, media: ${Object.keys(media).length}`);
if (problems.length) console.log("catatan:\n  " + problems.join("\n  "));
