/** Pembantu korpus: membuat ParityCase dari skrip DSL, deklarasi otomatis variabel/list/broadcast. */
import type { Arg, BNode } from "../block-builder";
import { b, buildBlocks, flag, setVar, TRUE, FALSE } from "../block-builder";
import type { ParityAction, ParityCase, ParityCategory } from "../case-types";
import type { SB3Json, SB3Value, SpriteSpec, StageSpec } from "../fixtures";
import { makeProject } from "../fixtures";

export interface SpriteDef extends Omit<SpriteSpec, "blocks"> {
  scripts: BNode[][];
}

export interface StageDef extends Omit<StageSpec, "blocks"> {
  scripts?: BNode[][];
}

export interface CaseDef {
  id: string;
  category: ParityCategory;
  title: string;
  sprites: SpriteDef[];
  stage?: StageDef;
  frames: number;
  focus: string[];
  seed?: number;
  actions?: ParityAction[];
  greenFlag?: boolean;
}

type Json = Record<string, unknown>;

/** Kumpulkan referensi [nama, id] untuk VARIABLE/LIST/BROADCAST_OPTION dan primitif [11|12|13]. */
function collectRefs(blocks: Json, out: { var: Map<string, string>; list: Map<string, string>; bc: Map<string, string> }): void {
  const kindOf: Record<number, "var" | "list" | "bc"> = { 11: "bc", 12: "var", 13: "list" };
  const fromPrim = (p: unknown): void => {
    if (!Array.isArray(p) || typeof p[0] !== "number") return;
    const k = kindOf[p[0]];
    if (k) out[k].set(String(p[2]), String(p[1]));
  };
  for (const raw of Object.values(blocks)) {
    if (Array.isArray(raw)) {
      fromPrim(raw);
      continue;
    }
    const blk = raw as { fields?: Json; inputs?: Json };
    for (const [name, f] of Object.entries(blk.fields ?? {})) {
      if (!Array.isArray(f) || f[1] === null || f[1] === undefined) continue;
      const k = name === "VARIABLE" ? "var" : name === "LIST" ? "list" : name === "BROADCAST_OPTION" ? "bc" : null;
      if (k) out[k].set(String(f[1]), String(f[0]));
    }
    for (const inp of Object.values(blk.inputs ?? {})) {
      if (Array.isArray(inp)) inp.slice(1).forEach(fromPrim);
    }
  }
}

/** Variabel/list yang direferensikan tetapi belum dideklarasikan -> global (stage). */
export function autoDeclare(project: SB3Json): SB3Json {
  const refs = { var: new Map<string, string>(), list: new Map<string, string>(), bc: new Map<string, string>() };
  const declared = new Set<string>();
  for (const t of project.targets) {
    collectRefs((t.blocks as Json) ?? {}, refs);
    for (const key of ["variables", "lists", "broadcasts"]) for (const id of Object.keys((t[key] as Json) ?? {})) declared.add(id);
  }
  const stage = project.targets[0];
  if (!stage) return project;
  const vars = (stage.variables as Record<string, [string, SB3Value]>) ?? {};
  const lists = (stage.lists as Record<string, [string, SB3Value[]]>) ?? {};
  const bcs = (stage.broadcasts as Record<string, string>) ?? {};
  for (const [id, name] of refs.var) if (!declared.has(id)) vars[id] = [name, 0];
  for (const [id, name] of refs.list) if (!declared.has(id)) lists[id] = [name, []];
  for (const [id, name] of refs.bc) if (!declared.has(id)) bcs[id] = name;
  stage.variables = vars;
  stage.lists = lists;
  stage.broadcasts = bcs;
  return project;
}

export function mkCase(def: CaseDef): ParityCase {
  const sprites: SpriteSpec[] = def.sprites.map((s, i) => {
    const { scripts, ...rest } = s;
    return { ...rest, blocks: buildBlocks(scripts, `s${i}_`) };
  });
  const { scripts: stageScripts, ...stageRest } = def.stage ?? {};
  const stage: StageSpec = { ...stageRest, blocks: buildBlocks(stageScripts ?? [], "st_") };
  const c: ParityCase = {
    id: def.id,
    category: def.category,
    title: def.title,
    project: autoDeclare(makeProject(sprites, stage)),
    frames: def.frames,
    focus: def.focus,
  };
  if (def.seed !== undefined) c.seed = def.seed;
  if (def.actions) c.actions = def.actions;
  if (def.greenFlag !== undefined) c.greenFlag = def.greenFlag;
  return c;
}

/**
 * Kasus "probe": satu sprite, when flag clicked -> set r0..rN ke tiap ekspresi.
 * Dipakai untuk reporter/boolean (casting & pembulatan).
 */
export function probeCase(
  category: ParityCategory,
  name: string,
  focus: string[],
  exprs: Arg[],
  extra: Partial<Omit<CaseDef, "id" | "category" | "title" | "focus">> = {},
): ParityCase {
  const variables: Record<string, [string, SB3Value]> = {};
  exprs.forEach((_, i) => {
    variables[`var_r${i}`] = [`r${i}`, 0];
  });
  const sprite: SpriteDef = {
    ...(extra.sprites?.[0] ?? {}),
    name: extra.sprites?.[0]?.name ?? "Probe",
    variables: { ...(extra.sprites?.[0]?.variables ?? {}), ...variables },
    scripts: [[flag(), ...exprs.map((e, i) => setVar(`r${i}`, e))], ...(extra.sprites?.[0]?.scripts ?? [])],
  };
  return mkCase({
    frames: 2,
    ...extra,
    id: `${category}/${name}`,
    category,
    title: name,
    focus,
    sprites: [sprite, ...(extra.sprites?.slice(1) ?? [])],
  });
}

/** Nilai uji casting standar (teks literal di field shadow). */
export const CAST_VALUES: readonly (string | number)[] = [
  0, 1, -1, 3.5, "", " ", "abc", "10", " 5 ", "1e3", "Infinity", "-Infinity", "NaN", "0x1A", "0b101", "0o17",
  "1,5", "-0", ".5", "5.", "true", "false", "1e400", "\t7\n",
];

/** Subset lebih kecil untuk perkalian silang. */
export const CROSS_VALUES: readonly (string | number)[] = [0, 7, -2.5, "", "abc", "10", " 5 ", "1e3", "Infinity", "-0", "0x10", "true"];

/** Reporter boolean-ish untuk slot boolean. */
export const BOOL_NODES = (): BNode[] => [
  TRUE(),
  FALSE(),
  b("operator_join", { STRING1: "false", STRING2: "" }),
  b("operator_join", { STRING1: "0", STRING2: "" }),
  b("operator_join", { STRING1: "", STRING2: "" }),
  b("operator_join", { STRING1: "abc", STRING2: "" }),
  b("operator_join", { STRING1: "FALSE", STRING2: "" }),
];

export function cross<T>(xs: readonly T[], ys: readonly T[] = xs): [T, T][] {
  return xs.flatMap((x) => ys.map((y): [T, T] => [x, y]));
}
