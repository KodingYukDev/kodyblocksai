/**
 * Primitive kategori Motion - padanan scratch-vm src/blocks/scratch3_motion.js.
 * Port baris-demi-baris dari scratch-vm 4.8.102 (BSD-3-Clause), lihat THIRD_PARTY.md.
 * Fencing (keepInFence) dan wrapClamp arah ada di RenderedTarget (target.ts); primitive di sini
 * hanya menghitung posisi/arah lalu memanggil setXY/setDirection persis seperti scratch-vm.
 * Pemilik: agent engine-motion-looks.
 */
import { Cast } from "../util/cast";
import { getRuntimeRandom, MathUtil } from "../util/math-util";
import { Timer, defaultTimeSource, type TimeSource } from "../util/timer";
import { STAGE_HEIGHT, STAGE_WIDTH } from "../types/project-model";
import type { BlockArgs, BlockPackage, BlockPackageFactory, BlockUtility, IRuntime, PrimitiveFn } from "../types/runtime";

/** State glide yang disimpan di util.stackFrame antar-yield (nama properti sama dengan scratch-vm). */
interface GlideFrame {
  timer?: Timer;
  duration: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

/** Padanan snapToInteger Scratch 2: buang galat floating point < 1e-9 di sekitar bilangan bulat. */
export function limitPrecision(coordinate: number): number {
  const rounded = Math.round(coordinate);
  const delta = coordinate - rounded;
  return Math.abs(delta) < 1e-9 ? rounded : coordinate;
}

export const createMotionBlocks: BlockPackageFactory = (runtime: IRuntime): BlockPackage => {
  const random = getRuntimeRandom(runtime);

  /** getTargetXY: "_mouse_", "_random_", atau nama sprite. undefined bila sprite tidak ada. */
  const getTargetXY = (targetName: unknown, util: BlockUtility): [number, number] | undefined => {
    let targetX = 0;
    let targetY = 0;
    if (targetName === "_mouse_") {
      targetX = util.ioQuery("mouse", "getScratchX") as number;
      targetY = util.ioQuery("mouse", "getScratchY") as number;
    } else if (targetName === "_random_") {
      targetX = Math.round(STAGE_WIDTH * (random() - 0.5));
      targetY = Math.round(STAGE_HEIGHT * (random() - 0.5));
    } else {
      const name = Cast.toString(targetName);
      const goToTarget = runtime.getSpriteTargetByName(name);
      if (!goToTarget) return undefined;
      targetX = goToTarget.x;
      targetY = goToTarget.y;
    }
    return [targetX, targetY];
  };

  const moveSteps: PrimitiveFn = (args, util) => {
    const steps = Cast.toNumber(args.STEPS);
    const radians = MathUtil.degToRad(90 - util.target.direction);
    const dx = steps * Math.cos(radians);
    const dy = steps * Math.sin(radians);
    util.target.setXY(util.target.x + dx, util.target.y + dy);
  };

  const goToXY: PrimitiveFn = (args, util) => {
    const x = Cast.toNumber(args.X);
    const y = Cast.toNumber(args.Y);
    util.target.setXY(x, y);
  };

  const goTo: PrimitiveFn = (args, util) => {
    const targetXY = getTargetXY(args.TO, util);
    if (targetXY) {
      util.target.setXY(targetXY[0], targetXY[1]);
    }
  };

  const turnRight: PrimitiveFn = (args, util) => {
    const degrees = Cast.toNumber(args.DEGREES);
    util.target.setDirection(util.target.direction + degrees);
  };

  const turnLeft: PrimitiveFn = (args, util) => {
    const degrees = Cast.toNumber(args.DEGREES);
    util.target.setDirection(util.target.direction - degrees);
  };

  const pointInDirection: PrimitiveFn = (args, util) => {
    const direction = Cast.toNumber(args.DIRECTION);
    util.target.setDirection(direction);
  };

  const pointTowards: PrimitiveFn = (args, util) => {
    let targetX = 0;
    let targetY = 0;
    if (args.TOWARDS === "_mouse_") {
      targetX = util.ioQuery("mouse", "getScratchX") as number;
      targetY = util.ioQuery("mouse", "getScratchY") as number;
    } else if (args.TOWARDS === "_random_") {
      util.target.setDirection(Math.round(random() * 360) - 180);
      return;
    } else {
      const pointTarget = runtime.getSpriteTargetByName(Cast.toString(args.TOWARDS));
      if (!pointTarget) return;
      targetX = pointTarget.x;
      targetY = pointTarget.y;
    }
    const dx = targetX - util.target.x;
    const dy = targetY - util.target.y;
    const direction = 90 - MathUtil.radToDeg(Math.atan2(dy, dx));
    util.target.setDirection(direction);
  };

  const glide = (args: BlockArgs, util: BlockUtility): void => {
    const frame = util.stackFrame as unknown as GlideFrame;
    if (frame.timer) {
      const timeElapsed = frame.timer.timeElapsed();
      if (timeElapsed < frame.duration * 1000) {
        // Sedang berjalan: posisi antara.
        const frac = timeElapsed / (frame.duration * 1000);
        const dx = frac * (frame.endX - frame.startX);
        const dy = frac * (frame.endY - frame.startY);
        util.target.setXY(frame.startX + dx, frame.startY + dy);
        util.yield();
      } else {
        // Selesai: posisi akhir.
        util.target.setXY(frame.endX, frame.endY);
      }
    } else {
      // Pertama kali: simpan data. scratch-vm memakai `new Timer()` (jam nyata, bukan util.nowObj yang
      // beku per frame), jadi glide sudah bergeser sedikit di tick berikutnya dalam frame yang sama.
      frame.timer = new Timer((util.sequencer as { timeSource?: TimeSource }).timeSource ?? defaultTimeSource);
      frame.timer.start();
      frame.duration = Cast.toNumber(args.SECS);
      frame.startX = util.target.x;
      frame.startY = util.target.y;
      frame.endX = Cast.toNumber(args.X);
      frame.endY = Cast.toNumber(args.Y);
      if (frame.duration <= 0) {
        // Durasi terlalu pendek untuk meluncur.
        util.target.setXY(frame.endX, frame.endY);
        return;
      }
      util.yield();
    }
  };

  const glideTo: PrimitiveFn = (args, util) => {
    const targetXY = getTargetXY(args.TO, util);
    if (targetXY) {
      glide({ SECS: args.SECS, X: targetXY[0], Y: targetXY[1] }, util);
    }
  };

  const ifOnEdgeBounce: PrimitiveFn = (_args, util) => {
    const bounds = util.target.getBounds();
    if (!bounds) return;
    // Jarak ke tepi: positif bila jauh, 0 bila melewati tepi.
    const distLeft = Math.max(0, STAGE_WIDTH / 2 + bounds.left);
    const distTop = Math.max(0, STAGE_HEIGHT / 2 - bounds.top);
    const distRight = Math.max(0, STAGE_WIDTH / 2 - bounds.right);
    const distBottom = Math.max(0, STAGE_HEIGHT / 2 + bounds.bottom);
    // Tepi terdekat (urutan pengecekan left, top, right, bottom menentukan pemenang saat seri).
    let nearestEdge = "";
    let minDist = Infinity;
    if (distLeft < minDist) {
      minDist = distLeft;
      nearestEdge = "left";
    }
    if (distTop < minDist) {
      minDist = distTop;
      nearestEdge = "top";
    }
    if (distRight < minDist) {
      minDist = distRight;
      nearestEdge = "right";
    }
    if (distBottom < minDist) {
      minDist = distBottom;
      nearestEdge = "bottom";
    }
    if (minDist > 0) return; // Tidak menyentuh tepi.
    // Arahkan menjauhi tepi terdekat.
    const radians = MathUtil.degToRad(90 - util.target.direction);
    let dx = Math.cos(radians);
    let dy = -Math.sin(radians);
    if (nearestEdge === "left") {
      dx = Math.max(0.2, Math.abs(dx));
    } else if (nearestEdge === "top") {
      dy = Math.max(0.2, Math.abs(dy));
    } else if (nearestEdge === "right") {
      dx = 0 - Math.max(0.2, Math.abs(dx));
    } else if (nearestEdge === "bottom") {
      dy = 0 - Math.max(0.2, Math.abs(dy));
    }
    const newDirection = MathUtil.radToDeg(Math.atan2(dy, dx)) + 90;
    util.target.setDirection(newDirection);
    // Tetap di dalam panggung.
    const fencedPosition = util.target.keepInFence(util.target.x, util.target.y);
    util.target.setXY(fencedPosition[0], fencedPosition[1]);
  };

  const setRotationStyle: PrimitiveFn = (args, util) => {
    util.target.setRotationStyle(args.STYLE as string);
  };

  const changeX: PrimitiveFn = (args, util) => {
    const dx = Cast.toNumber(args.DX);
    util.target.setXY(util.target.x + dx, util.target.y);
  };

  const setX: PrimitiveFn = (args, util) => {
    const x = Cast.toNumber(args.X);
    util.target.setXY(x, util.target.y);
  };

  const changeY: PrimitiveFn = (args, util) => {
    const dy = Cast.toNumber(args.DY);
    util.target.setXY(util.target.x, util.target.y + dy);
  };

  const setY: PrimitiveFn = (args, util) => {
    const y = Cast.toNumber(args.Y);
    util.target.setXY(util.target.x, y);
  };

  const getX: PrimitiveFn = (_args, util) => limitPrecision(util.target.x);
  const getY: PrimitiveFn = (_args, util) => limitPrecision(util.target.y);
  const getDirection: PrimitiveFn = (_args, util) => util.target.direction;

  // Blok lama Scratch 2 (no-op), tetap terdaftar agar project lama berjalan.
  const noop: PrimitiveFn = () => undefined;

  return {
    getPrimitives: () => ({
      motion_movesteps: moveSteps,
      motion_gotoxy: goToXY,
      motion_goto: goTo,
      motion_turnright: turnRight,
      motion_turnleft: turnLeft,
      motion_pointindirection: pointInDirection,
      motion_pointtowards: pointTowards,
      motion_glidesecstoxy: glide,
      motion_glideto: glideTo,
      motion_ifonedgebounce: ifOnEdgeBounce,
      motion_setrotationstyle: setRotationStyle,
      motion_changexby: changeX,
      motion_setx: setX,
      motion_changeyby: changeY,
      motion_sety: setY,
      motion_xposition: getX,
      motion_yposition: getY,
      motion_direction: getDirection,
      motion_scroll_right: noop,
      motion_scroll_up: noop,
      motion_align_scene: noop,
      motion_xscroll: noop,
      motion_yscroll: noop,
    }),
    getHats: () => ({}),
    getMonitored: () => ({
      motion_xposition: { isSpriteSpecific: true, getId: (targetId) => `${targetId}_xposition` },
      motion_yposition: { isSpriteSpecific: true, getId: (targetId) => `${targetId}_yposition` },
      motion_direction: { isSpriteSpecific: true, getId: (targetId) => `${targetId}_direction` },
    }),
  };
};
