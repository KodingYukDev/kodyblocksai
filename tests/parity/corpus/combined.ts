/** Proyek gabungan: interaksi antar fitur (clone + broadcast and wait, warp + glide, timer, random). */
import type { Arg, ProcArgSpec } from "../block-builder";
import { argRef, b, bc, changeVar, flag, forever, lf, menu, procCall, procDef, repeat, setVar, varRef, wait } from "../block-builder";
import type { ParityCase } from "../case-types";
import { mkCase } from "./helpers";

const log = (v: Arg) => b("data_addtolist", { ITEM: v }, { LIST: lf("log") });
const cloneMe = () => b("control_create_clone_of", { CLONE_OPTION: menu("control_create_clone_of_menu", "CLONE_OPTION", "_myself_") });
const SPAWN: ProcArgSpec[] = [{ name: "jumlah", kind: "s" }];

export function combinedCases(): ParityCase[] {
  return [
    mkCase({
      id: "combined/clones-broadcastandwait",
      category: "combined",
      title: "clone menerima broadcast and wait; induk menunggu semua clone selesai",
      sprites: [{
        name: "Pasukan",
        variables: { var_nomor: ["nomor", 0] },
        scripts: [
          [flag(), b("looks_hide"), setVar("nomor", 0), repeat(4, [changeVar("nomor", 1), cloneMe()]), wait(0.1), b("event_broadcastandwait", { BROADCAST_INPUT: bc("maju") }), log("semua selesai"), b("looks_show")],
          [b("control_start_as_clone"), b("motion_gotoxy", { X: b("operator_multiply", { NUM1: varRef("nomor"), NUM2: 40 }), Y: 0 }), b("looks_show")],
          [b("event_whenbroadcastreceived", {}, { BROADCAST_OPTION: ["maju", "bc_maju"] }), repeat(b("operator_multiply", { NUM1: varRef("nomor"), NUM2: 2 }), [b("motion_changeyby", { DY: 5 })]), log(varRef("nomor"))],
        ],
      }],
      frames: 20,
      focus: ["event_broadcastandwait", "control_create_clone_of", "control_start_as_clone"],
    }),
    mkCase({
      id: "combined/warp-procedure-glide",
      category: "combined",
      title: "procedure warp menyusun posisi, lalu glide di luar warp",
      sprites: [{
        name: "A",
        scripts: [
          [flag(), procCall("susun %s", SPAWN, [15]), b("motion_glidesecstoxy", { SECS: 0.4, X: 0, Y: 0 }), log(b("motion_xposition"))],
          procDef("susun %s", SPAWN, true, [repeat(argRef("jumlah"), [b("motion_changexby", { DX: 7 }), b("motion_turnright", { DEGREES: 13 })])]),
        ],
      }],
      frames: 18,
      focus: ["procedures_call", "motion_glidesecstoxy"],
    }),
    mkCase({
      id: "combined/timer-fake-clock",
      category: "combined",
      title: "timer, wait, glide, dan say for secs pada jam palsu yang sama",
      sprites: [{
        name: "A",
        scripts: [
          [flag(), b("looks_sayforsecs", { MESSAGE: b("sensing_timer"), SECS: 0.2 }), setVar("t1", b("sensing_timer")), b("motion_glidesecstoxy", { SECS: 0.3, X: 90, Y: 45 }), setVar("t2", b("sensing_timer"))],
          [flag(), b("control_wait_until", { CONDITION: b("operator_gt", { OPERAND1: b("sensing_timer"), OPERAND2: 0.35 }) }), setVar("t3", b("sensing_timer"))],
        ],
      }],
      frames: 26,
      focus: ["sensing_timer", "control_wait_until"],
    }),
    mkCase({
      id: "combined/random-seeded",
      category: "combined",
      title: "random dengan seed sama: go to random, point random, pick random, random costume",
      sprites: [{
        name: "A",
        costumes: ["a", "b", "c", "d"],
        scripts: [[flag(), repeat(8, [
          b("motion_goto", { TO: menu("motion_goto_menu", "TO", "_random_") }),
          b("motion_pointtowards", { TOWARDS: menu("motion_pointtowards_menu", "TOWARDS", "_random_") }),
          b("looks_switchcostumeto", { COSTUME: menu("looks_costume", "COSTUME", "random costume") }),
          log(b("operator_random", { FROM: 1, TO: 6 })),
          log(b("operator_random", { FROM: 0, TO: 1.0 })),
          b("data_deleteoflist", { INDEX: "random" }, { LIST: lf("kosong") }),
        ])]],
      }],
      frames: 10,
      seed: 2024,
      focus: ["operator_random", "motion_goto", "motion_pointtowards", "looks_switchcostumeto"],
    }),
    mkCase({
      id: "combined/clone-layers-touch",
      category: "combined",
      title: "clone di belakang induk, clone saling menyentuh, delete saat menyentuh tepi",
      sprites: [{
        name: "Bola",
        scripts: [
          [flag(), b("motion_gotoxy", { X: -200, Y: 0 }), repeat(3, [cloneMe(), b("motion_changexby", { DX: 50 })])],
          [b("control_start_as_clone"), forever([
            b("motion_changexby", { DX: 30 }),
            b("control_if", { CONDITION: b("sensing_touchingobject", { TOUCHINGOBJECTMENU: menu("sensing_touchingobjectmenu", "TOUCHINGOBJECTMENU", "_edge_") }), SUBSTACK: [changeVar("hapus", 1), b("control_delete_this_clone")] }),
          ])],
        ],
      }],
      frames: 25,
      focus: ["control_create_clone_of", "control_delete_this_clone", "sensing_touchingobject"],
    }),
    mkCase({
      id: "combined/green-flag-restart",
      category: "combined",
      title: "green flag kedua di tengah jalan me-restart thread & membuang clone",
      sprites: [{
        name: "A",
        scripts: [
          [flag(), setVar("putaran", b("operator_add", { NUM1: varRef("putaran"), NUM2: 1 })), b("motion_gotoxy", { X: 0, Y: 0 }), cloneMe(), forever([b("motion_changexby", { DX: 5 })])],
          [b("control_start_as_clone"), forever([b("motion_changeyby", { DY: 5 })])],
        ],
      }],
      frames: 12,
      actions: [{ frame: 6, kind: "greenFlag" }, { frame: 10, kind: "stopAll" }],
      focus: ["event_whenflagclicked"],
    }),
    mkCase({
      id: "combined/turbo-off-60fps",
      category: "combined",
      title: "mode 60 fps (compatibility off): wait & glide memakai stepTime 1000/60",
      sprites: [{ name: "A", scripts: [[flag(), b("motion_glidesecstoxy", { SECS: 0.2, X: 100, Y: 0 }), wait(0.1), log(b("sensing_timer"))]] }],
      frames: 22,
      focus: ["motion_glidesecstoxy"],
    }),
  ].map((c) => (c.id === "combined/turbo-off-60fps" ? { ...c, compatibilityMode: false } : c));
}
