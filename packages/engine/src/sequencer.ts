/**
 * Sequencer (padanan scratch-vm 4.8.102 engine/sequencer.js, BSD-3-Clause; lihat THIRD_PARTY.md):
 * WORK_TIME = 75% currentStepTime, berhenti saat redraw diminta (kecuali turbo), warp mode dengan
 * WARP_TIME 500 ms. Pemilik: agent engine-core.
 */
import { execute } from "./execute";
import { Thread } from "./thread";
import { ThreadStatus, WARP_TIME, type IRuntime, type ISequencer, type IThread } from "./types/runtime";
import { Timer, defaultTimeSource, type TimeSource } from "./util/timer";

/** Runtime yang dibutuhkan sequencer: IRuntime + updateCurrentMSecs (scratch-vm). */
export interface SequencerRuntime extends IRuntime {
  updateCurrentMSecs(): void;
}

export class Sequencer implements ISequencer {
  readonly runtime: SequencerRuntime;
  readonly timer: Timer;
  /** Thread yang sedang dijalankan (stopAll menghentikannya). */
  activeThread: IThread | null = null;
  /** Jam nyata (performance.now padanan Timer default scratch-vm); dipakai juga glide. */
  readonly timeSource: TimeSource;

  constructor(runtime: SequencerRuntime, timeSource: TimeSource = defaultTimeSource) {
    this.runtime = runtime;
    this.timeSource = timeSource;
    this.timer = new Timer(timeSource);
  }

  stepThreads(): IThread[] {
    // Waktu kerja = 75% interval step.
    const WORK_TIME = 0.75 * this.runtime.currentStepTime;
    // Jam milidetik runtime diperbarui sekali per step (kompatibel Scratch 2).
    this.runtime.updateCurrentMSecs();
    this.timer.start();
    let numActiveThreads = Infinity;
    // Sudah menjalankan satu tick penuh?
    let ranFirstTick = false;
    const doneThreads: IThread[] = [];

    // Lanjut selama: ada thread aktif, waktu < WORK_TIME, dan (turbo atau belum ada redraw).
    while (
      this.runtime.threads.length > 0 &&
      numActiveThreads > 0 &&
      this.timer.timeElapsed() < WORK_TIME &&
      (this.runtime.turboMode || !this.runtime.redrawRequested)
    ) {
      numActiveThreads = 0;
      let stoppedThread = false;
      // Jalankan setiap thread satu kali. Referensi array diambil sekali (stopAll mengganti array).
      const threads = this.runtime.threads;
      for (let i = 0; i < threads.length; i++) {
        const activeThread = (this.activeThread = threads[i] ?? null);
        if (!activeThread) continue;
        if (activeThread.stack.length === 0 || activeThread.status === ThreadStatus.DONE) {
          stoppedThread = true;
          continue;
        }
        if (activeThread.status === ThreadStatus.YIELD_TICK && !ranFirstTick) {
          // Hapus yield satu-tick dari stepThreads sebelumnya.
          activeThread.status = ThreadStatus.RUNNING;
        }
        if (activeThread.status === ThreadStatus.RUNNING || activeThread.status === ThreadStatus.YIELD) {
          this.stepThread(activeThread);
          activeThread.warpTimer = null;
          if (activeThread.isKilled) {
            i--; // thread dibuang dari daftar: jangan naikkan indeks
          }
        }
        // stepThread bisa mengubah status (TypeScript tidak melihatnya).
        const statusAfter = activeThread.status as ThreadStatus;
        if (statusAfter === ThreadStatus.RUNNING) numActiveThreads++;
        if (activeThread.stack.length === 0 || statusAfter === ThreadStatus.DONE) {
          stoppedThread = true;
        }
      }
      // Satu tick selesai: thread YIELD_TICK tidak dijalankan lagi frame ini.
      ranFirstTick = true;

      // Buang thread tidak aktif dari runtime.threads (in-place).
      if (stoppedThread) {
        const current = this.runtime.threads;
        let nextActiveThread = 0;
        for (let i = 0; i < current.length; i++) {
          const thread = current[i];
          if (!thread) continue;
          if (thread.stack.length !== 0 && thread.status !== ThreadStatus.DONE) {
            current[nextActiveThread] = thread;
            nextActiveThread++;
          } else {
            doneThreads.push(thread);
          }
        }
        current.length = nextActiveThread;
      }
    }
    this.activeThread = null;
    return doneThreads;
  }

  stepThread(thread: IThread): void {
    let currentBlockId = thread.peekStack();
    if (!currentBlockId) {
      // Blok "null" = cabang kosong.
      thread.popStack();
      // Null setelah hat?
      if (thread.stack.length === 0) {
        thread.status = ThreadStatus.DONE;
        return;
      }
    }

    while ((currentBlockId = thread.peekStack())) {
      let isWarpMode = thread.peekStackFrame()?.warpMode ?? false;
      if (isWarpMode && !thread.warpTimer) {
        // Mulai hitung waktu warp (WARP_TIME).
        const warpTimer = new Timer(this.timeSource);
        warpTimer.start();
        thread.warpTimer = warpTimer;
      }
      execute(this, thread);
      thread.blockGlowInFrame = currentBlockId;

      // Thread menyerah atau menunggu: beri giliran thread lain.
      if (thread.status === ThreadStatus.YIELD) {
        thread.status = ThreadStatus.RUNNING;
        // Dalam warp, blok yang yield dijalankan ulang segera.
        if (isWarpMode && thread.warpTimer && thread.warpTimer.timeElapsed() <= WARP_TIME) continue;
        return;
      } else if (thread.status === ThreadStatus.PROMISE_WAIT) {
        // Promise yang resolve akan mengembalikan status ke RUNNING.
        return;
      } else if (thread.status === ThreadStatus.YIELD_TICK) {
        // stepThreads mengembalikan ke RUNNING pada frame berikutnya.
        return;
      }

      // Tanpa control flow: pindah ke blok berikutnya.
      if (thread.peekStack() === currentBlockId) thread.goToNextBlock();

      // Tidak ada blok berikutnya: telusuri stack.
      while (!thread.peekStack()) {
        thread.popStack();
        if (thread.stack.length === 0) {
          thread.status = ThreadStatus.DONE;
          return;
        }
        const stackFrame = thread.peekStackFrame();
        if (!stackFrame) return;
        isWarpMode = stackFrame.warpMode;
        if (stackFrame.isLoop) {
          // Loop: yield per frame, kecuali warp dan waktu warp belum habis.
          if (!isWarpMode || (thread.warpTimer?.timeElapsed() ?? 0) > WARP_TIME) return;
          // Jangan pindah ke blok berikutnya: loop dijalankan ulang.
          continue;
        } else if (stackFrame.waitingReporter) {
          // Level ini menunggu nilai reporter yang baru selesai.
          return;
        }
        thread.goToNextBlock();
      }
    }
  }

  stepToBranch(thread: IThread, branchNum: number, isLoop: boolean): void {
    const num = branchNum || 1;
    const currentBlockId = thread.peekStack();
    const branchId = currentBlockId ? thread.target.blocks.getBranch(currentBlockId, num) : null;
    const frame = thread.peekStackFrame();
    if (frame) frame.isLoop = isLoop;
    // Cabang kosong -> penanda null.
    (thread as Thread).pushStack(branchId);
  }

  stepToProcedure(thread: IThread, procedureCode: string): void {
    const definition = thread.target.blocks.getProcedureDefinition(procedureCode);
    if (!definition) return;
    // Panggilan rekursif? (dicek sebelum definisi didorong)
    const isRecursive = thread.isRecursiveCall(procedureCode);
    // Masukkan definisi ke stack; sequencer lanjut ke isi procedure lalu kembali ke pemanggil.
    thread.pushStack(definition);
    const frame = thread.peekStackFrame();
    if (frame?.warpMode && (thread.warpTimer?.timeElapsed() ?? 0) > WARP_TIME) {
      // Thread warp: yield hanya bila waktu warp habis.
      thread.status = ThreadStatus.YIELD;
    } else {
      // Cek flag warp ("run without screen refresh") di prototype.
      const definitionBlock = thread.target.blocks.getBlock(definition);
      const innerId = definitionBlock?.inputs.custom_block?.block;
      const innerBlock = innerId ? thread.target.blocks.getBlock(innerId) : undefined;
      let doWarp = false;
      if (innerBlock && innerBlock.mutation) {
        const warp = innerBlock.mutation.warp;
        if (typeof warp === "boolean") {
          doWarp = warp;
        } else if (typeof warp === "string") {
          try {
            doWarp = Boolean(JSON.parse(warp));
          } catch {
            doWarp = false;
          }
        }
      }
      if (doWarp) {
        if (frame) frame.warpMode = true;
      } else if (isRecursive) {
        // Thread normal: yield setiap panggilan rekursif.
        thread.status = ThreadStatus.YIELD;
      }
    }
  }

  retireThread(thread: IThread): void {
    thread.stack = [];
    // scratch-vm menulis `thread.stackFrame = []` (salah ketik) sehingga stackFrames tidak dikosongkan;
    // tidak teramati karena thread selesai dibuang dari daftar.
    thread.requestScriptGlowInFrame = false;
    thread.status = ThreadStatus.DONE;
  }
}

export function createSequencer(runtime: IRuntime, timeSource?: TimeSource): ISequencer {
  const rt = runtime as Partial<SequencerRuntime>;
  if (typeof rt.updateCurrentMSecs !== "function") {
    throw new Error("createSequencer: runtime harus menyediakan updateCurrentMSecs()");
  }
  return new Sequencer(runtime as SequencerRuntime, timeSource);
}
