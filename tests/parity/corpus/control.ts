/** Korpus Control: wait, loop, if, stop, clone (urutan layer, batas 300), counter, for each. */
import type { BNode } from "../block-builder";
import { b, changeVar, flag, forever, lf, menu, procCall, procDef, repeat, setVar, varRef, vf, wait } from "../block-builder";
import type { ParityCase } from "../case-types";
import { mkCase } from "./helpers";

const log = (v: string | number | BNode) => b("data_addtolist", { ITEM: v }, { LIST: lf("log") });
const stop = (opt: string, hasnext = false) => b("control_stop", {}, { STOP_OPTION: opt }, { hasnext: String(hasnext) });
const gt = (a: string | number | BNode, c: string | number | BNode) => b("operator_gt", { OPERAND1: a, OPERAND2: c });
const cloneOf = (who: string) => b("control_create_clone_of", { CLONE_OPTION: menu("control_create_clone_of_menu", "CLONE_OPTION", who) });

function single(name: string, focus: string[], scripts: BNode[][], frames: number, extra: { stageScripts?: BNode[][]; seed?: number } = {}): ParityCase {
  const c = mkCase({
    id: `control/${name}`,
    category: "control",
    title: name,
    sprites: [{ name: "Kody", scripts }],
    stage: { scripts: extra.stageScripts ?? [] },
    frames,
    focus,
  });
  if (extra.seed !== undefined) c.seed = extra.seed;
  return c;
}

export function controlCases(): ParityCase[] {
  return [
    single("wait", ["control_wait"], [[flag(), ...[0.1, 0, -1, "abc", 0.05, " 0.2 ", "1e-1"].flatMap((d, i) => [wait(d), log(i)])]], 30),
    single("repeat-counts", ["control_repeat"], [[flag(), ...[3, 2.5, 2.4, -1, "abc", "", "3.5", 0].flatMap((t, i) => [setVar(`c${i}`, 0), repeat(t, [changeVar(`c${i}`, 1)])])]], 3),
    single("repeat-yield", ["control_repeat"], [[flag(), repeat(5, [b("motion_changexby", { DX: 7 })]), log("selesai")], [flag(), repeat(3, [log("tick")])]], 8),
    single("forever", ["control_forever"], [[flag(), forever([b("motion_changeyby", { DY: 4 }), log(b("motion_yposition"))])]], 6),
    single("if-else", ["control_if", "control_if_else"], [[
      flag(),
      ...[b("operator_not"), b("operator_join", { STRING1: "false", STRING2: "" }), b("operator_join", { STRING1: "0", STRING2: "" }), b("operator_join", { STRING1: "x", STRING2: "" })].flatMap((c, i) => [
        b("control_if", { CONDITION: c, SUBSTACK: [log(`if${i}`)] }),
        b("control_if_else", { CONDITION: c, SUBSTACK: [log(`then${i}`)], SUBSTACK2: [log(`else${i}`)] }),
      ]),
      b("control_if", { SUBSTACK: [log("kosong")] }),
      b("control_if_else", { SUBSTACK: [log("kosong-then")], SUBSTACK2: [log("kosong-else")] }),
    ]], 2),
    single("wait-until", ["control_wait_until"], [
      [flag(), b("control_wait_until", { CONDITION: gt(varRef("n"), 5) }), log("lolos")],
      [flag(), setVar("n", 0), forever([changeVar("n", 1), wait(0)])],
    ], 12),
    single("repeat-until-while", ["control_repeat_until", "control_while"], [
      [flag(), setVar("u", 0), b("control_repeat_until", { CONDITION: gt(varRef("u"), 4), SUBSTACK: [changeVar("u", 1), log(varRef("u"))] })],
      [flag(), setVar("w", 0), b("control_while", { CONDITION: b("operator_lt", { OPERAND1: varRef("w"), OPERAND2: 3 }), SUBSTACK: [changeVar("w", 1), b("motion_changexby", { DX: 1 })] })],
    ], 8),
    single("for-each-hidden", ["control_for_each"], [[
      flag(),
      b("control_for_each", { VALUE: 4, SUBSTACK: [log(varRef("i"))] }, { VARIABLE: vf("i") }),
      b("control_for_each", { VALUE: "2.6", SUBSTACK: [log(varRef("i"))] }, { VARIABLE: vf("i") }),
    ]], 6),
    single("stop-this-script", ["control_stop"], [[flag(), log("a"), stop("this script"), log("tidak")], [flag(), wait(0), log("b")]], 3),
    single("stop-other-scripts", ["control_stop"], [
      [flag(), forever([b("motion_changexby", { DX: 1 })])],
      [flag(), wait(0.1), stop("other scripts in sprite", true), log("masih jalan"), forever([b("motion_changeyby", { DY: 1 })])],
    ], 10, { stageScripts: [[flag(), forever([changeVar("stageJalan", 1), wait(0)])]] }),
    single("stop-all", ["control_stop"], [[flag(), wait(0.1), stop("all"), log("tidak")], [flag(), forever([b("motion_changexby", { DX: 2 })])]], 8),
    mkCase({
      id: "control/clones-basic",
      category: "control",
      title: "create clone myself/sprite lain, start as clone, delete this clone, urutan layer",
      sprites: [
        {
          name: "Induk",
          variables: { var_lokal: ["lokal", 1] },
          scripts: [
            [flag(), setVar("lokal", 5), cloneOf("_myself_"), b("motion_changexby", { DX: 30 }), cloneOf("_myself_"), cloneOf("Lain"), cloneOf("TidakAda")],
            [b("control_start_as_clone"), changeVar("lokal", 1), b("motion_changeyby", { DY: 20 }), wait(0.1), b("control_delete_this_clone")],
          ],
        },
        { name: "Lain", x: 100, scripts: [[b("control_start_as_clone"), b("motion_changexby", { DX: -10 })]] },
      ],
      frames: 8,
      focus: ["control_create_clone_of", "control_create_clone_of_menu", "control_start_as_clone", "control_delete_this_clone"],
    }),
    mkCase({
      id: "control/clone-limit",
      category: "control",
      title: "batas 300 clone + delete this clone pada target asli diabaikan",
      sprites: [{
        name: "Banyak",
        scripts: [
          // Warp: redraw dari clone baru tidak menghentikan loop, jadi 320 percobaan selesai dalam 1 frame.
          [flag(), b("control_delete_this_clone"), procCall("banyak", [], []), setVar("selesai", 1), repeat(5, [cloneOf("_myself_")])],
          procDef("banyak", [], true, [repeat(320, [cloneOf("_myself_")])]),
          [b("control_start_as_clone"), changeVar("jumlah", 1)],
        ],
      }],
      frames: 4,
      focus: ["control_create_clone_of"],
    }),
    single("counter-hidden", ["control_get_counter", "control_incr_counter", "control_clear_counter", "control_all_at_once"], [[
      flag(),
      b("control_clear_counter"),
      b("control_incr_counter"),
      b("control_incr_counter"),
      setVar("k1", b("control_get_counter")),
      b("control_all_at_once", { SUBSTACK: [b("control_incr_counter"), b("motion_changexby", { DX: 5 }), b("motion_changexby", { DX: 5 })] }),
      setVar("k2", b("control_get_counter")),
      b("control_clear_counter"),
      setVar("k3", b("control_get_counter")),
    ]], 3),
  ];
}
