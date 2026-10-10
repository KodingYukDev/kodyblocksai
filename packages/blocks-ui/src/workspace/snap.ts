/**
 * Pencarian sambungan terdekat saat menyeret - perilaku scratch-blocks:
 * Connection.isConnectionAllowed / canConnectWithReason_ / canConnectToPrevious_ (core/connection.js),
 * InsertionMarkerManager.getCandidate_ / shouldUpdatePreviews_ (core/insertion_marker_manager.js),
 * konstanta SNAP_RADIUS 48, CONNECTING_SNAP_RADIUS 68, CURRENT_CONNECTION_PREFERENCE 20 (core/constants.js).
 * Ditulis ulang di atas model data sendiri (bukan objek Blockly).
 */
import type { BlockInfo } from "./block-info";
import { PROCEDURE_PROTOTYPE } from "./block-info";
import type { ConnPoint } from "./layout";
import type { BlockMap } from "./tree";

export const SNAP_RADIUS = 48;
export const CONNECTING_SNAP_RADIUS = 68;
export const CURRENT_CONNECTION_PREFERENCE = 20;
export const DRAG_RADIUS = 3;
export const FLYOUT_DRAG_RADIUS = 10;

export interface SnapContext {
  blocks: BlockMap;
  info(blockId: string): BlockInfo;
  /** Blok paling atas yang diseret. */
  topId: string;
  /** Semua blok yang ikut diseret. */
  dragged: ReadonlySet<string>;
}

export interface SnapCandidate {
  local: ConnPoint;
  closest: ConnPoint;
  radius: number;
}

export interface Vec {
  x: number;
  y: number;
}

function sameConn(a: ConnPoint, b: ConnPoint): boolean {
  return a.blockId === b.blockId && a.type === b.type && a.input === b.input;
}

export function distance(a: Vec, b: Vec): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function isSuperior(c: ConnPoint): boolean {
  return c.type === "next" || c.type === "statement" || c.type === "input";
}

function checksIntersect(a: ConnPoint, b: ConnPoint): boolean {
  if (!a.check || !b.check) return true;
  return a.check.some((c) => b.check?.includes(c));
}

/** Apakah candidate (di workspace) bisa menerima local (milik stack yang diseret)? */
export function isConnectionAllowed(ctx: SnapContext, local: ConnPoint, candidate: ConnPoint): boolean {
  if (ctx.dragged.has(candidate.blockId)) return false;
  // --- canConnectWithReason_ ---
  const opposite: Record<ConnPoint["type"], ConnPoint["type"][]> = {
    output: ["input"],
    input: ["output"],
    previous: ["next", "statement"],
    next: ["previous"],
    statement: ["previous"],
  };
  if (!opposite[local.type].includes(candidate.type)) return false;
  if (!checksIntersect(local, candidate)) return false;
  const superior = isSuperior(local) ? local : candidate;
  const inferior = superior === local ? candidate : local;
  const supBlock = ctx.blocks[superior.blockId];
  const infBlock = ctx.blocks[inferior.blockId];
  if (supBlock?.shadow && !infBlock?.shadow) return false;
  if (supBlock?.opcode === PROCEDURE_PROTOTYPE || infBlock?.opcode === PROCEDURE_PROTOTYPE) return false;

  const localInfo = ctx.info(local.blockId);
  const firstStatement = localInfo.statementInputs[0] ?? null;
  switch (candidate.type) {
    case "previous":
      return canConnectToPrevious(ctx, local, candidate, localInfo);
    case "output":
      return false;
    case "input":
      // Reporter yang menempati input boleh digeser keluar (semua blok kita bisa dipindah).
      return true;
    case "next":
    case "statement": {
      const firstStatementEmpty =
        firstStatement === null || !ctx.blocks[local.blockId]?.inputs[firstStatement]?.block;
      if (firstStatement !== null && local.type === "previous" && candidate.occupant && firstStatementEmpty) {
        return false;
      }
      if (candidate.occupant && !localInfo.hasNext) {
        const occ = ctx.blocks[candidate.occupant];
        if (occ && !occ.shadow && ctx.info(occ.id).hasNext) return false;
      }
      return true;
    }
    default:
      return false;
  }
}

function canConnectToPrevious(ctx: SnapContext, local: ConnPoint, candidate: ConnPoint, localInfo: BlockInfo): boolean {
  if (local.occupant) return false;
  const firstStatement = localInfo.statementInputs[0] ?? null;
  const isComplex = firstStatement !== null;
  const isFirstStatement = local.type === "statement" && local.input === firstStatement;
  const isNext = local.type === "next";
  if (isComplex && !isFirstStatement && !isNext) return false;
  const sourceHasPrevious = localInfo.hasPrevious;
  if (isFirstStatement && sourceHasPrevious) return true;
  if (isNext || (isFirstStatement && !sourceHasPrevious)) {
    const candidateConnected = !!ctx.blocks[candidate.blockId]?.parent;
    return !candidateConnected;
  }
  return false;
}

/**
 * Sambungan lokal yang tersedia saat drag dimulai: semua sambungan blok teratas
 * (output, previous, next, input, statement) + next blok terakhir di stack (lastOnStack).
 */
export function availableConnections(topConns: ConnPoint[], lastOnStack: ConnPoint | null): ConnPoint[] {
  const ordered = [
    ...topConns.filter((c) => c.type === "output"),
    ...topConns.filter((c) => c.type === "previous"),
    ...topConns.filter((c) => c.type === "next"),
    ...topConns.filter((c) => c.type === "input" || c.type === "statement"),
  ];
  if (lastOnStack && !ordered.some((c) => sameConn(c, lastOnStack))) ordered.push(lastOnStack);
  return ordered;
}

/** getCandidate_: cari pasangan terdekat dalam radius; radius mengecil setiap ketemu. */
export function getCandidate(
  ctx: SnapContext,
  locals: readonly ConnPoint[],
  candidates: readonly ConnPoint[],
  dxy: Vec,
  startRadius: number,
): SnapCandidate | null {
  let radius = startRadius;
  let best: SnapCandidate | null = null;
  for (const local of locals) {
    const moved = { x: local.x + dxy.x, y: local.y + dxy.y };
    let found: ConnPoint | null = null;
    let localRadius = radius;
    for (const cand of candidates) {
      if (Math.abs(cand.y - moved.y) > localRadius) continue;
      const d = distance(moved, cand);
      if (d > localRadius) continue;
      if (!isConnectionAllowed(ctx, local, cand)) continue;
      found = cand;
      localRadius = d;
    }
    if (found) {
      radius = localRadius;
      best = { local, closest: found, radius };
    }
  }
  return best;
}

/** Status pratinjau (insertion marker) selama satu drag. */
export class SnapTracker {
  private current: { local: ConnPoint; closest: ConnPoint } | null = null;

  constructor(
    private readonly ctx: SnapContext,
    private readonly locals: readonly ConnPoint[],
    private readonly candidates: readonly ConnPoint[],
  ) {}

  get active(): { local: ConnPoint; closest: ConnPoint } | null {
    return this.current;
  }

  /** Perbarui berdasarkan pergeseran dxy (unit workspace) sejak awal drag. Mengembalikan pratinjau aktif. */
  update(dxy: Vec, deleteArea = false): { local: ConnPoint; closest: ConnPoint } | null {
    if (deleteArea) {
      this.current = null;
      return null;
    }
    const start = this.current ? CONNECTING_SNAP_RADIUS : SNAP_RADIUS;
    const cand = getCandidate(this.ctx, this.locals, this.candidates, dxy, start);
    if (this.shouldUpdate(cand, dxy)) {
      this.current = cand ? { local: cand.local, closest: cand.closest } : null;
    }
    return this.current;
  }

  private shouldUpdate(cand: SnapCandidate | null, dxy: Vec): boolean {
    if (cand) {
      if (cand.local.type === "output") return true;
      if (this.current) {
        if (sameConn(this.current.closest, cand.closest)) return false;
        const cur = this.current;
        const curDistance = distance({ x: cur.local.x + dxy.x, y: cur.local.y + dxy.y }, cur.closest);
        return !(cand.radius > curDistance - CURRENT_CONNECTION_PREFERENCE);
      }
      return true;
    }
    return !!this.current;
  }
}

/**
 * shouldReplace_: true kalau menjatuhkan akan MENGGANTI (reporter di input, atau blok terminal
 * menimpa blok terminal), false kalau menyisipkan.
 */
export function shouldReplace(ctx: SnapContext, local: ConnPoint, closest: ConnPoint): boolean {
  if (local.type === "output") return true;
  const info = ctx.info(local.blockId);
  if (local.type === "statement" && local.input === info.statementInputs[0]) return false;
  const topHasNext = ctx.info(ctx.topId).hasNext;
  const closestConnected =
    closest.type === "previous" ? !!ctx.blocks[closest.blockId]?.parent : !!closest.occupant;
  return !topHasNext && local.type === "previous" && closestConnected;
}
