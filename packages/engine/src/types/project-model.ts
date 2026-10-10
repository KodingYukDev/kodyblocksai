/**
 * Model project di memori. Bentuknya identik dengan project.json Scratch 3 (sb3),
 * KECUALI blok disimpan dalam bentuk "tidak terkompresi" persis seperti scratch-vm
 * menyimpannya di memori (inputs = {name, block, shadow}, fields = {name, value, id}).
 * Konversi sb3 <-> model ini milik packages/project (deserialize.ts / serialize.ts).
 */

/** Nilai yang bisa mengalir di antara blok Scratch. */
export type ScratchValue = string | number | boolean;

/** Ukuran panggung Scratch (koordinat x: -240..240, y: -180..180). */
export const STAGE_WIDTH = 480;
export const STAGE_HEIGHT = 360;

/** Tipe variabel persis seperti scratch-vm Variable.*_TYPE. */
export type VariableType = "" | "list" | "broadcast_msg";
export const SCALAR_TYPE: VariableType = "";
export const LIST_TYPE: VariableType = "list";
export const BROADCAST_MESSAGE_TYPE: VariableType = "broadcast_msg";

export interface BlockField {
  name: string;
  value: string | number;
  /** Untuk field VARIABLE / LIST / BROADCAST_OPTION: id variabel. */
  id?: string | null;
  variableType?: VariableType;
}

export interface BlockInput {
  name: string;
  /** Blok yang menempati input (bisa sama dengan shadow kalau tidak ada yang menutupi). */
  block: string | null;
  /** Shadow block (angka/teks/menu) yang muncul ketika tidak ada reporter di atasnya. */
  shadow: string | null;
}

/**
 * Mutation (procedures_*, control_stop). Semua atribut berupa string seperti XML scratch-blocks.
 * procedures: proccode, argumentids (JSON string[]), argumentnames (JSON), argumentdefaults (JSON), warp ("true"/"false").
 * control_stop: hasnext ("true"/"false").
 */
export interface BlockMutation {
  tagName: "mutation";
  children: BlockMutation[];
  proccode?: string;
  argumentids?: string;
  argumentnames?: string;
  argumentdefaults?: string;
  warp?: string | boolean;
  hasnext?: string | boolean;
  [attr: string]: unknown;
}

export interface Block {
  id: string;
  opcode: string;
  next: string | null;
  parent: string | null;
  inputs: Record<string, BlockInput>;
  fields: Record<string, BlockField>;
  shadow: boolean;
  topLevel: boolean;
  x?: number;
  y?: number;
  mutation?: BlockMutation | null;
  /** id komentar yang menempel. */
  comment?: string;
}

export interface CommentState {
  id: string;
  blockId: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  minimized: boolean;
  text: string;
}

export interface VariableState {
  id: string;
  name: string;
  type: VariableType;
  /** scalar: ScratchValue, list: ScratchValue[], broadcast: nama pesan. */
  value: ScratchValue | ScratchValue[];
  isCloud: boolean;
}

export interface CostumeState {
  name: string;
  assetId: string;
  md5ext: string;
  dataFormat: "png" | "svg" | "jpg" | "jpeg" | "bmp" | "gif";
  /** 1 untuk vektor, 2 untuk bitmap Scratch 3. */
  bitmapResolution: number;
  rotationCenterX: number;
  rotationCenterY: number;
}

export interface SoundState {
  name: string;
  assetId: string;
  md5ext: string;
  dataFormat: "wav" | "mp3" | "ogg" | "webm";
  rate: number;
  sampleCount: number;
}

export type RotationStyle = "all around" | "left-right" | "don't rotate";
export type VideoState = "on" | "off" | "on-flipped";

/** Satu target (stage atau sprite asli). Clone TIDAK diserialisasi, sama seperti Scratch. */
export interface TargetState {
  id: string;
  isStage: boolean;
  name: string;
  variables: Record<string, VariableState>;
  blocks: Record<string, Block>;
  comments: Record<string, CommentState>;
  currentCostume: number;
  costumes: CostumeState[];
  sounds: SoundState[];
  volume: number;
  layerOrder: number;
  // khusus stage
  tempo?: number;
  videoTransparency?: number;
  videoState?: VideoState;
  textToSpeechLanguage?: string | null;
  // khusus sprite
  visible?: boolean;
  x?: number;
  y?: number;
  size?: number;
  direction?: number;
  draggable?: boolean;
  rotationStyle?: RotationStyle;
  /** State per-ekstensi (pen, music, ai) yang ikut disimpan; Scratch tidak menyimpan ini kecuali via extensionStorage. */
  extensionState?: Record<string, unknown>;
}

export type MonitorMode = "default" | "large" | "slider" | "list";

export interface MonitorState {
  id: string;
  mode: MonitorMode;
  opcode: string;
  params: Record<string, string>;
  spriteName: string | null;
  value: ScratchValue | ScratchValue[];
  width: number;
  height: number;
  x: number;
  y: number;
  visible: boolean;
  sliderMin: number;
  sliderMax: number;
  isDiscrete: boolean;
}

export interface ProjectMeta {
  semver: "3.0.0";
  vm: string;
  agent: string;
  /** Penanda produk kita; Scratch mengabaikan field asing. */
  origin?: string;
}

export interface ProjectModel {
  targets: TargetState[];
  monitors: MonitorState[];
  /** id ekstensi non-core, mis. "pen", "music", "aiHand". */
  extensions: string[];
  meta: ProjectMeta;
}
