/** Korpus My Blocks: argumen, rekursi, warp (run without screen refresh), stop di dalam procedure. */
import type { Arg, ProcArgSpec } from "../block-builder";
import { argRef, b, flag, lf, procCall, procDef, repeat, setVar, varRef } from "../block-builder";
import type { ParityCase } from "../case-types";
import { mkCase } from "./helpers";

const log = (v: Arg) => b("data_addtolist", { ITEM: v }, { LIST: lf("log") });

const FACT: ProcArgSpec[] = [{ name: "n", kind: "s" }];
const MIX: ProcArgSpec[] = [{ name: "teks", kind: "s" }, { name: "benar", kind: "b" }];

export function procedureCases(): ParityCase[] {
  const factBody = [
    b("control_if_else", {
      CONDITION: b("operator_lt", { OPERAND1: argRef("n"), OPERAND2: 2 }),
      SUBSTACK: [setVar("hasil", 1)],
      SUBSTACK2: [
        procCall("fakt %s", FACT, [b("operator_subtract", { NUM1: argRef("n"), NUM2: 1 })]),
        setVar("hasil", b("operator_multiply", { NUM1: varRef("hasil"), NUM2: argRef("n") })),
      ],
    }),
  ];
  return [
    mkCase({
      id: "myBlocks/args",
      category: "myBlocks",
      title: "argumen teks/angka/boolean, argumen tanpa nilai, reporter argumen di luar procedure",
      sprites: [{
        name: "A",
        scripts: [
          [flag(),
            procCall("cetak %s %b", MIX, ["halo", b("operator_not")]),
            procCall("cetak %s %b", MIX, [12.5]),
            procCall("cetak %s %b", MIX, [b("operator_add", { NUM1: 1, NUM2: 2 }), b("operator_join", { STRING1: "false", STRING2: "" })]),
            procCall("tidak ada definisi %s", [{ name: "x", kind: "s" }], [1]),
            log(argRef("teks")),
            log(argRef("benar", true)),
          ],
          procDef("cetak %s %b", MIX, false, [log(argRef("teks")), log(argRef("benar", true)), log(argRef("tidakAda"))]),
        ],
      }],
      frames: 2,
      focus: ["procedures_call", "procedures_definition", "procedures_prototype", "argument_reporter_string_number", "argument_reporter_boolean"],
    }),
    mkCase({
      id: "myBlocks/recursion-warp",
      category: "myBlocks",
      title: "faktorial rekursif dengan warp (selesai dalam satu frame)",
      sprites: [{ name: "A", scripts: [[flag(), procCall("fakt %s", FACT, [10])], procDef("fakt %s", FACT, true, factBody)] }],
      frames: 2,
      focus: ["procedures_call", "procedures_definition"],
    }),
    mkCase({
      id: "myBlocks/recursion-no-warp",
      category: "myBlocks",
      title: "rekursi tanpa warp: yield di panggilan rekursif",
      sprites: [{ name: "A", scripts: [[flag(), procCall("fakt %s", FACT, [6])], procDef("fakt %s", FACT, false, factBody)] }],
      frames: 10,
      focus: ["procedures_call"],
    }),
    mkCase({
      id: "myBlocks/warp-vs-normal",
      category: "myBlocks",
      title: "loop gerak di procedure warp (1 frame) vs normal (1 langkah per frame)",
      sprites: [
        {
          name: "Warp",
          scripts: [
            [flag(), procCall("lari", [], [])],
            procDef("lari", [], true, [repeat(20, [b("motion_changexby", { DX: 5 })])]),
          ],
        },
        {
          name: "Biasa",
          scripts: [
            [flag(), procCall("lari", [], [])],
            procDef("lari", [], false, [repeat(20, [b("motion_changexby", { DX: 5 })])]),
          ],
        },
      ],
      frames: 24,
      focus: ["procedures_call"],
    }),
    mkCase({
      id: "myBlocks/stop-in-procedure",
      category: "myBlocks",
      title: "stop this script di dalam procedure menghentikan seluruh skrip",
      sprites: [{
        name: "A",
        scripts: [
          [flag(), procCall("berhenti", [], []), log("tidak boleh")],
          procDef("berhenti", [], false, [log("masuk"), b("control_stop", {}, { STOP_OPTION: "this script" }, { hasnext: "false" }), log("tidak juga")]),
        ],
      }],
      frames: 2,
      focus: ["procedures_call", "control_stop"],
    }),
  ];
}
