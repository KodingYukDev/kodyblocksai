/**
 * Lingkungan deterministik untuk parity: jam palsu (Date.now / new Date()) dan PRNG terpisah.
 *
 * - Awal frame: jam = epoch + frame * stepTime (bilangan bulat). `currentMSecs` (dibaca sekali di
 *   awal stepThreads) selalu bernilai ini, jadi wait/glide/timer deterministik.
 * - TICK VIRTUAL: setiap kali sequencer memeriksa WORK_TIME (`timer.timeElapsed()` dipanggil
 *   langsung dari `stepThreads`, dikenali lewat stack), jam maju `tickMs` (default 0.1 ms).
 *   Jadi satu frame = tepat WORK_TIME / tickMs tick (250 pada 30 fps) bila tidak ada redraw,
 *   sama untuk scratch-vm dan engine kita. Thread yang menunggu (wait, ask) tetap RUNNING di
 *   scratch-vm (YIELD direset ke RUNNING), sehingga tanpa tick virtual sequencer berputar selamanya.
 *   Syarat bagi engine kita: pemeriksaan WORK_TIME memakai `Timer.timeElapsed()` di method
 *   `stepThreads` (struktur sama dengan sequencer.js).
 * - Spin guard: pembacaan jam > `spinLimit` dalam satu frame (mis. wait di dalam warp yang
 *   menunggu WARP_TIME) membuat jam melompat agar frame selesai; kasus ditandai
 *   `spinGuardTriggered` dan dianggap tidak sah.
 * - PRNG dipisah dua aliran: `blockRandom` (blok: pick random, go to random, dsb.) dan `idRandom`
 *   (uid() scratch-vm saat memuat project / membuat clone). Tanpa pemisahan ini, uid() menggeser
 *   urutan angka acak oracle sehingga tidak bisa dibandingkan dengan engine kita.
 */

export const FAKE_EPOCH_MS = 1_700_000_000_000;
export const DEFAULT_SPIN_LIMIT = 200_000;
export const DEFAULT_TICK_MS = 0.1;

/** PRNG deterministik mulberry32. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function captureStack(limit: number): string {
  const prevLimit = Error.stackTraceLimit;
  Error.stackTraceLimit = limit;
  const stack = new Error().stack ?? "";
  Error.stackTraceLimit = prevLimit;
  return stack;
}

const OWN_FRAME = /fake-env|FakeClock|FakeDate/;
const TIME_ELAPSED = /\btimeElapsed\b/;
const STEP_THREADS = /\bstepThreads\b/;

/** true bila pemanggil jam adalah pemeriksaan WORK_TIME: Timer.timeElapsed <- stepThreads. */
export function calledFromWorkTimeCheck(): boolean {
  const frames = captureStack(8)
    .split("\n")
    .slice(1)
    .filter((l) => !OWN_FRAME.test(l));
  return TIME_ELAPSED.test(frames[0] ?? "") && STEP_THREADS.test(frames[1] ?? "");
}

export class FakeClock {
  private frameStart: number;
  private frames = 0;
  private reads = 0;
  private ticks = 0;
  spinGuardTriggered = false;
  /** Fungsi deteksi pemeriksaan WORK_TIME (bisa diganti di tes). */
  isWorkTimeCheck: () => boolean = calledFromWorkTimeCheck;

  constructor(
    readonly stepTime: number = 1000 / 30,
    readonly epoch: number = FAKE_EPOCH_MS,
    readonly spinLimit: number = DEFAULT_SPIN_LIMIT,
    readonly tickMs: number = DEFAULT_TICK_MS,
  ) {
    this.frameStart = epoch;
  }

  /** Waktu sekarang (ms): awal frame + tick virtual. */
  now(): number {
    this.reads++;
    if (this.reads > this.spinLimit) {
      this.spinGuardTriggered = true;
      // Lompat jauh melewati WORK_TIME (dan WARP_TIME) agar loop sequencer berhenti.
      return this.frameStart + 10_000;
    }
    const value = this.frameStart + this.ticks * this.tickMs;
    if (this.isWorkTimeCheck()) this.ticks++;
    return value;
  }

  /** Waktu awal frame berjalan (tanpa tick). */
  get frameStartTime(): number {
    return this.frameStart;
  }

  /** Jumlah tick sequencer pada frame berjalan. */
  get ticksThisFrame(): number {
    return this.ticks;
  }

  /** Mulai frame baru: jam maju satu stepTime, tick & penghitung spin direset. */
  beginFrame(): void {
    this.frames++;
    this.frameStart = Math.floor(this.epoch + this.frames * this.stepTime);
    this.reads = 0;
    this.ticks = 0;
  }
}

interface PendingTimer {
  id: number;
  due: number;
  seq: number;
  fn: (...args: unknown[]) => void;
  args: unknown[];
}

/**
 * setTimeout/clearTimeout palsu yang mengikuti FakeClock. Callback dijalankan di AWAL frame
 * (sebelum aksi IO dan step) bila waktunya sudah lewat, urut due lalu urutan daftar. Ini meniru
 * browser: timer (mis. bubble "say for secs" scratch-vm) berjalan di antara frame.
 */
export class FakeTimers {
  private readonly pending: PendingTimer[] = [];
  private nextId = 1;
  private seq = 0;

  constructor(private readonly clock: FakeClock) {}

  setTimeout(fn: (...args: unknown[]) => void, ms = 0, ...args: unknown[]): number {
    const id = this.nextId++;
    const delay = Number.isFinite(ms) && ms > 0 ? ms : 0;
    this.pending.push({ id, due: this.clock.now() + delay, seq: this.seq++, fn, args });
    return id;
  }

  /** true bila id milik timer palsu (selain itu teruskan ke clearTimeout asli). */
  clear(id: unknown): boolean {
    const i = this.pending.findIndex((t) => t.id === id);
    if (i >= 0) {
      this.pending.splice(i, 1);
      return true;
    }
    return typeof id === "number" && id < this.nextId;
  }

  /** Jalankan semua timer yang jatuh tempo pada awal frame. */
  runDue(): number {
    const now = this.clock.frameStartTime;
    let ran = 0;
    for (;;) {
      const due = this.pending.filter((t) => t.due <= now).sort((a, c) => a.due - c.due || a.seq - c.seq)[0];
      if (!due) return ran;
      this.pending.splice(this.pending.indexOf(due), 1);
      due.fn(...due.args);
      ran++;
    }
  }

  get size(): number {
    return this.pending.length;
  }
}

export interface DeterministicEnv {
  clock: FakeClock;
  timers: FakeTimers;
  /** Aliran acak untuk blok (diberikan ke RuntimeOptions.random engine kita). */
  blockRandom: () => number;
  /** Aliran acak untuk pembuatan id. */
  idRandom: () => number;
}

export function createDeterministicEnv(seed: number, stepTime: number): DeterministicEnv {
  const clock = new FakeClock(stepTime);
  return {
    clock,
    timers: new FakeTimers(clock),
    blockRandom: mulberry32(seed),
    // Konstanta beda agar aliran id tidak berkorelasi dengan aliran blok.
    idRandom: mulberry32((seed ^ 0x9e3779b9) >>> 0),
  };
}

const AT_UID = /\bat uid\b/;

/** Deteksi pemanggil uid() scratch-vm (nama fungsi dipertahankan di dist/node). */
function calledFromUid(): boolean {
  return AT_UID.test(captureStack(4));
}

export type RandomRouting = "oracle-split" | "id-only";

/**
 * Pasang Date.now, `new Date()` tanpa argumen, dan Math.random global. Mengembalikan fungsi restore.
 * - "oracle-split": Math.random -> idRandom bila dipanggil dari uid(), selain itu blockRandom.
 * - "id-only": Math.random -> idRandom (engine kita wajib memakai RuntimeOptions.random untuk blok).
 */
export function installDeterministicGlobals(env: DeterministicEnv, routing: RandomRouting): () => void {
  const RealDate = Date;
  const realRandom = Math.random;
  const clock = env.clock;

  class FakeDate extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(clock.now());
      else super(...(args as [string | number | Date]));
    }
    static override now(): number {
      return clock.now();
    }
  }
  globalThis.Date = FakeDate as DateConstructor;
  const realSetTimeout = globalThis.setTimeout;
  const realClearTimeout = globalThis.clearTimeout;
  const fakeSetTimeout = (fn: unknown, ms?: number, ...args: unknown[]) =>
    typeof fn === "function" ? env.timers.setTimeout(fn as (...a: unknown[]) => void, ms, ...args) : 0;
  globalThis.setTimeout = fakeSetTimeout as unknown as typeof setTimeout;
  globalThis.clearTimeout = ((id?: unknown) => {
    if (!env.timers.clear(id)) realClearTimeout(id as Parameters<typeof clearTimeout>[0]);
  }) as typeof clearTimeout;
  Math.random =
    routing === "oracle-split"
      ? () => (calledFromUid() ? env.idRandom() : env.blockRandom())
      : () => env.idRandom();
  return () => {
    globalThis.setTimeout = realSetTimeout;
    globalThis.clearTimeout = realClearTimeout;
    globalThis.Date = RealDate;
    Math.random = realRandom;
  };
}

/** Jalankan semua microtask yang tertunda (setImmediate = setelah antrean microtask kosong). */
export function flushMicrotasks(): Promise<void> {
  return new Promise<void>((resolve) => setImmediate(resolve));
}
