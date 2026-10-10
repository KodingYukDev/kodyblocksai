/**
 * Blok scratch-blocks yang init()-nya tidak memakai jsonInit, ditulis ulang sebagai JSON setara.
 * control_stop (blocks_vertical/control.js): label "stop" + dropdown STOP_OPTION dalam kotak,
 * hanya previousStatement; mutation hasnext="true" menambah nextStatement (opsi "other scripts").
 */
import type { ScratchBlockJson } from "./json-types";

export const BLOCK_OVERRIDES: Record<string, ScratchBlockJson> = {
  control_stop: {
    message0: "%{BKY_CONTROL_STOP} %1",
    args0: [
      {
        type: "field_dropdown",
        name: "STOP_OPTION",
        options: [
          ["%{BKY_CONTROL_STOP_ALL}", "all"],
          ["%{BKY_CONTROL_STOP_THIS}", "this script"],
          ["%{BKY_CONTROL_STOP_OTHER}", "other scripts in sprite"],
        ],
      },
    ],
    category: "control",
    extensions: ["colours_control", "shape_end"],
  },
  // Menu Scratch 2 tersembunyi: scratch-vm sound.js punya primitive beatsMenu/effectsMenu, scratch-blocks
  // tidak mendefinisikan bloknya. Bentuk disamakan dengan sound_sounds_menu agar project lama tetap tampil.
  sound_beats_menu: menuShadow("BEATS"),
  sound_effects_menu: menuShadow("EFFECT"),
};

function menuShadow(field: string): ScratchBlockJson {
  return {
    message0: "%1",
    args0: [{ type: "field_dropdown", name: field, options: [] }],
    colour: "#C94FC9",
    colourSecondary: "#C94FC9",
    colourTertiary: "#BD42BD",
    colourQuaternary: "#BD42BD",
    extensions: ["output_string"],
  };
}

/** Opcode procedures yang input/labelnya dibangun dari mutation.proccode (ProcedureUtils.createAllInputs_). */
export const DYNAMIC_PROCEDURE_OPCODES = new Set(["procedures_call", "procedures_prototype", "procedures_declaration"]);
