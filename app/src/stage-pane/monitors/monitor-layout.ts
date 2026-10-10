/**
 * Tata letak monitor di panggung. Port perilaku scratch-gui reducers/monitor-layout.js
 * (penempatan awal tanpa tumpang-tindih, posisi simpanan). Lihat THIRD_PARTY.md.
 */

export interface Point {
  x: number;
  y: number;
}

export interface MonitorRect {
  upperStart: Point;
  lowerEnd: Point;
}

export interface MonitorLayoutState {
  monitors: Readonly<Record<string, MonitorRect>>;
  savedMonitorPositions: Readonly<Record<string, Point>>;
}

export const PADDING = 5;
/** Angka "salah" ini sengaja disalin dari scratch-gui (issue #980) agar penempatan identik. */
export const SCREEN_WIDTH = 400;
export const SCREEN_HEIGHT = 300;
export const SCREEN_EDGE_BUFFER = 40;

export const initialMonitorLayout: MonitorLayoutState = { monitors: {}, savedMonitorPositions: {} };

const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

function verifyRect(a: Point, b: Point): boolean {
  if (Number.isNaN(a.x) || Number.isNaN(a.y) || Number.isNaN(b.x) || Number.isNaN(b.y)) return false;
  return a.x < b.x && a.y < b.y;
}

export function addMonitorRect(
  state: MonitorLayoutState,
  id: string,
  rect: MonitorRect,
  savePosition = false,
): MonitorLayoutState {
  if (has(state.monitors, id)) return state;
  if (!verifyRect(rect.upperStart, rect.lowerEnd)) return state;
  return {
    monitors: { ...state.monitors, [id]: { upperStart: rect.upperStart, lowerEnd: rect.lowerEnd } },
    savedMonitorPositions: savePosition
      ? { ...state.savedMonitorPositions, [id]: { x: rect.upperStart.x, y: rect.upperStart.y } }
      : state.savedMonitorPositions,
  };
}

export function moveMonitorRect(state: MonitorLayoutState, id: string, newX: number, newY: number): MonitorLayoutState {
  const old = state.monitors[id];
  if (!old) return state;
  if (Number.isNaN(newX) || Number.isNaN(newY)) return state;
  if (old.upperStart.x === newX && old.upperStart.y === newY) return state;
  const w = old.lowerEnd.x - old.upperStart.x;
  const h = old.lowerEnd.y - old.upperStart.y;
  return {
    monitors: {
      ...state.monitors,
      [id]: { upperStart: { x: newX, y: newY }, lowerEnd: { x: newX + w, y: newY + h } },
    },
    savedMonitorPositions: { ...state.savedMonitorPositions, [id]: { x: newX, y: newY } },
  };
}

export function resizeMonitorRect(state: MonitorLayoutState, id: string, newWidth: number, newHeight: number): MonitorLayoutState {
  const old = state.monitors[id];
  if (!old) return state;
  if (Number.isNaN(newWidth) || Number.isNaN(newHeight) || newWidth <= 0 || newHeight <= 0) return state;
  const lowerEnd = { x: old.upperStart.x + newWidth, y: old.upperStart.y + newHeight };
  if (lowerEnd.x === old.lowerEnd.x && lowerEnd.y === old.lowerEnd.y) return state;
  return {
    monitors: { ...state.monitors, [id]: { upperStart: old.upperStart, lowerEnd } },
    savedMonitorPositions: state.savedMonitorPositions,
  };
}

export function removeMonitorRect(state: MonitorLayoutState, id: string): MonitorLayoutState {
  if (!has(state.monitors, id)) return state;
  const monitors = { ...state.monitors };
  delete monitors[id];
  return { monitors, savedMonitorPositions: state.savedMonitorPositions };
}

function rectsIntersect(a: MonitorRect, b: MonitorRect): boolean {
  if (a.upperStart.x >= b.lowerEnd.x || b.upperStart.x >= a.lowerEnd.x) return false;
  if (a.upperStart.y >= b.lowerEnd.y || b.upperStart.y >= a.lowerEnd.y) return false;
  return true;
}

/** Persis getInitialPosition scratch-gui (rencana A, B, lalu acak). */
export function getInitialPosition(
  state: MonitorLayoutState,
  id: string,
  eltWidth: number,
  eltHeight: number,
  random: () => number = Math.random,
): MonitorRect {
  const saved = state.savedMonitorPositions[id];
  if (saved) {
    return { upperStart: saved, lowerEnd: { x: saved.x + eltWidth, y: saved.y + eltHeight } };
  }
  const endXs = [0];
  const endYs = [0];
  const rects = Object.values(state.monitors);
  for (const m of rects) {
    endXs.push(Math.ceil(m.lowerEnd.x / 50) * 50);
    endYs.push(Math.ceil(m.lowerEnd.y));
  }
  endXs.sort((a, b) => a - b);
  endYs.sort((a, b) => a - b);

  let planB: MonitorRect | null = null;
  let lastX: number | null = null;
  // Sama seperti aslinya, lastY TIDAK di-reset per kolom (perilaku scratch-gui dipertahankan).
  let lastY: number | null = null;
  for (const x of endXs) {
    if (x === lastX) continue;
    lastX = x;
    outer: for (const y of endYs) {
      if (y === lastY) continue;
      lastY = y;
      const monitorRect: MonitorRect = {
        upperStart: { x: x + PADDING, y: y + PADDING },
        lowerEnd: { x: x + PADDING + eltWidth, y: y + PADDING + eltHeight },
      };
      const rect: MonitorRect = {
        upperStart: { x, y },
        lowerEnd: { x: x + eltWidth + 2 * PADDING, y: y + eltHeight + 2 * PADDING },
      };
      for (const m of rects) {
        if (rectsIntersect(m, rect)) continue outer;
      }
      if (rect.lowerEnd.x > SCREEN_WIDTH || rect.lowerEnd.y > SCREEN_HEIGHT) {
        if (
          !planB &&
          !(rect.upperStart.x + SCREEN_EDGE_BUFFER > SCREEN_WIDTH || rect.upperStart.y + SCREEN_EDGE_BUFFER > SCREEN_HEIGHT)
        ) {
          planB = monitorRect;
        }
        continue;
      }
      return monitorRect;
    }
  }
  if (planB) return planB;
  const randX = Math.ceil(random() * (SCREEN_WIDTH / 2));
  const randY = Math.ceil(random() * (SCREEN_HEIGHT - SCREEN_EDGE_BUFFER));
  return { upperStart: { x: randX, y: randY }, lowerEnd: { x: randX + eltWidth, y: randY + eltHeight } };
}
