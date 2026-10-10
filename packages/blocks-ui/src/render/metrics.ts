/**
 * Konstanta geometri renderer blok vertikal - port dari scratch-blocks 1.1.206
 * core/block_render_svg_vertical.js (Apache-2.0, (c) Google Inc. & MIT). Nilai identik.
 */
export const GRID_UNIT = 4;
const G = GRID_UNIT;

export const BLOCK_METRICS = {
  SEP_SPACE_X: 2 * G,
  SEP_SPACE_Y: 2 * G,
  MIN_BLOCK_X: 16 * G,
  MIN_BLOCK_X_OUTPUT: 12 * G,
  MIN_BLOCK_X_SHADOW_OUTPUT: 10 * G,
  MIN_BLOCK_Y: 12 * G,
  EXTRA_STATEMENT_ROW_Y: 8 * G,
  MIN_BLOCK_X_WITH_STATEMENT: 40 * G,
  MIN_BLOCK_Y_SINGLE_FIELD_OUTPUT: 8 * G,
  MIN_BLOCK_Y_REPORTER: 10 * G,
  MIN_STATEMENT_INPUT_HEIGHT: 6 * G,
  NOTCH_WIDTH: 8 * G,
  NOTCH_HEIGHT: 2 * G,
  CORNER_RADIUS: 1 * G,
  STATEMENT_INPUT_EDGE_WIDTH: 4 * G,
  STATEMENT_INPUT_INNER_SPACE: 2 * G,
  START_HAT_HEIGHT: 16,
  /** Lebar minimum hat (renderDraw_: rightEdge = max(rightEdge, 100)). */
  START_HAT_MIN_WIDTH: 100,
  ICON_SEPARATOR_HEIGHT: 10 * G,
  NOTCH_START_PADDING: 3 * G,
  INPUT_SHAPE_HEXAGONAL_WIDTH: 12 * G,
  INPUT_SHAPE_SQUARE_WIDTH: 10 * G,
  INPUT_SHAPE_ROUND_WIDTH: 12 * G,
  INPUT_SHAPE_HEIGHT: 8 * G,
  FIELD_HEIGHT: 8 * G,
  FIELD_WIDTH: 6 * G,
  EDITABLE_FIELD_PADDING: 6,
  BOX_FIELD_PADDING: 2 * G,
  DROPDOWN_ARROW_PADDING: 2 * G,
  DROPDOWN_ARROW_SIZE: 12,
  DROPDOWN_ARROW_Y: 11,
  FIELD_TOP_PADDING: 0.5 * G,
  INPUT_AND_FIELD_MIN_X: 12 * G,
  INLINE_PADDING_Y: 1 * G,
  DEFINE_HAT_CORNER_RADIUS: 5 * G,
  DEFINE_BLOCK_PADDING_RIGHT: 2 * G,
  /** Kompatibilitas nama lama stub. */
  HAT_CORNER_RADIUS: 8 * G,
  MATRIX_THUMBNAIL_SIZE: 26,
  MATRIX_THUMBNAIL_NODE_SIZE: 4,
  MATRIX_THUMBNAIL_NODE_PAD: 1,
} as const;

const M = BLOCK_METRICS;
const R = M.CORNER_RADIUS;

/** Ukuran font teks blok: .blocklyText 12pt (= 16px), weight 500, "Helvetica Neue", Helvetica, sans-serif. */
export const BLOCK_FONT = {
  family: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  sizePt: 12,
  sizePx: 16,
  weight: 500,
} as const;

/** Skala awal workspace scratch-gui (blocks.jsx zoom.startScale). */
export const WORKSPACE_START_SCALE = 0.675;

export const PATHS = {
  START_HAT: "c 25,-22 71,-22 96,0",
  NOTCH_LEFT: "c 2,0 3,1 4,2 l 4,4 c 1,1 2,2 4,2 h 12 c 2,0 3,-1 4,-2 l 4,-4 c 1,-1 2,-2 4,-2",
  NOTCH_RIGHT: "c -2,0 -3,1 -4,2 l -4,4 c -1,1 -2,2 -4,2 h -12 c -2,0 -3,-1 -4,-2 l -4,-4 c -1,-1 -2,-2 -4,-2",
  TOP_LEFT_CORNER_START: `m 0,${R}`,
  TOP_LEFT_CORNER: `A ${R},${R} 0 0,1 ${R},0`,
  TOP_RIGHT_CORNER: `a ${R},${R} 0 0,1 ${R},${R}`,
  BOTTOM_RIGHT_CORNER: ` a ${R},${R} 0 0,1 -${R},${R}`,
  BOTTOM_LEFT_CORNER: `a ${R},${R} 0 0,1 -${R},-${R}`,
  INNER_TOP_LEFT_CORNER: ` a ${R},${R} 0 0,0 -${R},${R}`,
  INNER_BOTTOM_LEFT_CORNER: `a ${R},${R} 0 0,0 ${R},${R}`,
  TOP_LEFT_CORNER_DEFINE_HAT: `a ${M.DEFINE_HAT_CORNER_RADIUS},${M.DEFINE_HAT_CORNER_RADIUS} 0 0,1 ${M.DEFINE_HAT_CORNER_RADIUS},-${M.DEFINE_HAT_CORNER_RADIUS}`,
  TOP_RIGHT_CORNER_DEFINE_HAT: `a ${M.DEFINE_HAT_CORNER_RADIUS},${M.DEFINE_HAT_CORNER_RADIUS} 0 0,1 ${M.DEFINE_HAT_CORNER_RADIUS},${M.DEFINE_HAT_CORNER_RADIUS}`,
  INPUT_SHAPE_HEXAGONAL:
    `M ${4 * G},0  h ${4 * G} l ${4 * G},${4 * G} l ${-4 * G},${4 * G} h ${-4 * G}` +
    ` l ${-4 * G},${-4 * G} l ${4 * G},${-4 * G} z`,
  INPUT_SHAPE_SQUARE:
    `m 0,${R}A ${R},${R} 0 0,1 ${R},0 h ${12 * G - 2 * R}a ${R},${R} 0 0,1 ${R},${R} v ${8 * G - 2 * R}` +
    ` a ${R},${R} 0 0,1 -${R},${R} h ${-12 * G + 2 * R}a ${R},${R} 0 0,1 -${R},-${R} z`,
  INPUT_SHAPE_ROUND:
    `M ${4 * G},0 h ${4 * G} a ${4 * G} ${4 * G} 0 0 1 0 ${8 * G} h ${-4 * G}` +
    ` a ${4 * G} ${4 * G} 0 0 1 0 -${8 * G} z`,
} as const;

/**
 * Padding bentuk-dalam-bentuk (SHAPE_IN_SHAPE_PADDING). Kunci luar = bentuk output blok,
 * kunci dalam = 0 field, 1 heksagon, 2 bulat, 3 kotak.
 */
export const SHAPE_IN_SHAPE_PADDING: Record<1 | 2 | 3, Record<0 | 1 | 2 | 3, number>> = {
  1: { 0: 5 * G, 1: 2 * G, 2: 5 * G, 3: 5 * G },
  2: { 0: 3 * G, 1: 3 * G, 2: 1 * G, 3: 2 * G },
  3: { 0: 2 * G, 1: 2 * G, 2: 2 * G, 3: 2 * G },
};
