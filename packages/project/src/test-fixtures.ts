/** Fixture project.json buatan sendiri untuk tes paket project (bukan kode produksi). */
import JSZip from "jszip";
import { md5Hex } from "./md5";
import type { SB3BlockEntry, SB3Project } from "./sb3-types";

type Mutable = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const SVG_STAGE = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><rect width="480" height="360" fill="#fff"/></svg>';
export const SVG_SPRITE = '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="100" viewBox="0 0 96 100"><circle cx="48" cy="50" r="40"/></svg>';
/** WAV PCM 8-bit mono 4 sampel. */
export const WAV_BYTES = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x28, 0, 0, 0, 0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20, 16, 0, 0, 0, 1, 0, 1, 0, 0x40,
  0x1f, 0, 0, 0x40, 0x1f, 0, 0, 1, 0, 8, 0, 0x64, 0x61, 0x74, 0x61, 4, 0, 0, 0, 128, 129, 130, 131,
]);

export const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

export const STAGE_MD5 = md5Hex(enc(SVG_STAGE));
export const SPRITE_MD5 = md5Hex(enc(SVG_SPRITE));
export const SOUND_MD5 = md5Hex(WAV_BYTES);

/**
 * Project lengkap: variabel lokal/global, list, broadcast, cloud, komentar, procedure + argumen,
 * input bayangan tertutup, primitif top-level, monitor.
 */
export function sampleProject(): SB3Project {
  return {
    targets: [
      {
        isStage: true,
        name: "Stage",
        variables: { "var-global": ["skor", 0], "var-cloud": ["☁ awan", 5, true] },
        lists: { "list-1": ["daftar", ["a", 1, true]] },
        broadcasts: { "bc-1": "mulai" },
        blocks: {
          stageHat: {
            opcode: "event_whenflagclicked",
            next: "bcast",
            parent: null,
            inputs: {},
            fields: {},
            shadow: false,
            topLevel: true,
            x: 10,
            y: 20,
          },
          bcast: {
            opcode: "event_broadcast",
            next: null,
            parent: "stageHat",
            inputs: { BROADCAST_INPUT: [1, [11, "mulai", "bc-1"]] },
            fields: {},
            shadow: false,
            topLevel: false,
          },
          topVar: [12, "skor", "var-global", 300, 40],
        },
        comments: {
          c1: { blockId: null, x: 5, y: 6, width: 200, height: 100, minimized: false, text: "catatan" },
        },
        currentCostume: 0,
        costumes: [
          {
            name: "latar1",
            bitmapResolution: 1,
            dataFormat: "svg",
            assetId: STAGE_MD5,
            md5ext: `${STAGE_MD5}.svg`,
            rotationCenterX: 240,
            rotationCenterY: 180,
          },
        ],
        sounds: [],
        volume: 100,
        layerOrder: 0,
        tempo: 60,
        videoTransparency: 50,
        videoState: "on",
        textToSpeechLanguage: null,
      },
      {
        isStage: false,
        name: "Kody",
        variables: { "var-local": ["kecepatan", "10"] },
        lists: {},
        broadcasts: {},
        blocks: {
          hat: {
            opcode: "event_whenflagclicked",
            next: "move",
            parent: null,
            inputs: {},
            fields: {},
            shadow: false,
            topLevel: true,
            x: 0,
            y: 0,
          },
          move: {
            opcode: "motion_movesteps",
            next: "callProc",
            parent: "hat",
            inputs: { STEPS: [3, [12, "kecepatan", "var-local"], [4, "10"]] },
            fields: {},
            shadow: false,
            topLevel: false,
          },
          callProc: {
            opcode: "procedures_call",
            next: null,
            parent: "move",
            inputs: { argA: [1, [10, "halo"]] },
            fields: {},
            shadow: false,
            topLevel: false,
            mutation: {
              tagName: "mutation",
              children: [],
              proccode: "sapa %s",
              argumentids: '["argA"]',
              warp: "false",
            },
          },
          def: {
            opcode: "procedures_definition",
            next: "say",
            parent: null,
            inputs: { custom_block: [1, "proto"] },
            fields: {},
            shadow: false,
            topLevel: true,
            x: 400,
            y: 0,
          },
          proto: {
            opcode: "procedures_prototype",
            next: null,
            parent: "def",
            inputs: { argA: [1, "argRep"] },
            fields: {},
            shadow: true,
            topLevel: false,
            mutation: {
              tagName: "mutation",
              children: [],
              proccode: "sapa %s",
              argumentids: '["argA"]',
              argumentnames: '["teks"]',
              argumentdefaults: '[""]',
              warp: "false",
            },
          },
          argRep: {
            opcode: "argument_reporter_string_number",
            next: null,
            parent: "proto",
            inputs: {},
            fields: { VALUE: ["teks"] },
            shadow: true,
            topLevel: false,
          },
          say: {
            opcode: "looks_say",
            next: null,
            parent: "def",
            inputs: { MESSAGE: [3, "argUse", [10, "Halo!"]] },
            fields: {},
            shadow: false,
            topLevel: false,
            comment: "c2",
          },
          argUse: {
            opcode: "argument_reporter_string_number",
            next: null,
            parent: "say",
            inputs: {},
            fields: { VALUE: ["teks"] },
            shadow: false,
            topLevel: false,
          },
        },
        comments: {
          c2: { blockId: "say", x: 600, y: 10, width: 150, height: 80, minimized: true, text: "bicara" },
        },
        currentCostume: 0,
        costumes: [
          {
            name: "kostum1",
            bitmapResolution: 1,
            dataFormat: "svg",
            assetId: SPRITE_MD5,
            md5ext: `${SPRITE_MD5}.svg`,
            rotationCenterX: 48,
            rotationCenterY: 50,
          },
        ],
        sounds: [
          {
            name: "pop",
            assetId: SOUND_MD5,
            dataFormat: "wav",
            rate: 8000,
            sampleCount: 4,
            md5ext: `${SOUND_MD5}.wav`,
          },
        ],
        volume: 80,
        layerOrder: 1,
        visible: true,
        x: 12,
        y: -34,
        size: 100,
        direction: 90,
        draggable: false,
        rotationStyle: "all around",
      },
    ],
    monitors: [
      {
        id: "var-global",
        mode: "default",
        opcode: "data_variable",
        params: { VARIABLE: "skor" },
        spriteName: null,
        value: 0,
        width: 0,
        height: 0,
        x: 5,
        y: 5,
        visible: true,
        sliderMin: 0,
        sliderMax: 100,
        isDiscrete: true,
      },
      {
        id: "list-1",
        mode: "list",
        opcode: "data_listcontents",
        params: { LIST: "daftar" },
        spriteName: null,
        value: ["a", 1, true],
        width: 100,
        height: 200,
        x: 5,
        y: 40,
        visible: false,
      },
      {
        id: "ignored_xposition",
        mode: "default",
        opcode: "motion_xposition",
        params: {},
        spriteName: "Kody",
        value: 12,
        width: 0,
        height: 0,
        x: 5,
        y: 300,
        visible: true,
        sliderMin: 0,
        sliderMax: 100,
        isDiscrete: true,
      },
    ],
    extensions: [],
    meta: { semver: "3.0.0", vm: "4.8.102", agent: "test" },
  };
}

/** Zip .sb3 dari project.json + asset fixture. */
export async function zipProject(
  project: unknown,
  extra: Record<string, Uint8Array | string> = {},
  withAssets = true,
): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("project.json", typeof project === "string" ? project : JSON.stringify(project));
  if (withAssets) {
    zip.file(`${STAGE_MD5}.svg`, SVG_STAGE);
    zip.file(`${SPRITE_MD5}.svg`, SVG_SPRITE);
    zip.file(`${SOUND_MD5}.wav`, WAV_BYTES);
  }
  for (const [name, data] of Object.entries(extra)) zip.file(name, data);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

/** Pembuat id deterministik untuk tes. */
export function seqIds(prefix = "id"): () => string {
  let n = 0;
  return () => `${prefix}${++n}`;
}

/** Kunci primitif top-level berganti id saat dimuat (sama seperti scratch-vm) -> bandingkan nilainya. */
export function normalizeProject(p: SB3Project): unknown {
  const copy = structuredClone(p) as Mutable;
  for (const t of copy.targets) {
    const blocks: Record<string, SB3BlockEntry> = {};
    const prims: SB3BlockEntry[] = [];
    for (const [id, b] of Object.entries(t.blocks as Record<string, SB3BlockEntry>)) {
      if (Array.isArray(b)) prims.push(b);
      else blocks[id] = b;
    }
    t.blocks = blocks;
    t.topLevelPrimitives = prims.map((x) => JSON.stringify(x)).sort();
  }
  copy.monitors = copy.monitors.map((m: Mutable) => (m.opcode.startsWith("motion_") ? { ...m, id: "<sprite>" } : m));
  delete copy.meta;
  return copy;
}

