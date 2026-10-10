/**
 * Warna kategori PERSIS scratch-blocks core/colours.js (Apache-2.0, versi 1.1.206).
 */
import type { CategoryColours } from "./types";

export const CATEGORY_COLOURS = {
  motion: { primary: "#4C97FF", secondary: "#4280D7", tertiary: "#3373CC", quaternary: "#3373CC" },
  looks: { primary: "#9966FF", secondary: "#855CD6", tertiary: "#774DCB", quaternary: "#774DCB" },
  sounds: { primary: "#CF63CF", secondary: "#C94FC9", tertiary: "#BD42BD", quaternary: "#BD42BD" },
  control: { primary: "#FFAB19", secondary: "#EC9C13", tertiary: "#CF8B17", quaternary: "#CF8B17" },
  event: { primary: "#FFBF00", secondary: "#E6AC00", tertiary: "#CC9900", quaternary: "#CC9900" },
  sensing: { primary: "#5CB1D6", secondary: "#47A8D1", tertiary: "#2E8EB8", quaternary: "#2E8EB8" },
  pen: { primary: "#0FBD8C", secondary: "#0DA57A", tertiary: "#0B8E69", quaternary: "#0B8E69" },
  operators: { primary: "#59C059", secondary: "#46B946", tertiary: "#389438", quaternary: "#389438" },
  data: { primary: "#FF8C1A", secondary: "#FF8000", tertiary: "#DB6E00", quaternary: "#DB6E00" },
  data_lists: { primary: "#FF661A", secondary: "#FF5500", tertiary: "#E64D00", quaternary: "#E64D00" },
  more: { primary: "#FF6680", secondary: "#FF4D6A", tertiary: "#FF3355", quaternary: "#FF3355" },
} as const satisfies Record<string, CategoryColours>;

/** Warna ekstensi default Scratch (extension-manager defaultColours). */
export const EXTENSION_COLOURS: CategoryColours = CATEGORY_COLOURS.pen;

export const UI_COLOURS = {
  text: "#FFFFFF",
  workspace: "#F9F9F9",
  toolboxHover: "#4C97FF",
  toolboxSelected: "#e9eef2",
  toolboxText: "#575E75",
  toolbox: "#FFFFFF",
  flyout: "#F9F9F9",
  scrollbar: "#CECDCE",
  textField: "#FFFFFF",
  textFieldText: "#575E75",
  insertionMarker: "#000000",
  insertionMarkerOpacity: 0.2,
  stackGlow: "#FFF200",
  stackGlowSize: 4,
  replacementGlow: "#FFFFFF",
  valueReportBackground: "#FFFFFF",
  valueReportBorder: "#AAAAAA",
} as const;
