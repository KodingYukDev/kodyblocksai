/**
 * Mouse (padanan scratch-vm 4.8.102 io/mouse.js, BSD-3-Clause; lihat THIRD_PARTY.md):
 * konversi koordinat klien -> Scratch (dibulatkan + clamp), klik sprite/stage.
 * Pemilik: agent engine-core.
 */
import type { IMouse, MouseData } from "../types/io";
import type { IRuntime } from "../types/runtime";
import type { ITarget } from "../types/target";
import { MathUtil } from "../util/math-util";

export class Mouse implements IMouse {
  private clientX = 0;
  private clientY = 0;
  private scratchX = 0;
  private scratchY = 0;
  /** Koordinat panggung tanpa pembulatan (scratch-render memakai posisi asli untuk sentuhan). */
  private stageX = 0;
  private stageY = 0;
  private isDown = false;

  constructor(private readonly runtime: IRuntime) {}

  private activateClickHats(target: ITarget): void {
    this.runtime.startHats("event_whenthisspriteclicked", undefined, target);
    this.runtime.startHats("event_whenstageclicked", undefined, target);
  }

  private pickTarget(stageX: number, stageY: number): ITarget | undefined {
    const renderer = this.runtime.renderer;
    if (renderer) {
      const drawableId = renderer.pick(stageX, stageY);
      for (const target of this.runtime.targets) {
        if (target.drawableId !== -1 && target.drawableId === drawableId) return target;
      }
    }
    return this.runtime.getTargetForStage();
  }

  postData(data: MouseData): void {
    const w = data.canvasWidth ?? 0;
    const h = data.canvasHeight ?? 0;
    // Persis mouse.js: koordinat 0 (falsy) diabaikan.
    if (data.x) {
      this.clientX = data.x;
      this.stageX = 480 * (data.x / w - 0.5);
      this.scratchX = Math.round(MathUtil.clamp(this.stageX, -240, 240));
    }
    if (data.y) {
      this.clientY = data.y;
      this.stageY = -360 * (data.y / h - 0.5);
      this.scratchY = Math.round(MathUtil.clamp(this.stageY, -180, 180));
    }
    if (typeof data.isDown !== "undefined") {
      const previousDownState = this.isDown;
      this.isDown = data.isDown;
      if (previousDownState === this.isDown) return;
      // Akhir drag tidak dihitung sebagai klik.
      if (data.wasDragged) return;
      // Klik di luar panggung diabaikan.
      const x = data.x ?? 0;
      const y = data.y ?? 0;
      if (!(x > 0 && x < w && y > 0 && y < h)) return;
      const target = this.pickTarget(480 * (x / w - 0.5), -360 * (y / h - 0.5));
      if (!target) return;
      const isNewMouseDown = !previousDownState && this.isDown;
      const isNewMouseUp = previousDownState && !this.isDown;
      // Sprite yang bisa di-drag dianggap diklik saat dilepas; selainnya saat ditekan.
      if (target.draggable && isNewMouseUp) this.activateClickHats(target);
      else if (!target.draggable && isNewMouseDown) this.activateClickHats(target);
    }
  }

  getClientX(): number {
    return this.clientX;
  }
  getClientY(): number {
    return this.clientY;
  }
  getScratchX(): number {
    return this.scratchX;
  }
  getScratchY(): number {
    return this.scratchY;
  }
  /** Koordinat panggung tanpa pembulatan/clamp (untuk sentuhan "mouse-pointer"). */
  getStageX(): number {
    return this.stageX;
  }
  getStageY(): number {
    return this.stageY;
  }
  getIsDown(): boolean {
    return this.isDown;
  }
}

export function createMouse(runtime: IRuntime): IMouse {
  return new Mouse(runtime);
}
