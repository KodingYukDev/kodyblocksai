/** Korpus Looks: balon say/think, costume/backdrop, ukuran, efek, layer. */
import type { Arg, BNode } from "../block-builder";
import { b, flag, menu, setVar, wait } from "../block-builder";
import type { ParityCase } from "../case-types";
import { mkCase, probeCase } from "./helpers";

const stepwise = (blocks: BNode[]): BNode[] => blocks.flatMap((x) => [x, wait(0)]);
const costume = (v: Arg) => b("looks_switchcostumeto", { COSTUME: typeof v === "string" ? menu("looks_costume", "COSTUME", v) : v });
const backdrop = (v: string) => b("looks_switchbackdropto", { BACKDROP: menu("looks_backdrops", "BACKDROP", v) });
const EFFECTS = ["COLOR", "FISHEYE", "WHIRL", "PIXELATE", "MOSAIC", "BRIGHTNESS", "GHOST"];
const COSTUMES = ["a", "b", "c", "2", "d"];
const BACKDROPS = ["latar1", "latar2", "3", "latar4"];

function one(name: string, focus: string[], body: BNode[], frames: number, seed?: number): ParityCase {
  const c = mkCase({
    id: `looks/${name}`,
    category: "looks",
    title: name,
    sprites: [{ name: "Kody", costumes: COSTUMES, scripts: [[flag(), ...body]] }],
    stage: { backdrops: BACKDROPS },
    frames,
    focus,
  });
  if (seed !== undefined) c.seed = seed;
  return c;
}

export function looksCases(): ParityCase[] {
  return [
    one("say-think", ["looks_say", "looks_think"], stepwise([
      b("looks_say", { MESSAGE: "Halo!" }),
      b("looks_say", { MESSAGE: 3.14159 }),
      b("looks_say", { MESSAGE: b("operator_divide", { NUM1: 2, NUM2: 3 }) }),
      b("looks_think", { MESSAGE: "hmm" }),
      b("looks_say", { MESSAGE: "x".repeat(400) }),
      b("looks_say", { MESSAGE: "" }),
      b("looks_think", { MESSAGE: b("operator_not") }),
      b("looks_say", { MESSAGE: 1e21 }),
    ]), 10),
    one("sayforsecs", ["looks_sayforsecs", "looks_thinkforsecs"], [
      b("looks_sayforsecs", { MESSAGE: "dua detik?", SECS: 0.3 }),
      b("looks_thinkforsecs", { MESSAGE: "pikir", SECS: 0.2 }),
      b("looks_say", { MESSAGE: "tetap" }),
      b("looks_sayforsecs", { MESSAGE: "nol", SECS: 0 }),
    ], 22),
    one("switchcostume", ["looks_switchcostumeto", "looks_costume", "looks_nextcostume", "looks_costumenumbername"], [
      ...stepwise([
        costume("b"), costume("2"), costume("next costume"), costume("previous costume"), costume("tidak-ada"),
        costume(b("operator_add", { NUM1: 3, NUM2: 0 })), costume(b("operator_join", { STRING1: "c", STRING2: "" })),
        costume(b("operator_add", { NUM1: 7, NUM2: 0 })), costume(b("operator_add", { NUM1: -1, NUM2: 0 })),
        costume(b("operator_add", { NUM1: 2.6, NUM2: 0 })), costume(b("operator_not")), costume(b("operator_join", { STRING1: " ", STRING2: "" })),
        b("looks_nextcostume"), b("looks_nextcostume"),
      ]),
      setVar("nomor", b("looks_costumenumbername", {}, { NUMBER_NAME: "number" })),
      setVar("nama", b("looks_costumenumbername", {}, { NUMBER_NAME: "name" })),
      costume("random costume"),
      costume("random costume"),
    ], 34, 21),
    one("backdrops", ["looks_switchbackdropto", "looks_backdrops", "looks_nextbackdrop", "looks_backdropnumbername", "event_whenbackdropswitchesto"], [
      ...stepwise([backdrop("latar2"), backdrop("3"), backdrop("next backdrop"), backdrop("previous backdrop"), backdrop("random backdrop"), b("looks_nextbackdrop")]),
      setVar("bnomor", b("looks_backdropnumbername", {}, { NUMBER_NAME: "number" })),
      setVar("bnama", b("looks_backdropnumbername", {}, { NUMBER_NAME: "name" })),
    ], 14, 4),
    mkCase({
      id: "looks/switchbackdroptoandwait",
      category: "looks",
      // Quirk scratch-vm: execute() hat di dalam startHats menimpa BlockUtility singleton sehingga
      // frame pertama melempar TypeError (frame terpotong); frame berikutnya menunggu normal.
      title: "switch backdrop and wait menunggu skrip penerima (quirk TypeError frame 1)",
      sprites: [
        {
          name: "Kody",
          scripts: [
            [flag(), b("looks_switchbackdroptoandwait", { BACKDROP: menu("looks_backdrops", "BACKDROP", "latar2") }), setVar("selesai", "ya")],
            [b("event_whenbackdropswitchesto", {}, { BACKDROP: "latar2" }), b("control_repeat", { TIMES: 5, SUBSTACK: [b("motion_changexby", { DX: 10 })] })],
          ],
        },
      ],
      stage: { backdrops: BACKDROPS, scripts: [[b("event_whenbackdropswitchesto", {}, { BACKDROP: "latar2" }), wait(0.1), b("data_changevariableby", { VALUE: 1 }, { VARIABLE: ["hit", "var_hit"] })]] },
      frames: 10,
      focus: ["looks_switchbackdroptoandwait"],
    }),
    one("switchbackdroptoandwait-no-hat", ["looks_switchbackdroptoandwait"], [
      b("looks_switchbackdroptoandwait", { BACKDROP: menu("looks_backdrops", "BACKDROP", "latar4") }),
      setVar("selesai", "ya"),
      b("looks_switchbackdroptoandwait", { BACKDROP: menu("looks_backdrops", "BACKDROP", "next backdrop") }),
      setVar("selesai2", "ya"),
    ], 3),
    one("size", ["looks_changesizeby", "looks_setsizeto", "looks_size"], [
      ...stepwise([
        b("looks_setsizeto", { SIZE: 50 }), b("looks_changesizeby", { CHANGE: 25.5 }), b("looks_setsizeto", { SIZE: 100000 }),
        b("looks_setsizeto", { SIZE: 0 }), b("looks_setsizeto", { SIZE: -50 }), b("looks_setsizeto", { SIZE: "abc" }),
        b("looks_changesizeby", { CHANGE: 1e9 }), b("looks_setsizeto", { SIZE: 33.3333 }),
      ]),
      setVar("ukuran", b("looks_size")),
    ], 18),
    one("effects", ["looks_changeeffectby", "looks_seteffectto", "looks_cleargraphiceffects"], [
      ...EFFECTS.flatMap((e) => [
        b("looks_seteffectto", { VALUE: 150 }, { EFFECT: e }),
        b("looks_changeeffectby", { CHANGE: -260 }, { EFFECT: e }),
      ]),
      wait(0),
      ...EFFECTS.map((e) => b("looks_seteffectto", { VALUE: "abc" }, { EFFECT: e })),
      b("looks_changeeffectby", { CHANGE: 25 }, { EFFECT: "color" }),
      b("looks_changeeffectby", { CHANGE: 25 }, { EFFECT: "TIDAK-ADA" }),
      wait(0),
      b("looks_cleargraphiceffects"),
    ], 6),
    one("show-hide", ["looks_show", "looks_hide", "looks_hideallsprites"], stepwise([
      b("looks_hide"), b("looks_show"), b("looks_hideallsprites"), b("looks_hide"),
    ]), 6),
    probeCase("looks", "stretch-hidden", ["looks_changestretchby", "looks_setstretchto"], [b("looks_size")], {
      sprites: [{ scripts: [[flag(), b("looks_setstretchto", { STRETCH: 50 }), b("looks_changestretchby", { CHANGE: 10 })]] }],
    }),
    mkCase({
      id: "looks/layers",
      category: "looks",
      title: "go to front/back dan forward/backward layers dengan 4 sprite",
      sprites: ["A", "B", "C", "D"].map((name, i) => ({
        name,
        x: i * 20,
        scripts: i === 1
          ? [[flag(), ...stepwise([
              b("looks_gotofrontback", {}, { FRONT_BACK: "front" }),
              b("looks_gotofrontback", {}, { FRONT_BACK: "back" }),
              b("looks_goforwardbackwardlayers", { NUM: 2 }, { FORWARD_BACKWARD: "forward" }),
              b("looks_goforwardbackwardlayers", { NUM: 10 }, { FORWARD_BACKWARD: "backward" }),
              b("looks_goforwardbackwardlayers", { NUM: -1 }, { FORWARD_BACKWARD: "forward" }),
              b("looks_goforwardbackwardlayers", { NUM: 1.6 }, { FORWARD_BACKWARD: "forward" }),
              b("looks_goforwardbackwardlayers", { NUM: "abc" }, { FORWARD_BACKWARD: "backward" }),
            ])]]
          : [],
      })),
      frames: 10,
      focus: ["looks_gotofrontback", "looks_goforwardbackwardlayers"],
    }),
    mkCase({
      id: "looks/say-on-stop",
      category: "looks",
      title: "balon hilang saat stop all, ask di sprite tersembunyi",
      sprites: [{ name: "Kody", scripts: [[flag(), b("looks_say", { MESSAGE: "sebelum stop" }), wait(0.1), b("control_stop", {}, { STOP_OPTION: "all" }, { hasnext: "false" })]] }],
      frames: 6,
      focus: ["looks_say", "control_stop"],
    }),
  ];
}
