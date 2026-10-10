/**
 * Pembuat project.json sb3 minimal untuk tes parity. Asset costume menunjuk md5 placeholder;
 * oracle berjalan tanpa storage sehingga asset tidak dimuat (scratch-vm tetap jalan dan geometri
 * memakai DEFAULT_SKIN 96x100). Engine kita memakai media loader parity yang setara.
 */
export type SB3Json = {
  targets: Record<string, unknown>[];
  monitors: unknown[];
  extensions: string[];
  meta: { semver: string; vm: string; agent: string };
};

const COSTUME_ASSET = "cd21514d0531fdffb22204e0ec5ed84a";

function costume(name: string): Record<string, unknown> {
  return {
    name,
    bitmapResolution: 1,
    dataFormat: "svg",
    assetId: COSTUME_ASSET,
    md5ext: `${COSTUME_ASSET}.svg`,
    rotationCenterX: 48,
    rotationCenterY: 50,
  };
}

export type SB3Value = string | number;

export interface SpriteSpec {
  name?: string;
  blocks: Record<string, unknown>;
  variables?: Record<string, [string, SB3Value]>;
  lists?: Record<string, [string, SB3Value[]]>;
  costumes?: string[];
  currentCostume?: number;
  x?: number;
  y?: number;
  direction?: number;
  size?: number;
  visible?: boolean;
  draggable?: boolean;
  rotationStyle?: "all around" | "left-right" | "don't rotate";
  volume?: number;
}

export interface StageSpec {
  blocks?: Record<string, unknown>;
  variables?: Record<string, [string, SB3Value]>;
  lists?: Record<string, [string, SB3Value[]]>;
  broadcasts?: Record<string, string>;
  backdrops?: string[];
  currentCostume?: number;
}

export function makeProject(sprites: SpriteSpec[], stage: StageSpec = {}): SB3Json {
  return {
    targets: [
      {
        isStage: true,
        name: "Stage",
        variables: stage.variables ?? {},
        lists: stage.lists ?? {},
        broadcasts: stage.broadcasts ?? {},
        blocks: stage.blocks ?? {},
        comments: {},
        currentCostume: stage.currentCostume ?? 0,
        costumes: (stage.backdrops ?? ["latar1"]).map(costume),
        sounds: [],
        volume: 100,
        layerOrder: 0,
        tempo: 60,
        videoTransparency: 50,
        videoState: "off",
        textToSpeechLanguage: null,
      },
      ...sprites.map((s, i) => ({
        isStage: false,
        name: s.name ?? `Sprite${i + 1}`,
        variables: s.variables ?? {},
        lists: s.lists ?? {},
        broadcasts: {},
        blocks: s.blocks,
        comments: {},
        currentCostume: s.currentCostume ?? 0,
        costumes: (s.costumes ?? ["kostum1"]).map(costume),
        sounds: [],
        volume: s.volume ?? 100,
        layerOrder: i + 1,
        visible: s.visible ?? true,
        x: s.x ?? 0,
        y: s.y ?? 0,
        size: s.size ?? 100,
        direction: s.direction ?? 90,
        draggable: s.draggable ?? false,
        rotationStyle: s.rotationStyle ?? "all around",
      })),
    ],
    monitors: [],
    extensions: [],
    meta: { semver: "3.0.0", vm: "0.2.0", agent: "kodyblocks-parity" },
  };
}

/** Skrip: when flag clicked -> forever { move (steps) }. */
export function foreverMoveScript(steps: number): Record<string, unknown> {
  return {
    hat: { opcode: "event_whenflagclicked", next: "loop", parent: null, inputs: {}, fields: {}, shadow: false, topLevel: true, x: 0, y: 0 },
    loop: { opcode: "control_forever", next: null, parent: "hat", inputs: { SUBSTACK: [2, "move"] }, fields: {}, shadow: false, topLevel: false },
    move: { opcode: "motion_movesteps", next: null, parent: "loop", inputs: { STEPS: [1, [4, String(steps)]] }, fields: {}, shadow: false, topLevel: false },
  };
}
