/**
 * Katalog LENGKAP opcode: Scratch 3 core + pen + music + ekstensi AI KodyBlocks.
 * Sumber: scratch-vm 4.8.102 (BSD-3) src/blocks/*.js getPrimitives/getHats/getMonitored dan
 * scratch-blocks blocks_vertical/*.js. tests/parity/opcode-coverage.test.ts mencocokkan daftar ini
 * dengan scratch-vm yang terpasang.
 *
 * owner = file yang WAJIB mengimplementasikan opcode tsb.
 *  - primitive core  -> packages/engine/src/blocks/<kategori>.ts
 *  - shadow / menu   -> packages/blocks-ui/src/definitions/<kategori>.ts (engine membaca nilai field-nya)
 *  - ekstensi        -> packages/ext-pen | ext-music | ai
 */

export type OpcodeCategory =
  | "motion"
  | "looks"
  | "sound"
  | "events"
  | "control"
  | "sensing"
  | "operators"
  | "variables"
  | "lists"
  | "myBlocks"
  | "pen"
  | "music"
  | "ai"
  | "shadow";

/**
 * Bentuk blok di editor:
 * command = tumpukan biasa; cap = tidak bisa disambung di bawah (stop all, delete this clone, forever);
 * c = punya SUBSTACK; c2 = SUBSTACK + SUBSTACK2 (if-else); hat; reporter (bulat); boolean (heksagon);
 * shadow = blok bayangan/menu (angka, teks, dropdown).
 */
export type BlockShape = "command" | "cap" | "c" | "c2" | "c-cap" | "hat" | "reporter" | "boolean" | "shadow";

export interface OpcodeSpec {
  opcode: string;
  category: OpcodeCategory;
  shape: BlockShape;
  owner: string;
  /** scratch-vm mendaftarkan fungsi primitive untuk opcode ini (bukan hanya shadow). */
  vmPrimitive: boolean;
  /** Tidak tampil di palet default Scratch (tetap harus jalan bila ada di project). */
  hidden?: boolean;
  /** Punya checkbox monitor di palet. */
  monitorable?: boolean;
  /** Hat edge-activated. */
  edgeActivated?: boolean;
  /** Nilai HatMetadata.restartExistingThreads (hanya untuk hat). */
  restartExistingThreads?: boolean;
}

const E = "packages/engine/src/blocks/";
const U = "packages/blocks-ui/src/definitions/";

type Row = [opcode: string, shape: BlockShape, flags?: string];

/**
 * flags: h=hidden, m=monitorable, e=edgeActivated, r=restartExistingThreads,
 * s=shadow tanpa primitive, p=hat yang JUGA punya primitive predikat di scratch-vm.
 */
function rows(category: OpcodeCategory, owner: string, list: Row[]): OpcodeSpec[] {
  return list.map(([opcode, shape, flags = ""]) => {
    const vmPrimitive = !flags.includes("s") && (shape !== "hat" || flags.includes("p"));
    const spec: OpcodeSpec = { opcode, category, shape, owner, vmPrimitive };
    if (flags.includes("h")) spec.hidden = true;
    if (flags.includes("m")) spec.monitorable = true;
    if (flags.includes("e")) spec.edgeActivated = true;
    if (shape === "hat") spec.restartExistingThreads = flags.includes("r");
    return spec;
  });
}

export const CORE_OPCODES: readonly OpcodeSpec[] = [
  ...rows("motion", E + "motion.ts", [
    ["motion_movesteps", "command"],
    ["motion_turnright", "command"],
    ["motion_turnleft", "command"],
    ["motion_goto", "command"],
    ["motion_gotoxy", "command"],
    ["motion_glideto", "command"],
    ["motion_glidesecstoxy", "command"],
    ["motion_pointindirection", "command"],
    ["motion_pointtowards", "command"],
    ["motion_changexby", "command"],
    ["motion_setx", "command"],
    ["motion_changeyby", "command"],
    ["motion_sety", "command"],
    ["motion_ifonedgebounce", "command"],
    ["motion_setrotationstyle", "command"],
    ["motion_xposition", "reporter", "m"],
    ["motion_yposition", "reporter", "m"],
    ["motion_direction", "reporter", "m"],
    ["motion_scroll_right", "command", "h"],
    ["motion_scroll_up", "command", "h"],
    ["motion_align_scene", "command", "h"],
    ["motion_xscroll", "reporter", "h"],
    ["motion_yscroll", "reporter", "h"],
  ]),
  ...rows("looks", E + "looks.ts", [
    ["looks_sayforsecs", "command"],
    ["looks_say", "command"],
    ["looks_thinkforsecs", "command"],
    ["looks_think", "command"],
    ["looks_switchcostumeto", "command"],
    ["looks_nextcostume", "command"],
    ["looks_switchbackdropto", "command"],
    ["looks_switchbackdroptoandwait", "command"],
    ["looks_nextbackdrop", "command"],
    ["looks_changesizeby", "command"],
    ["looks_setsizeto", "command"],
    ["looks_changeeffectby", "command"],
    ["looks_seteffectto", "command"],
    ["looks_cleargraphiceffects", "command"],
    ["looks_show", "command"],
    ["looks_hide", "command"],
    ["looks_gotofrontback", "command"],
    ["looks_goforwardbackwardlayers", "command"],
    ["looks_costumenumbername", "reporter", "m"],
    ["looks_backdropnumbername", "reporter", "m"],
    ["looks_size", "reporter", "m"],
    ["looks_hideallsprites", "command", "h"],
    ["looks_changestretchby", "command", "h"],
    ["looks_setstretchto", "command", "h"],
  ]),
  ...rows("sound", E + "sound.ts", [
    ["sound_playuntildone", "command"],
    ["sound_play", "command"],
    ["sound_stopallsounds", "command"],
    ["sound_changeeffectby", "command"],
    ["sound_seteffectto", "command"],
    ["sound_cleareffects", "command"],
    ["sound_changevolumeby", "command"],
    ["sound_setvolumeto", "command"],
    ["sound_volume", "reporter", "m"],
    // scratch-vm mendaftarkan primitive untuk tiga menu ini (mengembalikan nilai field).
    ["sound_sounds_menu", "shadow"],
    ["sound_beats_menu", "shadow", "h"],
    ["sound_effects_menu", "shadow", "h"],
  ]),
  ...rows("events", E + "event.ts", [
    ["event_whenflagclicked", "hat", "r"],
    ["event_whenkeypressed", "hat"],
    ["event_whenthisspriteclicked", "hat", "r"],
    ["event_whenstageclicked", "hat", "r"],
    ["event_whenbackdropswitchesto", "hat", "r"],
    ["event_whengreaterthan", "hat", "ep"],
    ["event_whenbroadcastreceived", "hat", "r"],
    ["event_whentouchingobject", "hat", "ehp"],
    ["event_broadcast", "command"],
    ["event_broadcastandwait", "command"],
  ]),
  ...rows("control", E + "control.ts", [
    ["control_wait", "command"],
    ["control_repeat", "c"],
    ["control_forever", "c-cap"],
    ["control_if", "c"],
    ["control_if_else", "c2"],
    ["control_wait_until", "command"],
    ["control_repeat_until", "c"],
    ["control_while", "c", "h"],
    ["control_for_each", "c", "h"],
    ["control_stop", "cap"],
    ["control_start_as_clone", "hat"],
    ["control_create_clone_of", "command"],
    ["control_delete_this_clone", "cap"],
    ["control_get_counter", "reporter", "h"],
    ["control_incr_counter", "command", "h"],
    ["control_clear_counter", "command", "h"],
    ["control_all_at_once", "c", "h"],
  ]),
  ...rows("sensing", E + "sensing.ts", [
    ["sensing_touchingobject", "boolean"],
    ["sensing_touchingcolor", "boolean"],
    ["sensing_coloristouchingcolor", "boolean"],
    ["sensing_distanceto", "reporter"],
    ["sensing_askandwait", "command"],
    ["sensing_answer", "reporter", "m"],
    ["sensing_keypressed", "boolean"],
    ["sensing_mousedown", "boolean"],
    ["sensing_mousex", "reporter"],
    ["sensing_mousey", "reporter"],
    ["sensing_setdragmode", "command"],
    ["sensing_loudness", "reporter", "m"],
    ["sensing_timer", "reporter", "m"],
    ["sensing_resettimer", "command"],
    ["sensing_of", "reporter"],
    ["sensing_current", "reporter", "m"],
    ["sensing_dayssince2000", "reporter"],
    ["sensing_username", "reporter", "m"],
    ["sensing_loud", "boolean", "h"],
    ["sensing_userid", "reporter", "h"],
  ]),
  ...rows("operators", E + "operators.ts", [
    ["operator_add", "reporter"],
    ["operator_subtract", "reporter"],
    ["operator_multiply", "reporter"],
    ["operator_divide", "reporter"],
    ["operator_random", "reporter"],
    ["operator_gt", "boolean"],
    ["operator_lt", "boolean"],
    ["operator_equals", "boolean"],
    ["operator_and", "boolean"],
    ["operator_or", "boolean"],
    ["operator_not", "boolean"],
    ["operator_join", "reporter"],
    ["operator_letter_of", "reporter"],
    ["operator_length", "reporter"],
    ["operator_contains", "boolean"],
    ["operator_mod", "reporter"],
    ["operator_round", "reporter"],
    ["operator_mathop", "reporter"],
  ]),
  ...rows("variables", E + "data.ts", [
    ["data_variable", "reporter", "m"],
    ["data_setvariableto", "command"],
    ["data_changevariableby", "command"],
    ["data_showvariable", "command"],
    ["data_hidevariable", "command"],
  ]),
  ...rows("lists", E + "data.ts", [
    ["data_listcontents", "reporter", "m"],
    ["data_addtolist", "command"],
    ["data_deleteoflist", "command"],
    ["data_deletealloflist", "command"],
    ["data_insertatlist", "command"],
    ["data_replaceitemoflist", "command"],
    ["data_itemoflist", "reporter"],
    ["data_itemnumoflist", "reporter"],
    ["data_lengthoflist", "reporter"],
    ["data_listcontainsitem", "boolean"],
    ["data_showlist", "command"],
    ["data_hidelist", "command"],
  ]),
  ...rows("myBlocks", E + "procedures.ts", [
    ["procedures_definition", "hat", "p"],
    ["procedures_call", "command"],
    ["argument_reporter_string_number", "reporter"],
    ["argument_reporter_boolean", "boolean"],
  ]),
];

/** Shadow & menu: tidak punya primitive di scratch-vm; execute membaca field tunggalnya. */
export const SHADOW_OPCODES: readonly OpcodeSpec[] = [
  ...rows("shadow", U + "shadows.ts", [
    ["math_number", "shadow", "s"],
    ["math_integer", "shadow", "s"],
    ["math_whole_number", "shadow", "s"],
    ["math_positive_number", "shadow", "s"],
    ["math_angle", "shadow", "s"],
    ["text", "shadow", "s"],
    ["colour_picker", "shadow", "s"],
    ["note", "shadow", "s"],
    ["matrix", "shadow", "s"],
  ]),
  ...rows("motion", U + "motion.ts", [
    ["motion_goto_menu", "shadow", "s"],
    ["motion_glideto_menu", "shadow", "s"],
    ["motion_pointtowards_menu", "shadow", "s"],
  ]),
  ...rows("looks", U + "looks.ts", [
    ["looks_costume", "shadow", "s"],
    ["looks_backdrops", "shadow", "s"],
  ]),
  ...rows("events", U + "events.ts", [
    ["event_broadcast_menu", "shadow", "s"],
    ["event_touchingobjectmenu", "shadow", "s"],
  ]),
  ...rows("control", U + "control.ts", [["control_create_clone_of_menu", "shadow", "s"]]),
  ...rows("sensing", U + "sensing.ts", [
    ["sensing_touchingobjectmenu", "shadow", "s"],
    ["sensing_distancetomenu", "shadow", "s"],
    ["sensing_keyoptions", "shadow", "s"],
    ["sensing_of_object_menu", "shadow", "s"],
  ]),
  ...rows("lists", U + "data.ts", [
    ["data_listindexall", "shadow", "s"],
    ["data_listindexrandom", "shadow", "s"],
  ]),
  ...rows("myBlocks", U + "procedures.ts", [
    ["procedures_prototype", "shadow", "s"],
    ["procedures_declaration", "shadow", "s"],
    ["argument_editor_boolean", "shadow", "s"],
    ["argument_editor_string_number", "shadow", "s"],
  ]),
];

const PEN = "packages/ext-pen/src/pen.ts";
export const PEN_OPCODES: readonly OpcodeSpec[] = rows("pen", PEN, [
  ["pen_clear", "command"],
  ["pen_stamp", "command"],
  ["pen_penDown", "command"],
  ["pen_penUp", "command"],
  ["pen_setPenColorToColor", "command"],
  ["pen_changePenColorParamBy", "command"],
  ["pen_setPenColorParamTo", "command"],
  ["pen_changePenSizeBy", "command"],
  ["pen_setPenSizeTo", "command"],
  ["pen_setPenShadeToNumber", "command", "h"],
  ["pen_changePenShadeBy", "command", "h"],
  ["pen_setPenHueToNumber", "command", "h"],
  ["pen_changePenHueBy", "command", "h"],
  ["pen_menu_colorParam", "shadow", "s"],
]);

const MUSIC = "packages/ext-music/src/music.ts";
export const MUSIC_OPCODES: readonly OpcodeSpec[] = rows("music", MUSIC, [
  ["music_playDrumForBeats", "command"],
  ["music_midiPlayDrumForBeats", "command", "h"],
  ["music_restForBeats", "command"],
  ["music_playNoteForBeats", "command"],
  ["music_setInstrument", "command"],
  ["music_midiSetInstrument", "command", "h"],
  ["music_setTempo", "command"],
  ["music_changeTempo", "command"],
  ["music_getTempo", "reporter", "m"],
  ["music_menu_DRUM", "shadow", "s"],
  ["music_menu_INSTRUMENT", "shadow", "s"],
]);

const AI = "packages/ai/src/extensions/";
/** Blok kamera yang dimiliki setiap ekstensi AI visi (seperti PictoBlox). */
const visionCommon = (id: string): Row[] => [
  [`${id}_videoToggle`, "command"],
  [`${id}_setVideoTransparency`, "command"],
  [`${id}_analyse`, "command"],
  [`${id}_menu_VIDEO_STATE`, "shadow", "s"],
  [`${id}_menu_SOURCE`, "shadow", "s"],
];

export const AI_OPCODES: readonly OpcodeSpec[] = [
  ...rows("ai", AI + "face.ts", [
    ...visionCommon("aiFace"),
    ["aiFace_faceCount", "reporter", "m"],
    ["aiFace_isFaceDetected", "boolean"],
    ["aiFace_faceAttribute", "reporter"],
    ["aiFace_landmarkPosition", "reporter"],
    ["aiFace_expression", "reporter"],
    ["aiFace_whenFaceDetected", "hat", "ep"],
    ["aiFace_menu_ATTRIBUTE", "shadow", "s"],
    ["aiFace_menu_LANDMARK", "shadow", "s"],
    ["aiFace_menu_AXIS", "shadow", "s"],
  ]),
  ...rows("ai", AI + "hand.ts", [
    ...visionCommon("aiHand"),
    ["aiHand_handCount", "reporter", "m"],
    ["aiHand_isHandDetected", "boolean"],
    ["aiHand_landmarkPosition", "reporter"],
    ["aiHand_gesture", "reporter"],
    ["aiHand_isGesture", "boolean"],
    ["aiHand_whenGesture", "hat", "ep"],
    ["aiHand_menu_LANDMARK", "shadow", "s"],
    ["aiHand_menu_AXIS", "shadow", "s"],
    ["aiHand_menu_GESTURE", "shadow", "s"],
  ]),
  ...rows("ai", AI + "pose.ts", [
    ...visionCommon("aiPose"),
    ["aiPose_isPoseDetected", "boolean"],
    ["aiPose_keypointPosition", "reporter"],
    ["aiPose_menu_KEYPOINT", "shadow", "s"],
    ["aiPose_menu_AXIS", "shadow", "s"],
  ]),
  ...rows("ai", AI + "image.ts", [
    ...visionCommon("aiImage"),
    ["aiImage_classLabel", "reporter", "m"],
    ["aiImage_classConfidence", "reporter"],
    ["aiImage_isClass", "boolean"],
    ["aiImage_whenClass", "hat", "ep"],
    ["aiImage_menu_CLASS", "shadow", "s"],
  ]),
  ...rows("ai", AI + "object.ts", [
    ...visionCommon("aiObject"),
    ["aiObject_objectCount", "reporter", "m"],
    ["aiObject_isObjectDetected", "boolean"],
    ["aiObject_objectAttribute", "reporter"],
    ["aiObject_menu_OBJECT", "shadow", "s"],
    ["aiObject_menu_ATTRIBUTE", "shadow", "s"],
  ]),
  ...rows("ai", AI + "text.ts", [
    ["aiText_classifyText", "reporter"],
    ["aiText_isTextClass", "boolean"],
    ["aiText_textConfidence", "reporter"],
    ["aiText_menu_CLASS", "shadow", "s"],
  ]),
  ...rows("ai", AI + "audio.ts", [
    ["aiAudio_startListening", "command"],
    ["aiAudio_stopListening", "command"],
    ["aiAudio_soundClass", "reporter", "m"],
    ["aiAudio_isSoundClass", "boolean"],
    ["aiAudio_whenSoundClass", "hat", "ep"],
    ["aiAudio_menu_CLASS", "shadow", "s"],
  ]),
];

export const ALL_OPCODES: readonly OpcodeSpec[] = [
  ...CORE_OPCODES,
  ...SHADOW_OPCODES,
  ...PEN_OPCODES,
  ...MUSIC_OPCODES,
  ...AI_OPCODES,
];

const byOpcode = new Map(ALL_OPCODES.map((s) => [s.opcode, s]));

export function getOpcodeSpec(opcode: string): OpcodeSpec | undefined {
  return byOpcode.get(opcode);
}

/** Opcode yang punya primitive di scratch-vm core (dipakai tes parity). */
export function coreVmPrimitiveOpcodes(): string[] {
  return CORE_OPCODES.filter((s) => s.vmPrimitive).map((s) => s.opcode);
}

/** Hat core beserta metadata (dipakai tes parity & runtime). */
export function coreHatOpcodes(): OpcodeSpec[] {
  return CORE_OPCODES.filter((s) => s.shape === "hat" && s.opcode !== "procedures_definition");
}
