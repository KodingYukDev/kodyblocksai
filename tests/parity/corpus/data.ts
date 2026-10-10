/** Korpus Variables & Lists. */
import type { BNode } from "../block-builder";
import { b, changeVar, flag, lf, list13, listRef, setVar, var12, varRef, vf, wait } from "../block-builder";
import type { ParityCase } from "../case-types";
import { CAST_VALUES, mkCase, probeCase } from "./helpers";

const L = "daftar";
const add = (v: string | number | BNode) => b("data_addtolist", { ITEM: v }, { LIST: lf(L) });
const del = (i: string | number) => b("data_deleteoflist", { INDEX: i }, { LIST: lf(L) });
const ins = (v: string | number, i: string | number) => b("data_insertatlist", { ITEM: v, INDEX: i }, { LIST: lf(L) });
const rep = (i: string | number, v: string | number) => b("data_replaceitemoflist", { INDEX: i, ITEM: v }, { LIST: lf(L) });
const item = (i: string | number) => b("data_itemoflist", { INDEX: i }, { LIST: lf(L) });
const snap = (name: string) => setVar(name, listRef(L));

const INDEXES: (string | number)[] = [1, 2, 0, -1, 99, 1.5, 2.9, "last", "random", "any", "all", "abc", "", " 2 "];

export function dataCases(): ParityCase[] {
  return [
    probeCase("variables", "set-change", ["data_setvariableto", "data_changevariableby", "data_variable"], [
      ...CAST_VALUES,
      b("operator_not"),
    ], {
      sprites: [
        {
          scripts: [
            [
              flag(),
              wait(0),
              ...CAST_VALUES.map((v, i) => changeVar(`r${i}`, v)),
              setVar("salin", varRef("r1")),
              setVar("salin2", var12("r2")),
              changeVar("salin2", 1),
            ],
          ],
        },
      ],
      frames: 3,
    }),
    mkCase({
      id: "variables/local-vs-global",
      category: "variables",
      title: "variabel lokal sprite menutupi nama global",
      sprites: [
        {
          name: "A",
          variables: { var_lokal: ["lokal", "A0"] },
          scripts: [[flag(), setVar("lokal", "milik A"), changeVar("global", 5)]],
        },
        { name: "B", scripts: [[flag(), changeVar("global", 1), setVar("hasil", varRef("global"))]] },
      ],
      stage: { variables: { var_global: ["global", 10] } },
      frames: 2,
      focus: ["data_setvariableto", "data_changevariableby"],
    }),
    mkCase({
      id: "variables/show-hide",
      category: "variables",
      title: "show/hide variable mengubah monitor",
      sprites: [
        {
          variables: { var_lokal: ["lokal", 3] },
          scripts: [
            [
              flag(),
              b("data_showvariable", {}, { VARIABLE: vf("global") }),
              b("data_showvariable", {}, { VARIABLE: vf("lokal") }),
              wait(0.1),
              changeVar("global", 2),
              wait(0.1),
              b("data_hidevariable", {}, { VARIABLE: vf("global") }),
            ],
          ],
        },
      ],
      frames: 12,
      focus: ["data_showvariable", "data_hidevariable"],
    }),
    mkCase({
      id: "lists/add-delete",
      category: "lists",
      title: "add/delete dengan berbagai indeks",
      sprites: [
        {
          scripts: [
            [
              flag(),
              b("data_deletealloflist", {}, { LIST: lf(L) }),
              ...["a", "b", "c", "d", "e", "f", "g", 1, 2.5, ""].map(add),
              snap("s0"),
              ...INDEXES.flatMap((i, n) => [del(i), snap(`d${n}`)]),
            ],
          ],
        },
      ],
      frames: 2,
      seed: 7,
      focus: ["data_addtolist", "data_deleteoflist", "data_deletealloflist", "data_listcontents"],
    }),
    mkCase({
      id: "lists/insert-replace",
      category: "lists",
      title: "insert/replace dengan berbagai indeks",
      sprites: [
        {
          scripts: [
            [
              flag(),
              b("data_deletealloflist", {}, { LIST: lf(L) }),
              add("x"),
              ...INDEXES.flatMap((i, n) => [ins(`i${n}`, i), snap(`i${n}`)]),
              ...INDEXES.flatMap((i, n) => [rep(i, `r${n}`), snap(`r${n}`)]),
            ],
          ],
        },
      ],
      frames: 2,
      seed: 11,
      focus: ["data_insertatlist", "data_replaceitemoflist"],
    }),
    probeCase(
      "lists",
      "reporters",
      ["data_itemoflist", "data_itemnumoflist", "data_lengthoflist", "data_listcontainsitem", "data_listcontents"],
      [
        ...INDEXES.map(item),
        ...["b", "B", 2, "2", "", "zz", " b"].map((v) => b("data_itemnumoflist", { ITEM: v }, { LIST: lf(L) })),
        b("data_lengthoflist", {}, { LIST: lf(L) }),
        ...["b", "B", 2, "2.0", "", "zz"].map((v) => b("data_listcontainsitem", { ITEM: v }, { LIST: lf(L) })),
        listRef(L),
        list13("huruf"),
        listRef("campur"),
        listRef("kosong"),
      ],
      {
        seed: 3,
        stage: {
          lists: {
            [`list_${L}`]: [L, ["a", "b", 2, "c", "", 2.5]],
            list_huruf: ["huruf", ["a", "b", "c"]],
            list_campur: ["campur", ["a", "bc", 1]],
            list_kosong: ["kosong", []],
          },
        },
      },
    ),
    mkCase({
      id: "lists/show-hide",
      category: "lists",
      title: "show/hide list (monitor)",
      sprites: [
        {
          scripts: [
            [flag(), b("data_showlist", {}, { LIST: lf(L) }), add("satu"), wait(0.1), add("dua"), b("data_hidelist", {}, { LIST: lf(L) })],
          ],
        },
      ],
      frames: 8,
      focus: ["data_showlist", "data_hidelist"],
    }),
    mkCase({
      id: "lists/limit-and-types",
      category: "lists",
      title: "list besar + tipe nilai yang disimpan",
      sprites: [
        {
          scripts: [
            [
              flag(),
              b("data_deletealloflist", {}, { LIST: lf(L) }),
              b("control_repeat", { TIMES: 250, SUBSTACK: [add(b("operator_random", { FROM: 1, TO: 6 }))] }),
              add(b("operator_not")),
              add(b("operator_add", { NUM1: 1, NUM2: 2 })),
              setVar("panjang", b("data_lengthoflist", {}, { LIST: lf(L) })),
            ],
          ],
        },
      ],
      frames: 3,
      seed: 99,
      focus: ["data_addtolist", "data_lengthoflist"],
    }),
  ];
}
