/**
 * Penjaga memori tfjs: setiap inferensi dibungkus; tensor yang bocor dicatat, dan bila total memori
 * melewati batas, pemanggil diberi tahu agar model dilepas (mencegah tab crash di laptop/HP murah).
 */

export interface TfMemoryLike {
  memory(): { numTensors: number; numBytes: number };
}

export const TENSOR_LIMITS = {
  /** Batas total memori tensor (byte) sebelum model dilepas paksa. */
  maxTensorBytes: 384 * 1024 * 1024,
  /** Toleransi tensor bocor kumulatif sebelum dianggap bermasalah. */
  maxLeakedTensors: 64,
} as const;

export class TensorBudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TensorBudgetError";
  }
}

export class TensorGuard {
  private leaked = 0;

  constructor(
    private readonly tf: TfMemoryLike,
    private readonly limits: { maxTensorBytes: number; maxLeakedTensors: number } = TENSOR_LIMITS,
  ) {}

  get leakedTensors(): number {
    return this.leaked;
  }

  /** Jalankan fn; lempar TensorBudgetError bila memori/kebocoran melewati batas. */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    const before = this.tf.memory().numTensors;
    const result = await fn();
    const after = this.tf.memory();
    if (after.numTensors > before) this.leaked += after.numTensors - before;
    if (after.numBytes > this.limits.maxTensorBytes) {
      throw new TensorBudgetError(`memori tensor ${Math.round(after.numBytes / 1048576)} MB melewati batas`);
    }
    if (this.leaked > this.limits.maxLeakedTensors) {
      throw new TensorBudgetError(`${this.leaked} tensor bocor`);
    }
    return result;
  }

  reset(): void {
    this.leaked = 0;
  }
}
