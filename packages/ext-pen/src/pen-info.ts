/**
 * getInfo() ekstensi Pen. Struktur, opcode, argumen, default, filter, dan hideFromPalette
 * mengikuti scratch-vm 4.8.102 scratch3_pen getInfo(); teks bisa Indonesia (default) / Inggris.
 */
import type { ExtensionInfo } from "@kody/engine";
import { PEN_BLOCK_ICON_URI } from "./icons";
import { ColorParam } from "./pen-state";

export const PEN_EXTENSION_ID = "pen";

export type PenLocale = "id" | "en";

interface PenMessages {
  categoryName: string;
  clear: string;
  stamp: string;
  penDown: string;
  penUp: string;
  setColor: string;
  changeColorParam: string;
  setColorParam: string;
  changeSize: string;
  setSize: string;
  setShade: string;
  changeShade: string;
  setHue: string;
  changeHue: string;
  menuColor: string;
  menuSaturation: string;
  menuBrightness: string;
  menuTransparency: string;
}

/** Teks Inggris = default formatMessage di scratch-vm. */
const EN: PenMessages = {
  categoryName: "Pen",
  clear: "erase all",
  stamp: "stamp",
  penDown: "pen down",
  penUp: "pen up",
  setColor: "set pen color to [COLOR]",
  changeColorParam: "change pen [COLOR_PARAM] by [VALUE]",
  setColorParam: "set pen [COLOR_PARAM] to [VALUE]",
  changeSize: "change pen size by [SIZE]",
  setSize: "set pen size to [SIZE]",
  setShade: "set pen shade to [SHADE]",
  changeShade: "change pen shade by [SHADE]",
  setHue: "set pen color to [HUE]",
  changeHue: "change pen color by [HUE]",
  menuColor: "color",
  menuSaturation: "saturation",
  menuBrightness: "brightness",
  menuTransparency: "transparency",
};

const ID: PenMessages = {
  categoryName: "Pena",
  clear: "hapus semua",
  stamp: "cap",
  penDown: "pena turun",
  penUp: "pena naik",
  setColor: "atur warna pena ke [COLOR]",
  changeColorParam: "ubah [COLOR_PARAM] pena sebesar [VALUE]",
  setColorParam: "atur [COLOR_PARAM] pena ke [VALUE]",
  changeSize: "ubah ukuran pena sebesar [SIZE]",
  setSize: "atur ukuran pena ke [SIZE]",
  setShade: "atur bayangan pena ke [SHADE]",
  changeShade: "ubah bayangan pena sebesar [SHADE]",
  setHue: "atur warna pena ke [HUE]",
  changeHue: "ubah warna pena sebesar [HUE]",
  menuColor: "warna",
  menuSaturation: "saturasi",
  menuBrightness: "kecerahan",
  menuTransparency: "transparansi",
};

export function getPenInfo(locale: PenLocale = "id"): ExtensionInfo {
  const m = locale === "en" ? EN : ID;
  return {
    id: PEN_EXTENSION_ID,
    name: m.categoryName,
    // Warna default ekstensi Scratch 3 (extension-manager / scratch-blocks colours.pen).
    color1: "#0FBD8C",
    color2: "#0DA57A",
    color3: "#0B8E69",
    blockIconURI: PEN_BLOCK_ICON_URI,
    blocks: [
      { opcode: "clear", blockType: "command", text: m.clear },
      { opcode: "stamp", blockType: "command", text: m.stamp, filter: ["sprite"] },
      { opcode: "penDown", blockType: "command", text: m.penDown, filter: ["sprite"] },
      { opcode: "penUp", blockType: "command", text: m.penUp, filter: ["sprite"] },
      {
        opcode: "setPenColorToColor",
        blockType: "command",
        text: m.setColor,
        arguments: { COLOR: { type: "color" } },
        filter: ["sprite"],
      },
      {
        opcode: "changePenColorParamBy",
        blockType: "command",
        text: m.changeColorParam,
        arguments: {
          COLOR_PARAM: { type: "string", menu: "colorParam", defaultValue: ColorParam.COLOR },
          VALUE: { type: "number", defaultValue: 10 },
        },
        filter: ["sprite"],
      },
      {
        opcode: "setPenColorParamTo",
        blockType: "command",
        text: m.setColorParam,
        arguments: {
          COLOR_PARAM: { type: "string", menu: "colorParam", defaultValue: ColorParam.COLOR },
          VALUE: { type: "number", defaultValue: 50 },
        },
        filter: ["sprite"],
      },
      {
        opcode: "changePenSizeBy",
        blockType: "command",
        text: m.changeSize,
        arguments: { SIZE: { type: "number", defaultValue: 1 } },
        filter: ["sprite"],
      },
      {
        opcode: "setPenSizeTo",
        blockType: "command",
        text: m.setSize,
        arguments: { SIZE: { type: "number", defaultValue: 1 } },
        filter: ["sprite"],
      },
      // Blok legacy (Scratch 2): tidak tampil di palet tetapi tetap jalan.
      {
        opcode: "setPenShadeToNumber",
        blockType: "command",
        text: m.setShade,
        arguments: { SHADE: { type: "number", defaultValue: 1 } },
        hideFromPalette: true,
      },
      {
        opcode: "changePenShadeBy",
        blockType: "command",
        text: m.changeShade,
        arguments: { SHADE: { type: "number", defaultValue: 1 } },
        hideFromPalette: true,
      },
      {
        opcode: "setPenHueToNumber",
        blockType: "command",
        text: m.setHue,
        arguments: { HUE: { type: "number", defaultValue: 1 } },
        hideFromPalette: true,
      },
      {
        opcode: "changePenHueBy",
        blockType: "command",
        text: m.changeHue,
        arguments: { HUE: { type: "number", defaultValue: 1 } },
        hideFromPalette: true,
      },
    ],
    menus: {
      colorParam: {
        acceptReporters: true,
        items: [
          { text: m.menuColor, value: ColorParam.COLOR },
          { text: m.menuSaturation, value: ColorParam.SATURATION },
          { text: m.menuBrightness, value: ColorParam.BRIGHTNESS },
          { text: m.menuTransparency, value: ColorParam.TRANSPARENCY },
        ],
      },
    },
  };
}
