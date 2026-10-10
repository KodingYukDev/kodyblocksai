/** Korpus Motion: gerak, fencing 4 tepi, arah (wrapClamp), glide, bounce, rotation style. */
import type { Arg, BNode } from "../block-builder";
import { b, flag, forever, menu, repeat, setVar, wait } from "../block-builder";
import type { ParityCase } from "../case-types";
import { mkCase, probeCase } from "./helpers";

const goto = (to: string) => b("motion_goto", { TO: menu("motion_goto_menu", "TO", to) });
const gotoxy = (x: Arg, y: Arg) => b("motion_gotoxy", { X: x, Y: y });
const point = (d: Arg) => b("motion_pointindirection", { DIRECTION: d });
const move = (s: Arg) => b("motion_movesteps", { STEPS: s });
const rot = (style: string) => b("motion_setrotationstyle", {}, { STYLE: style });

/** Satu sprite, satu skrip flag; trace per frame menangkap setiap perubahan. */
function single(name: string, focus: string[], body: BNode[], frames = 4, extra: { seed?: number; x?: number; y?: number; direction?: number } = {}): ParityCase {
  const def = {
    id: `motion/${name}`,
    category: "motion" as const,
    title: name,
    sprites: [{ name: "Kody", x: extra.x ?? 0, y: extra.y ?? 0, direction: extra.direction ?? 90, scripts: [[flag(), ...body]] }],
    frames,
    focus,
  };
  return mkCase(extra.seed === undefined ? def : { ...def, seed: extra.seed });
}

/** Tiap langkah dipisah wait 0 -> satu langkah per frame (trace mencatat setiap state antara). */
const stepwise = (blocks: BNode[]): BNode[] => blocks.flatMap((x) => [x, wait(0)]);

export function motionCases(): ParityCase[] {
  return [
    single("movesteps", ["motion_movesteps"], stepwise([
      move(10), move(-25.5), move("abc"), move(" 7 "), point(45), move(10), point(-30), move(3.3333), move("1e2"),
    ]), 12),
    single("fencing-4-edges", ["motion_movesteps", "motion_gotoxy", "motion_setx", "motion_sety"], stepwise([
      gotoxy(1000, 0), gotoxy(-1000, 0), gotoxy(0, 1000), gotoxy(0, -1000), gotoxy(1e6, 1e6), gotoxy("Infinity", "-Infinity"),
      gotoxy("NaN", "abc"), b("motion_setx", { X: 500 }), b("motion_sety", { Y: -999 }), point(30), move(1000),
    ]), 14),
    single("turn", ["motion_turnright", "motion_turnleft"], stepwise([
      b("motion_turnright", { DEGREES: 15 }), b("motion_turnright", { DEGREES: 200 }), b("motion_turnleft", { DEGREES: 400 }),
      b("motion_turnleft", { DEGREES: -90.5 }), b("motion_turnright", { DEGREES: "abc" }), b("motion_turnright", { DEGREES: 1e10 }),
    ]), 8),
    single("pointindirection", ["motion_pointindirection"], stepwise(
      [0, -90, 180, -180, 181, 270, 360, 540, -721, 90.5, "abc", "Infinity", "", "1e3"].map(point),
    ), 16),
    single("goto-menu", ["motion_goto", "motion_goto_menu"], stepwise([goto("_random_"), goto("_random_"), goto("Lain"), goto("_mouse_"), goto("TidakAda")]), 8, { seed: 5 }),
    single("gotoxy-rounding", ["motion_gotoxy", "motion_xposition", "motion_yposition", "motion_direction"], [
      gotoxy(0.1, 0.2),
      b("motion_changexby", { DX: 0.2 }),
      setVar("x", b("motion_xposition")),
      setVar("y", b("motion_yposition")),
      gotoxy(1.0000000001, -3.14159265),
      setVar("x2", b("motion_xposition")),
      setVar("y2", b("motion_yposition")),
      point(33.333333333),
      setVar("d", b("motion_direction")),
    ], 2),
    single("change-set-xy", ["motion_changexby", "motion_setx", "motion_changeyby", "motion_sety"], stepwise([
      b("motion_changexby", { DX: 12 }), b("motion_changeyby", { DY: -7.5 }), b("motion_setx", { X: "abc" }),
      b("motion_sety", { Y: " 42 " }), b("motion_changexby", { DX: 300 }), b("motion_changeyby", { DY: 300 }),
    ]), 8),
    single("glidesecstoxy", ["motion_glidesecstoxy"], [
      b("motion_glidesecstoxy", { SECS: 0.5, X: 100, Y: -50 }),
      b("motion_glidesecstoxy", { SECS: 0, X: -10, Y: 10 }),
      b("motion_glidesecstoxy", { SECS: -1, X: 20, Y: 20 }),
      b("motion_glidesecstoxy", { SECS: 0.2, X: 1000, Y: 0 }),
    ], 30),
    single("glideto", ["motion_glideto", "motion_glideto_menu"], [
      b("motion_glideto", { SECS: 0.3, TO: menu("motion_glideto_menu", "TO", "_random_") }),
      b("motion_glideto", { SECS: 0.3, TO: menu("motion_glideto_menu", "TO", "Lain") }),
      b("motion_glideto", { SECS: 0.2, TO: menu("motion_glideto_menu", "TO", "_mouse_") }),
    ], 30, { seed: 9 }),
    single("pointtowards", ["motion_pointtowards", "motion_pointtowards_menu"], stepwise([
      b("motion_pointtowards", { TOWARDS: menu("motion_pointtowards_menu", "TOWARDS", "Lain") }),
      b("motion_pointtowards", { TOWARDS: menu("motion_pointtowards_menu", "TOWARDS", "_mouse_") }),
      b("motion_pointtowards", { TOWARDS: menu("motion_pointtowards_menu", "TOWARDS", "_random_") }),
      gotoxy(80, 60),
      b("motion_pointtowards", { TOWARDS: menu("motion_pointtowards_menu", "TOWARDS", "Lain") }),
      b("motion_pointtowards", { TOWARDS: menu("motion_pointtowards_menu", "TOWARDS", "Kody") }),
    ]), 8, { seed: 13, x: -50, y: 30 }),
    single("ifonedgebounce", ["motion_ifonedgebounce"], [
      point(70),
      forever([move(23), b("motion_ifonedgebounce")]),
    ], 40, { x: 150, y: 100 }),
    single("ifonedgebounce-corners", ["motion_ifonedgebounce"], [
      point(-135),
      repeat(30, [move(17), b("motion_ifonedgebounce")]),
    ], 32, { x: -200, y: -150 }),
    single("rotationstyle", ["motion_setrotationstyle"], stepwise([
      point(-90), rot("left-right"), point(-45), rot("don't rotate"), point(10), rot("all around"), rot("bukan-gaya"), point(-170),
    ]), 10),
    probeCase("motion", "hidden-scroll", ["motion_scroll_right", "motion_scroll_up", "motion_align_scene", "motion_xscroll", "motion_yscroll"], [
      b("motion_xscroll"),
      b("motion_yscroll"),
    ], {
      sprites: [
        {
          scripts: [[
            flag(),
            b("motion_scroll_right", { DISTANCE: 10 }),
            b("motion_scroll_up", { DISTANCE: 10 }),
            b("motion_align_scene", {}, { ALIGNMENT: "bottom-left" }),
          ]],
        },
      ],
    }),
    // Quirk scratch-vm: sebelum ada postData mouse, getScratchX() = undefined -> x/arah ikut undefined/NaN.
    single("mouse-never-posted", ["motion_goto", "motion_pointtowards"], stepwise([
      goto("_mouse_"),
      gotoxy(10, 10),
      b("motion_pointtowards", { TOWARDS: menu("motion_pointtowards_menu", "TOWARDS", "_mouse_") }),
    ]), 4),
  ].map((c) => {
    // Mouse sudah pernah digerakkan (seperti di GUI) untuk kasus yang membaca posisi mouse.
    if (["motion/goto-menu", "motion/glideto", "motion/pointtowards"].includes(c.id)) {
      c.actions = [{ frame: 1, kind: "mouse", x: 300.4, y: 99.6 }];
    }
    // Sprite kedua "Lain" untuk target goto/pointtowards/glideto.
    c.project.targets.push({ ...(c.project.targets[1] as Record<string, unknown>), name: "Lain", x: 120, y: -80, blocks: {}, variables: {}, lists: {}, layerOrder: 2 });
    return c;
  });
}
