// @vitest-environment jsdom
/**
 * Paritas renderer vs scratch-blocks ASLI. Fixture __fixtures__/scratch-blocks-oracle.json dihasilkan
 * dengan merender XML yang sama memakai scratch-blocks 1.1.x (dist/vertical.js) di jsdom, di mana lebar
 * teks jatuh ke fallback Blockly.Field.getCachedWidth = panjang * 8. Isinya: 105 blok toolbox default
 * scratch-blocks + 33 kasus khusus (bersarang, C/E, define/call, stop, variabel, ekstensi), en & id.
 * Dibandingkan: width, height, path `d`, getHeightWidth, posisi setiap anak.
 * Blok demo `extension_*` (blocks_vertical/extensions.js: wedo/microbit/music contoh) dilewati karena
 * bukan blok Scratch nyata; ekstensi diuji lewat kasus x_pen_* / x_music_* hasil convertExtension.
 */
import { describe, expect, it } from "vitest";
import { BlockRegistry } from "../blocks/registry";
import type { ScratchBlockJson } from "../blocks/json-types";
import { layoutRenderBlock, type BlockLayout, type RenderBlock, type TextMeasurer } from "./index";
import fixture from "./__fixtures__/scratch-blocks-oracle.json";

interface OracleBlock {
  opcode: string;
  width: number;
  height: number;
  path: string;
  stackHeight: number;
  stackWidth: number;
  children: { x: number; y: number; block: OracleBlock }[];
}

const data = fixture as unknown as {
  extDefs: Record<string, ScratchBlockJson>;
  cases: Record<string, string>;
  results: Record<string, OracleBlock | { error: string }>;
};

const m8: TextMeasurer = { measure: (t) => t.length * 8 };

const registry = new BlockRegistry();
for (const [opcode, json] of Object.entries(data.extDefs)) registry.register(opcode, json);

/** <block>/<shadow> XML scratch-blocks -> RenderBlock (blok nyata menutupi shadow). */
function xmlToRenderBlock(el: Element): RenderBlock {
  const rb: RenderBlock = { opcode: el.getAttribute("type") ?? "", shadow: el.tagName.toLowerCase() === "shadow" };
  const fields: Record<string, string> = {};
  const inputs: Record<string, RenderBlock | null> = {};
  for (const child of Array.from(el.children)) {
    const tag = child.tagName.toLowerCase();
    if (tag === "field") fields[child.getAttribute("name") ?? ""] = child.textContent ?? "";
    else if (tag === "mutation") {
      const m: Record<string, string> = {};
      for (const a of Array.from(child.attributes)) m[a.name] = a.value;
      rb.mutation = m;
    } else if (tag === "value" || tag === "statement") {
      const kids = Array.from(child.children);
      const real = kids.find((k) => k.tagName.toLowerCase() === "block");
      const shadow = kids.find((k) => k.tagName.toLowerCase() === "shadow");
      const pick = real ?? shadow;
      inputs[child.getAttribute("name") ?? ""] = pick ? xmlToRenderBlock(pick) : null;
    } else if (tag === "next") {
      const nb = child.children[0];
      if (nb) rb.next = xmlToRenderBlock(nb);
    }
  }
  rb.fields = fields;
  rb.inputs = inputs;
  return rb;
}

const r3 = (n: number): number => Math.round(n * 1000) / 1000;
const normPath = (p: string): string => p.replace(/-?\d+\.\d+/g, (s) => String(r3(Number(s))));

interface Flat {
  key: string;
  width: number;
  height: number;
  path: string;
  stackHeight: number;
  stackWidth: number;
}

function flattenOracle(b: OracleBlock, x: number, y: number, out: Flat[]): Flat[] {
  out.push({ key: `${b.opcode}@${r3(x)},${r3(y)}`, width: r3(b.width), height: b.height, path: normPath(b.path), stackHeight: b.stackHeight, stackWidth: r3(b.stackWidth) });
  for (const c of b.children) flattenOracle(c.block, x + c.x, y + c.y, out);
  return out;
}

function flattenOurs(l: BlockLayout, x: number, y: number, out: Flat[]): Flat[] {
  out.push({ key: `${l.block.opcode}@${r3(x)},${r3(y)}`, width: r3(l.width), height: l.height, path: normPath(l.path), stackHeight: l.stackHeight, stackWidth: r3(l.stackWidth) });
  for (const c of l.children) flattenOurs(c.layout, x + c.x, y + c.y, out);
  return out;
}

const byKey = (a: Flat, b: Flat): number => a.key.localeCompare(b.key);

describe("paritas render vs scratch-blocks asli", () => {
  const parser = new DOMParser();
  const entries = Object.entries(data.results);

  it("fixture memuat semua kasus kedua bahasa", () => {
    expect(entries.length).toBe(Object.keys(data.cases).length * 2);
    expect(entries.filter(([, r]) => "error" in r)).toEqual([]);
  });

  for (const [name, result] of entries) {
    if ("error" in result || result.opcode.startsWith("extension_")) continue;
    const [locale, caseName] = name.split(":") as ["en" | "id", string];
    it(name, () => {
      const xml = data.cases[caseName] ?? "";
      const doc = parser.parseFromString(xml, "text/xml");
      const root = doc.documentElement;
      const layout = layoutRenderBlock(xmlToRenderBlock(root), { registry, locale, measurer: m8 });
      const ours = flattenOurs(layout, 0, 0, []).sort(byKey);
      const theirs = flattenOracle(result, 0, 0, []).sort(byKey);
      expect(ours).toEqual(theirs);
    });
  }
});
