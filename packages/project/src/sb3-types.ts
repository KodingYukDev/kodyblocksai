/**
 * Bentuk JSON project.json Scratch 3 (sb3) apa adanya, termasuk bentuk "terkompresi"
 * input primitif. Referensi: scratch-vm src/serialization/sb3.js (BSD-3, versi 4.8.102).
 */

/** Konstanta primitif terkompresi (sb3.js). */
export const SB3_PRIMITIVE = {
  INPUT_SAME_BLOCK_SHADOW: 1,
  INPUT_BLOCK_NO_SHADOW: 2,
  INPUT_DIFF_BLOCK_SHADOW: 3,
  MATH_NUM_PRIMITIVE: 4,
  POSITIVE_NUM_PRIMITIVE: 5,
  WHOLE_NUM_PRIMITIVE: 6,
  INTEGER_NUM_PRIMITIVE: 7,
  ANGLE_NUM_PRIMITIVE: 8,
  COLOR_PICKER_PRIMITIVE: 9,
  TEXT_PRIMITIVE: 10,
  BROADCAST_PRIMITIVE: 11,
  VAR_PRIMITIVE: 12,
  LIST_PRIMITIVE: 13,
} as const;

export type SB3Primitive =
  | [4 | 5 | 6 | 7 | 8, number | string]
  | [9, string]
  | [10, string | number]
  | [11, string, string]
  | [12 | 13, string, string]
  | [12 | 13, string, string, number, number];

/** Nilai di dalam input: id blok, primitif terkompresi, atau null. */
export type SB3InputValue = string | SB3Primitive | null;

export type SB3Input = [1, SB3InputValue] | [2, SB3InputValue] | [3, SB3InputValue, SB3InputValue];

export interface SB3Mutation {
  tagName: "mutation";
  children: [];
  proccode?: string;
  argumentids?: string;
  argumentnames?: string;
  argumentdefaults?: string;
  warp?: string;
  hasnext?: string;
  [attr: string]: unknown;
}

export interface SB3Block {
  opcode: string;
  next: string | null;
  parent: string | null;
  inputs: Record<string, SB3Input>;
  /** [nilai] atau [nilai, id] untuk field variabel/list/broadcast. */
  fields: Record<string, [string | number] | [string | number, string | null]>;
  shadow: boolean;
  topLevel: boolean;
  x?: number;
  y?: number;
  mutation?: SB3Mutation;
  comment?: string;
}

/** Variabel/list top-level yang diserialisasi langsung sebagai primitif [12|13, name, id, x, y]. */
export type SB3BlockEntry = SB3Block | SB3Primitive;

export interface SB3Comment {
  blockId: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  minimized: boolean;
  text: string;
}

export interface SB3Costume {
  name: string;
  assetId: string;
  md5ext: string;
  dataFormat: string;
  bitmapResolution?: number;
  rotationCenterX: number;
  rotationCenterY: number;
}

export interface SB3Sound {
  name: string;
  assetId: string;
  md5ext: string;
  dataFormat: string;
  rate: number;
  sampleCount: number;
}

export interface SB3Target {
  isStage: boolean;
  name: string;
  /** id -> [nama, nilai] atau [nama, nilai, true] untuk cloud. */
  variables: Record<string, [string, string | number | boolean] | [string, string | number | boolean, true]>;
  lists: Record<string, [string, (string | number | boolean)[]]>;
  broadcasts: Record<string, string>;
  blocks: Record<string, SB3BlockEntry>;
  comments: Record<string, SB3Comment>;
  currentCostume: number;
  costumes: SB3Costume[];
  sounds: SB3Sound[];
  volume: number;
  layerOrder: number;
  // stage
  tempo?: number;
  videoTransparency?: number;
  videoState?: "on" | "off" | "on-flipped";
  textToSpeechLanguage?: string | null;
  // sprite
  visible?: boolean;
  x?: number;
  y?: number;
  size?: number;
  direction?: number;
  draggable?: boolean;
  rotationStyle?: "all around" | "left-right" | "don't rotate";
}

export interface SB3Monitor {
  id: string;
  mode: "default" | "large" | "slider" | "list";
  opcode: string;
  params: Record<string, string>;
  spriteName: string | null;
  value: string | number | boolean | (string | number | boolean)[];
  width: number;
  height: number;
  x: number;
  y: number;
  visible: boolean;
  sliderMin?: number;
  sliderMax?: number;
  isDiscrete?: boolean;
}

export interface SB3Project {
  targets: SB3Target[];
  monitors: SB3Monitor[];
  extensions: string[];
  meta: { semver: string; vm?: string; agent?: string; origin?: string };
}
