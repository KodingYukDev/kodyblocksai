/**
 * Toolbox default persis scratch-gui src/lib/make-toolbox-xml.js (urutan, gap, shadow default).
 * Port dari fork KodyBlocks scratch-gui (BSD-3-Clause, lihat THIRD_PARTY.md): XML diubah jadi data.
 * `<sep gap="36"/>` = gap 36 pada blok sebelumnya; field kosong (`<field name="NUM"/>`) = "".
 */
import { CATEGORY_COLOURS } from "./colours";
import { msg, type BlockLocale } from "./blocks/messages";
import type { ToolboxBlock, ToolboxCategory } from "./types";

/** Nilai default dropdown dinamis (costume/backdrop/sound aktif), seperti argumen makeToolboxXML. */
export interface ToolboxDefaults {
  costumeName?: string;
  backdropName?: string;
  soundName?: string;
  locale?: BlockLocale;
  /** Posisi sprite untuk shadow go to x/y & glide (scratch-gui memperbarui movex/movey). */
  x?: number;
  y?: number;
}

type Entry = ToolboxCategory["blocks"][number];
const SEP = 36;

const num = (value: string | number, shadow = "math_number"): { shadow: string; field: string; value: string | number } => ({
  shadow,
  field: "NUM",
  value,
});
const text = (value: string): { shadow: string; field: string; value: string } => ({ shadow: "text", field: "TEXT", value });
const menu = (shadow: string, field: string, value = ""): { shadow: string; field: string; value: string } => ({ shadow, field, value });

/** Tandai blok terakhir dengan gap separator. */
function sep(list: Entry[]): void {
  const last = list[list.length - 1];
  if (last && "opcode" in last) last.gap = SEP;
}

function b(opcode: string, inputs?: ToolboxBlock["inputs"], extra: Partial<ToolboxBlock> & { id?: string } = {}): ToolboxBlock {
  return { opcode, ...(inputs ? { inputs } : {}), ...extra };
}

function motion(isStage: boolean, targetId: string | null, d: ToolboxDefaults): Entry[] {
  const L = d.locale ?? "id";
  if (isStage) return [{ label: msg("MOTION_STAGE_SELECTED", L) }];
  const x = String(Math.round(d.x ?? 0));
  const y = String(Math.round(d.y ?? 0));
  const out: Entry[] = [
    b("motion_movesteps", { STEPS: num(10) }),
    b("motion_turnright", { DEGREES: num(15) }),
    b("motion_turnleft", { DEGREES: num(15) }),
  ];
  sep(out);
  out.push(
    b("motion_goto", { TO: menu("motion_goto_menu", "TO") }),
    b("motion_gotoxy", { X: num(x), Y: num(y) }),
    b("motion_glideto", { SECS: num(1), TO: menu("motion_glideto_menu", "TO") }),
    b("motion_glidesecstoxy", { SECS: num(1), X: num(x), Y: num(y) }),
  );
  sep(out);
  out.push(b("motion_pointindirection", { DIRECTION: num(90, "math_angle") }), b("motion_pointtowards", { TOWARDS: menu("motion_pointtowards_menu", "TOWARDS") }));
  sep(out);
  out.push(
    b("motion_changexby", { DX: num(10) }),
    b("motion_setx", { X: num(x) }),
    b("motion_changeyby", { DY: num(10) }),
    b("motion_sety", { Y: num(y) }),
  );
  sep(out);
  out.push(b("motion_ifonedgebounce"));
  sep(out);
  out.push(b("motion_setrotationstyle"));
  sep(out);
  void targetId;
  out.push(b("motion_xposition"), b("motion_yposition"), b("motion_direction"));
  return out;
}

function looks(isStage: boolean, d: ToolboxDefaults): Entry[] {
  const L = d.locale ?? "id";
  const hello = msg("LOOKS_HELLO", L);
  const hmm = msg("LOOKS_HMM", L);
  const backdrop = d.backdropName ?? "";
  const out: Entry[] = [];
  if (!isStage) {
    out.push(
      b("looks_sayforsecs", { MESSAGE: text(hello), SECS: num(2) }),
      b("looks_say", { MESSAGE: text(hello) }),
      b("looks_thinkforsecs", { MESSAGE: text(hmm), SECS: num(2) }),
      b("looks_think", { MESSAGE: text(hmm) }),
    );
    sep(out);
  }
  if (isStage) {
    out.push(
      b("looks_switchbackdropto", { BACKDROP: menu("looks_backdrops", "BACKDROP", backdrop) }),
      b("looks_switchbackdroptoandwait", { BACKDROP: menu("looks_backdrops", "BACKDROP", backdrop) }),
      b("looks_nextbackdrop"),
    );
  } else {
    out.push(
      b("looks_switchcostumeto", { COSTUME: menu("looks_costume", "COSTUME", d.costumeName ?? "") }),
      b("looks_nextcostume"),
      b("looks_switchbackdropto", { BACKDROP: menu("looks_backdrops", "BACKDROP", backdrop) }),
      b("looks_nextbackdrop"),
    );
    sep(out);
    out.push(b("looks_changesizeby", { CHANGE: num(10) }), b("looks_setsizeto", { SIZE: num(100) }));
  }
  sep(out);
  out.push(b("looks_changeeffectby", { CHANGE: num(25) }), b("looks_seteffectto", { VALUE: num(0) }), b("looks_cleargraphiceffects"));
  sep(out);
  if (!isStage) {
    out.push(b("looks_show"), b("looks_hide"));
    sep(out);
    out.push(b("looks_gotofrontback"), b("looks_goforwardbackwardlayers", { NUM: num(1, "math_integer") }));
  }
  if (isStage) out.push(b("looks_backdropnumbername"));
  else out.push(b("looks_costumenumbername"), b("looks_backdropnumbername"), b("looks_size"));
  return out;
}

function sound(d: ToolboxDefaults): Entry[] {
  const s = d.soundName ?? "";
  const out: Entry[] = [
    b("sound_playuntildone", { SOUND_MENU: menu("sound_sounds_menu", "SOUND_MENU", s) }),
    b("sound_play", { SOUND_MENU: menu("sound_sounds_menu", "SOUND_MENU", s) }),
    b("sound_stopallsounds"),
  ];
  sep(out);
  out.push(b("sound_changeeffectby", { VALUE: num(10) }), b("sound_seteffectto", { VALUE: num(100) }), b("sound_cleareffects"));
  sep(out);
  out.push(b("sound_changevolumeby", { VOLUME: num(-10) }), b("sound_setvolumeto", { VOLUME: num(100) }), b("sound_volume"));
  return out;
}

function events(isStage: boolean): Entry[] {
  const out: Entry[] = [
    b("event_whenflagclicked"),
    b("event_whenkeypressed"),
    b(isStage ? "event_whenstageclicked" : "event_whenthisspriteclicked"),
    b("event_whenbackdropswitchesto"),
  ];
  sep(out);
  out.push(b("event_whengreaterthan", { VALUE: num(10) }));
  sep(out);
  out.push(
    b("event_whenbroadcastreceived"),
    b("event_broadcast", { BROADCAST_INPUT: menu("event_broadcast_menu", "BROADCAST_OPTION") }),
    b("event_broadcastandwait", { BROADCAST_INPUT: menu("event_broadcast_menu", "BROADCAST_OPTION") }),
  );
  return out;
}

function control(isStage: boolean): Entry[] {
  const out: Entry[] = [b("control_wait", { DURATION: num(1, "math_positive_number") })];
  sep(out);
  out.push(b("control_repeat", { TIMES: num(10, "math_whole_number") }), b("control_forever"));
  sep(out);
  out.push(b("control_if"), b("control_if_else"), b("control_wait_until"), b("control_repeat_until"));
  sep(out);
  out.push(b("control_stop"));
  sep(out);
  const cloneOf = b("control_create_clone_of", { CLONE_OPTION: menu("control_create_clone_of_menu", "CLONE_OPTION") });
  if (isStage) out.push(cloneOf);
  else out.push(b("control_start_as_clone"), cloneOf, b("control_delete_this_clone"));
  return out;
}

function sensing(isStage: boolean, d: ToolboxDefaults): Entry[] {
  const L = d.locale ?? "id";
  const out: Entry[] = [];
  if (!isStage) {
    out.push(
      b("sensing_touchingobject", { TOUCHINGOBJECTMENU: menu("sensing_touchingobjectmenu", "TOUCHINGOBJECTMENU") }),
      b("sensing_touchingcolor", { COLOR: menu("colour_picker", "COLOUR") }),
      b("sensing_coloristouchingcolor", { COLOR: menu("colour_picker", "COLOUR"), COLOR2: menu("colour_picker", "COLOUR") }),
      b("sensing_distanceto", { DISTANCETOMENU: menu("sensing_distancetomenu", "DISTANCETOMENU") }),
    );
    sep(out);
  }
  out.push(b("sensing_askandwait", { QUESTION: text(msg("SENSING_ASK_TEXT", L)) }), b("sensing_answer"));
  sep(out);
  out.push(
    b("sensing_keypressed", { KEY_OPTION: menu("sensing_keyoptions", "KEY_OPTION") }),
    b("sensing_mousedown"),
    b("sensing_mousex"),
    b("sensing_mousey"),
  );
  if (!isStage) {
    sep(out);
    out.push(b("sensing_setdragmode"));
  }
  sep(out);
  out.push(b("sensing_loudness"));
  sep(out);
  out.push(b("sensing_timer"), b("sensing_resettimer"));
  sep(out);
  out.push(b("sensing_of", { OBJECT: menu("sensing_of_object_menu", "OBJECT") }));
  sep(out);
  out.push(b("sensing_current"), b("sensing_dayssince2000"));
  sep(out);
  out.push(b("sensing_username"));
  return out;
}

function operators(d: ToolboxDefaults): Entry[] {
  const L = d.locale ?? "id";
  const apple = msg("OPERATORS_JOIN_APPLE", L);
  const banana = msg("OPERATORS_JOIN_BANANA", L);
  const letter = msg("OPERATORS_LETTEROF_APPLE", L);
  const two = (op: string): ToolboxBlock => b(op, { NUM1: num(""), NUM2: num("") });
  const cmp = (op: string): ToolboxBlock => b(op, { OPERAND1: text(""), OPERAND2: text("50") });
  const out: Entry[] = [two("operator_add"), two("operator_subtract"), two("operator_multiply"), two("operator_divide")];
  sep(out);
  out.push(b("operator_random", { FROM: num(1), TO: num(10) }));
  sep(out);
  out.push(cmp("operator_gt"), cmp("operator_lt"), cmp("operator_equals"));
  sep(out);
  out.push(b("operator_and"), b("operator_or"), b("operator_not"));
  sep(out);
  out.push(
    b("operator_join", { STRING1: text(`${apple} `), STRING2: text(banana) }),
    b("operator_letter_of", { LETTER: num(1, "math_whole_number"), STRING: text(apple) }),
    b("operator_length", { STRING: text(apple) }),
    b("operator_contains", { STRING1: text(apple), STRING2: text(letter) }),
  );
  sep(out);
  out.push(two("operator_mod"), b("operator_round", { NUM: num("") }));
  sep(out);
  out.push(b("operator_mathop", { NUM: num("") }));
  return out;
}

export function makeDefaultToolbox(isStage: boolean, targetId: string | null, defaults: ToolboxDefaults = {}): ToolboxCategory[] {
  const L = defaults.locale ?? "id";
  const C = CATEGORY_COLOURS;
  return [
    { id: "motion", name: msg("CATEGORY_MOTION", L), colours: C.motion, blocks: motion(isStage, targetId, defaults) },
    { id: "looks", name: msg("CATEGORY_LOOKS", L), colours: C.looks, blocks: looks(isStage, defaults) },
    { id: "sound", name: msg("CATEGORY_SOUND", L), colours: C.sounds, blocks: sound(defaults) },
    { id: "events", name: msg("CATEGORY_EVENTS", L), colours: C.event, blocks: events(isStage) },
    { id: "control", name: msg("CATEGORY_CONTROL", L), colours: C.control, blocks: control(isStage) },
    { id: "sensing", name: msg("CATEGORY_SENSING", L), colours: C.sensing, blocks: sensing(isStage, defaults) },
    { id: "operators", name: msg("CATEGORY_OPERATORS", L), colours: C.operators, blocks: operators(defaults) },
    { id: "variables", name: msg("CATEGORY_VARIABLES", L), colours: C.data, blocks: [], custom: "VARIABLE" },
    { id: "myBlocks", name: msg("CATEGORY_MYBLOCKS", L), colours: C.more, blocks: [], custom: "PROCEDURE" },
  ];
}
