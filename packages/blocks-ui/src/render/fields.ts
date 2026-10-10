/**
 * Field blok: pembuatan dari argumen JSON, ukuran, dan SVG. Port perilaku scratch-blocks 1.1.206
 * (core/field.js, field_label.js, field_label_serializable.js, field_textinput.js, field_dropdown.js,
 * field_textdropdown.js, field_variable(_getter).js, field_image.js, field_vertical_separator.js,
 * field_colour_slider.js, field_matrix.js) - Apache-2.0.
 */
import { resolveMessage, type BlockLocale } from "../blocks/messages";
import type { DropdownOptions, ScratchArgJson } from "../blocks/json-types";
import { BLOCK_METRICS as M } from "./metrics";
import type { TextMeasurer } from "./text-measure";

export type FieldKind =
  | "label"
  | "label_serializable"
  | "text_input"
  | "text_dropdown"
  | "dropdown"
  | "variable"
  | "variable_getter"
  | "image"
  | "separator"
  | "colour"
  | "matrix";

export interface FieldInstance {
  kind: FieldKind;
  name?: string;
  /** Teks mentah (sebelum NBSP). */
  text: string;
  value: string;
  /** Field.EDITABLE (mempengaruhi padding & renderSep). */
  editable: boolean;
  /** Punya panah dropdown (positionArrow). */
  arrow: "light" | "dark" | null;
  image?: { src: string; width: number; height: number; flipRtl: boolean };
  /** Tinggi garis separator (hat ekstensi: ICON_SEPARATOR_HEIGHT - GRID_UNIT). */
  lineHeight?: number;
}

export interface FieldSize {
  width: number;
  height: number;
  arrowWidth: number;
  /** Field digambar dengan kotak (dropdown/teks di blok non-shadow). */
  box: boolean;
}

/** Blockly.Field.NBSP */
export const NBSP = " ";

/** Field.getDisplayText_: kosong -> NBSP, spasi -> NBSP (MAX_DISPLAY_LENGTH = Infinity di vertical). */
export function displayText(text: string): string {
  if (!text) return NBSP;
  return text.replace(/\s/g, NBSP);
}

function optionText(options: DropdownOptions | undefined, value: string, locale: BlockLocale): string {
  for (const [text, v] of options ?? []) if (v === value) return resolveMessage(text, locale);
  return value;
}

/** Field dari elemen pesan string (FieldLabel). */
export function labelField(text: string): FieldInstance {
  return { kind: "label", text, value: text, editable: false, arrow: null };
}

/**
 * Buat FieldInstance dari argumen JSON `field_*`. `value` = nilai tersimpan di blok
 * (undefined -> nilai default definisi). `textOverride` = teks tampilan dinamis.
 */
export function createField(
  arg: ScratchArgJson,
  value: string | undefined,
  locale: BlockLocale,
  textOverride?: string,
): FieldInstance | null {
  const name = arg.name;
  const base = (kind: FieldKind, v: string, text: string, editable: boolean, arrow: FieldInstance["arrow"]): FieldInstance => {
    const f: FieldInstance = { kind, value: v, text: textOverride ?? text, editable, arrow };
    if (name !== undefined) f.name = name;
    return f;
  };
  switch (arg.type) {
    case "field_label":
      return base("label", arg.text ?? "", resolveMessage(arg.text ?? "", locale), false, null);
    case "field_label_serializable": {
      const v = value ?? resolveMessage(arg.text ?? "", locale);
      return base("label_serializable", v, v, false, null);
    }
    case "field_input":
    case "field_input_removable":
    case "field_number":
    case "field_angle":
    case "field_note": {
      const v = value ?? (arg.text !== undefined ? arg.text : arg.value !== undefined ? String(arg.value) : "");
      return base("text_input", v, v, true, null);
    }
    case "field_textdropdown":
    case "field_numberdropdown": {
      const v = value ?? (arg.value !== undefined ? String(arg.value) : (arg.text ?? ""));
      return base("text_dropdown", v, optionText(arg.options, v, locale), true, "dark");
    }
    case "field_dropdown": {
      const first = arg.options?.[0]?.[1] ?? "";
      const v = value ?? first;
      return base("dropdown", v, optionText(arg.options, v, locale), true, "light");
    }
    case "field_variable": {
      const v = value ?? resolveMessage(arg.variable ?? "", locale);
      return base("variable", v, v, true, "light");
    }
    case "field_variable_getter": {
      const v = value ?? arg.text ?? "";
      return base("variable_getter", v, v, false, null);
    }
    case "field_image": {
      const f = base("image", arg.src ?? "", arg.alt ?? "", false, null);
      f.image = { src: arg.src ?? "", width: arg.width ?? 0, height: arg.height ?? 0, flipRtl: arg.flip_rtl ?? false };
      return f;
    }
    case "field_vertical_separator": {
      const f = base("separator", "", "", false, null);
      f.lineHeight = M.ICON_SEPARATOR_HEIGHT;
      return f;
    }
    case "field_colour_slider":
    case "field_colour": {
      const v = value ?? arg.colour ?? "#000000";
      // FieldColourSlider tidak mengisi text_: tampil NBSP.
      return base("colour", v, "", true, null);
    }
    case "field_matrix": {
      const v = value ?? "0000000000000000000000000";
      return base("matrix", v, "", true, null);
    }
    default:
      return null;
  }
}

/**
 * Ukuran field (Field.getSize / updateWidth). `inShadow` = blok sumber adalah shadow
 * (dropdown & text input di blok non-shadow memakai kotak).
 */
export function measureField(f: FieldInstance, inShadow: boolean, measurer: TextMeasurer): FieldSize {
  switch (f.kind) {
    case "label":
    case "label_serializable":
      // FieldLabel: size_ (0,0) -> tinggi 0, lebar teks.
      return { width: measurer.measure(displayText(f.text)), height: 0, arrowWidth: 0, box: false };
    case "image":
      return { width: f.image?.width ?? 0, height: f.image?.height ?? 0, arrowWidth: 0, box: false };
    case "separator":
      return { width: 1, height: M.ICON_SEPARATOR_HEIGHT, arrowWidth: 0, box: false };
    case "matrix":
      return {
        width: M.MATRIX_THUMBNAIL_SIZE + M.DROPDOWN_ARROW_SIZE + M.DROPDOWN_ARROW_PADDING * 1.5,
        height: M.FIELD_HEIGHT,
        arrowWidth: 0,
        box: false,
      };
    case "variable_getter":
      return { width: measurer.measure(displayText(f.text)), height: M.FIELD_HEIGHT, arrowWidth: 0, box: false };
    default: {
      let width = measurer.measure(displayText(f.text));
      if (f.editable) width += M.EDITABLE_FIELD_PADDING;
      const arrowWidth = f.arrow ? M.DROPDOWN_ARROW_SIZE + M.DROPDOWN_ARROW_PADDING : 0;
      width += arrowWidth;
      const box = !inShadow && (f.kind === "dropdown" || f.kind === "variable" || f.kind === "text_input" || f.kind === "text_dropdown");
      if (box) width += 2 * M.BOX_FIELD_PADDING;
      return { width, height: M.FIELD_HEIGHT, arrowWidth, box };
    }
  }
}
