/** Korpus Sensing: touching, distance, ask/answer, key/mouse, timer (jam palsu), of, current, username. */
import type { BNode } from "../block-builder";
import { b, flag, forever, menu, setVar, wait } from "../block-builder";
import type { ParityCase } from "../case-types";
import { mkCase, probeCase } from "./helpers";

const touching = (who: string) => b("sensing_touchingobject", { TOUCHINGOBJECTMENU: menu("sensing_touchingobjectmenu", "TOUCHINGOBJECTMENU", who) });
const distance = (who: string) => b("sensing_distanceto", { DISTANCETOMENU: menu("sensing_distancetomenu", "DISTANCETOMENU", who) });
const keyPressed = (k: string) => b("sensing_keypressed", { KEY_OPTION: menu("sensing_keyoptions", "KEY_OPTION", k) });
const of = (prop: string, obj: string) => b("sensing_of", { OBJECT: menu("sensing_of_object_menu", "OBJECT", obj) }, { PROPERTY: prop });

/** Rekam reporter ke variabel setiap frame (forever + wait 0). */
const recordEachFrame = (pairs: [string, BNode][]): BNode[] => [flag(), forever([...pairs.map(([n, r]) => setVar(n, r)), wait(0)])];

export function sensingCases(): ParityCase[] {
  return [
    mkCase({
      id: "sensing/touching-distance",
      category: "sensing",
      title: "touching sprite/edge/mouse dan distance to",
      sprites: [
        {
          name: "A",
          x: -200,
          scripts: [
            [flag(), forever([b("motion_changexby", { DX: 25 })])],
            recordEachFrame([
              ["kenaB", touching("B")],
              ["kenaTepi", touching("_edge_")],
              ["kenaMouse", touching("_mouse_")],
              ["kenaDiri", touching("A")],
              ["kenaTidakAda", touching("Hantu")],
              ["jarakB", distance("B")],
              ["jarakMouse", distance("_mouse_")],
              ["jarakHantu", distance("Hantu")],
            ]),
          ],
        },
        { name: "B", x: 50, y: 10, scripts: [] },
      ],
      frames: 20,
      actions: [{ frame: 1, kind: "mouse", x: 300, y: 170 }],
      focus: ["sensing_touchingobject", "sensing_touchingobjectmenu", "sensing_distanceto", "sensing_distancetomenu"],
    }),
    probeCase("sensing", "touching-color", ["sensing_touchingcolor", "sensing_coloristouchingcolor"], [
      b("sensing_touchingcolor", { COLOR: { kind: "lit", code: 9, value: "#ff0000" } }),
      b("sensing_coloristouchingcolor", { COLOR: { kind: "lit", code: 9, value: "#00ff00" }, COLOR2: { kind: "lit", code: 9, value: "#0000ff" } }),
      b("sensing_touchingcolor", { COLOR: 16711680 }),
    ]),
    mkCase({
      id: "sensing/ask-answer",
      category: "sensing",
      title: "ask and wait antre (sprite & stage), answer",
      sprites: [
        { name: "A", scripts: [[flag(), b("sensing_askandwait", { QUESTION: "Nama?" }), setVar("jawab1", b("sensing_answer")), b("sensing_askandwait", { QUESTION: 42 }), setVar("jawab2", b("sensing_answer"))]] },
        { name: "B", visible: false, scripts: [[flag(), b("sensing_askandwait", { QUESTION: "tersembunyi" }), setVar("jawab3", b("sensing_answer"))]] },
      ],
      stage: { scripts: [[flag(), b("sensing_askandwait", { QUESTION: "dari panggung" }), setVar("jawab4", b("sensing_answer"))]] },
      frames: 14,
      actions: [
        { frame: 3, kind: "answer", text: "Kody" },
        { frame: 6, kind: "answer", text: " 7 " },
        { frame: 9, kind: "answer", text: "" },
        { frame: 12, kind: "answer", text: "akhir" },
      ],
      focus: ["sensing_askandwait", "sensing_answer"],
    }),
    mkCase({
      id: "sensing/keys-mouse",
      category: "sensing",
      title: "key pressed, mouse down, mouse x/y (pembulatan + clamp)",
      sprites: [{
        name: "A",
        scripts: [recordEachFrame([
          ["spasi", keyPressed("space")],
          ["a", keyPressed("a")],
          ["any", keyPressed("any")],
          ["kiri", keyPressed("left arrow")],
          ["kode32", b("sensing_keypressed", { KEY_OPTION: 32 })],
          ["mouseDown", b("sensing_mousedown")],
          ["mx", b("sensing_mousex")],
          ["my", b("sensing_mousey")],
        ])],
      }],
      frames: 9,
      actions: [
        { frame: 2, kind: "key", key: " ", isDown: true },
        { frame: 3, kind: "key", key: "a", isDown: true },
        { frame: 4, kind: "key", key: " ", isDown: false },
        { frame: 4, kind: "key", key: "ArrowLeft", isDown: true },
        { frame: 5, kind: "key", key: "a", isDown: false },
        { frame: 5, kind: "key", key: "ArrowLeft", isDown: false },
        { frame: 6, kind: "mouse", x: 100.6, y: 33.3, isDown: true },
        { frame: 7, kind: "mouse", x: 1000, y: -50 },
        { frame: 8, kind: "mouse", x: 241, y: 179, isDown: false },
      ],
      focus: ["sensing_keypressed", "sensing_keyoptions", "sensing_mousedown", "sensing_mousex", "sensing_mousey"],
    }),
    mkCase({
      id: "sensing/drag-mode",
      category: "sensing",
      title: "set drag mode",
      sprites: [{ name: "A", scripts: [[flag(), b("sensing_setdragmode", {}, { DRAG_MODE: "draggable" }), wait(0), b("sensing_setdragmode", {}, { DRAG_MODE: "not draggable" })]] }],
      frames: 3,
      focus: ["sensing_setdragmode"],
    }),
    mkCase({
      id: "sensing/timer",
      category: "sensing",
      title: "timer dengan jam palsu + reset timer",
      sprites: [{
        name: "A",
        scripts: [
          recordEachFrame([["t", b("sensing_timer")]]),
          [flag(), wait(0.25), b("sensing_resettimer"), wait(0.1), setVar("setelahReset", b("sensing_timer"))],
        ],
      }],
      frames: 16,
      focus: ["sensing_timer", "sensing_resettimer"],
    }),
    probeCase("sensing", "of", ["sensing_of", "sensing_of_object_menu"], [
      ...["x position", "y position", "direction", "costume #", "costume name", "size", "volume", "lokalB", "tidak-ada"].map((p) => of(p, "B")),
      ...["backdrop #", "backdrop name", "volume", "globalS", "x position"].map((p) => of(p, "_stage_")),
      of("x position", "Hantu"),
      b("sensing_of", { OBJECT: b("operator_join", { STRING1: "B", STRING2: "" }) }, { PROPERTY: "size" }),
    ], {
      sprites: [
        { scripts: [] },
        { name: "B", x: 33.5, y: -12, direction: 45, size: 80, costumes: ["k1", "k2"], currentCostume: 1, volume: 60, variables: { var_lokalB: ["lokalB", "isi"] }, scripts: [] },
      ],
      stage: { variables: { var_globalS: ["globalS", 9] } },
    }),
    probeCase("sensing", "current-date", ["sensing_current", "sensing_dayssince2000"], [
      ...["YEAR", "MONTH", "DATE", "DAYOFWEEK", "HOUR", "MINUTE", "SECOND", "TIDAK"].map((m) => b("sensing_current", {}, { CURRENTMENU: m })),
      b("sensing_dayssince2000"),
    ]),
    probeCase("sensing", "loudness-username", ["sensing_loudness", "sensing_loud", "sensing_username", "sensing_userid"], [
      b("sensing_loudness"),
      b("sensing_loud"),
      b("sensing_username"),
      b("sensing_userid"),
    ], { actions: [{ frame: 1, kind: "username", name: "siswa_kody" }], frames: 3, sprites: [{ scripts: [[flag(), wait(0), setVar("nama2", b("sensing_username"))]] }] }),
  ];
}
