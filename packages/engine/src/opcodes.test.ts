import { describe, expect, it } from "vitest";
import {
  AI_OPCODES,
  ALL_OPCODES,
  CORE_OPCODES,
  MUSIC_OPCODES,
  PEN_OPCODES,
  SHADOW_OPCODES,
  coreHatOpcodes,
  coreVmPrimitiveOpcodes,
  getOpcodeSpec,
} from "./opcodes";

describe("katalog opcode", () => {
  it("tidak ada opcode ganda", () => {
    const seen = new Set<string>();
    const dupes = ALL_OPCODES.filter((s) => (seen.has(s.opcode) ? true : (seen.add(s.opcode), false)));
    expect(dupes.map((d) => d.opcode)).toEqual([]);
  });

  it("setiap opcode punya owner file yang sesuai kategori", () => {
    for (const s of CORE_OPCODES) expect(s.owner).toMatch(/^packages\/engine\/src\/blocks\/[a-z]+\.ts$/);
    for (const s of SHADOW_OPCODES) expect(s.owner).toMatch(/^packages\/blocks-ui\/src\/definitions\/[a-z]+\.ts$/);
    for (const s of PEN_OPCODES) expect(s.opcode.startsWith("pen_")).toBe(true);
    for (const s of MUSIC_OPCODES) expect(s.opcode.startsWith("music_")).toBe(true);
    for (const s of AI_OPCODES) expect(s.owner).toMatch(/^packages\/ai\/src\/extensions\/[a-z]+\.ts$/);
  });

  it("jumlah primitive core sama dengan scratch-vm 4.8/5.0 (138)", () => {
    expect(coreVmPrimitiveOpcodes()).toHaveLength(138);
  });

  it("metadata hat sama dengan scratch-vm getHats()", () => {
    const hats = Object.fromEntries(
      coreHatOpcodes().map((s) => [s.opcode, { edge: !!s.edgeActivated, restart: !!s.restartExistingThreads }]),
    );
    expect(hats).toEqual({
      event_whenflagclicked: { edge: false, restart: true },
      event_whenkeypressed: { edge: false, restart: false },
      event_whenthisspriteclicked: { edge: false, restart: true },
      event_whenstageclicked: { edge: false, restart: true },
      event_whenbackdropswitchesto: { edge: false, restart: true },
      event_whengreaterthan: { edge: true, restart: false },
      event_whenbroadcastreceived: { edge: false, restart: true },
      event_whentouchingobject: { edge: true, restart: false },
      control_start_as_clone: { edge: false, restart: false },
    });
  });

  it("menu ekstensi memakai pola <id>_menu_<nama>", () => {
    for (const s of [...PEN_OPCODES, ...MUSIC_OPCODES, ...AI_OPCODES]) {
      if (s.shape === "shadow") expect(s.opcode).toMatch(/^[a-zA-Z]+_menu_[A-Za-z_]+$/);
    }
  });

  it("getOpcodeSpec menemukan opcode", () => {
    expect(getOpcodeSpec("motion_movesteps")?.shape).toBe("command");
    expect(getOpcodeSpec("control_forever")?.shape).toBe("c-cap");
    expect(getOpcodeSpec("tidak_ada")).toBeUndefined();
  });
});
