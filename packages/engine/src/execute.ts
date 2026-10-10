/**
 * Eksekusi satu blok + reporter bersarang (padanan scratch-vm 4.8.102 engine/execute.js,
 * BSD-3-Clause; lihat THIRD_PARTY.md): Promise (PROMISE_WAIT), hat edge-activated, glow,
 * visual report, monitor, pembacaan shadow/field. Pemilik: agent engine-core.
 */
import { BlockUtilityImpl } from "./block-utility";
import { isBlocksContainer, type ContainerBlock } from "./blocks-container";
import { Cast } from "./cast";
import { asRenderedTarget } from "./runtime-internal";
import type { Block, BlockField, BlockInput, BlockMutation, ScratchValue } from "./types/project-model";
import {
  ThreadStatus,
  type BlockArgs,
  type IBlocksContainer,
  type IRuntime,
  type ISequencer,
  type IThread,
  type PrimitiveFn,
} from "./types/runtime";

type ArgValues = BlockArgs & Record<string, unknown>;
interface BroadcastOption {
  id: string | null;
  name: string | null;
}

/** Nilai reporter yang sudah dilaporkan sebelum Promise (stackFrame.reported). */
interface ReportedEntry {
  opCached: string;
  inputValue: unknown;
}

function isPromise(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

/** Representasi blok siap-eksekusi (BlockCached di execute.js). */
export class BlockCached {
  readonly id: string;
  readonly opcode: string;
  readonly fields: Record<string, BlockField>;
  readonly inputs: Record<string, BlockInput>;
  readonly mutation: BlockMutation | null;
  _isHat = false;
  _blockFunction: PrimitiveFn | undefined;
  _definedBlockFunction = false;
  _isShadowBlock = false;
  _shadowValue: unknown = null;
  _argValues: ArgValues;
  _parentKey: string | null = null;
  _parentValues: ArgValues | null = null;
  _ops: BlockCached[] = [];

  constructor(runtime: IRuntime, container: IBlocksContainer, block: Block) {
    this.id = block.id;
    this.opcode = container.getOpcode(block) ?? "";
    this.fields = container.getFields(block) ?? {};
    this.inputs = container.getInputs(block) ?? {};
    this.mutation = container.getMutation(block);
    this._argValues = { mutation: this.mutation };

    const { opcode, fields } = this;
    this._isHat = runtime.getIsHat(opcode);
    this._blockFunction = runtime.getOpcodeFunction(opcode);
    this._definedBlockFunction = typeof this._blockFunction !== "undefined";

    // Shadow = tanpa fungsi, tepat satu field, tanpa input. Nilainya statis.
    const fieldKeys = Object.keys(fields);
    this._isShadowBlock = !this._definedBlockFunction && fieldKeys.length === 1 && Object.keys(this.inputs).length === 0;
    this._shadowValue = this._isShadowBlock ? fields[fieldKeys[0] ?? ""]?.value : false;

    for (const fieldName in fields) {
      const field = fields[fieldName];
      if (!field) continue;
      if (fieldName === "VARIABLE" || fieldName === "LIST" || fieldName === "BROADCAST_OPTION") {
        this._argValues[fieldName] = { id: field.id ?? null, name: field.value };
      } else {
        this._argValues[fieldName] = field.value;
      }
    }

    const inputs: Record<string, BlockInput> = { ...this.inputs };
    // custom_block bukan bagian eksekusi.
    delete inputs.custom_block;

    if ("BROADCAST_INPUT" in inputs) {
      // BROADCAST_INPUT dikirim sebagai BROADCAST_OPTION {id, name}.
      const option: BroadcastOption = { id: null, name: null };
      this._argValues.BROADCAST_OPTION = option;
      const broadcastInput = inputs.BROADCAST_INPUT;
      if (broadcastInput && broadcastInput.block === broadcastInput.shadow && broadcastInput.shadow) {
        const shadow = container.getBlock(broadcastInput.shadow);
        const broadcastField = shadow?.fields.BROADCAST_OPTION;
        if (broadcastField) {
          option.id = broadcastField.id ?? null;
          option.name = String(broadcastField.value);
        }
        delete inputs.BROADCAST_INPUT;
      }
    }

    // Ratakan semua reporter anak ke daftar operasi (urutan = urutan evaluasi).
    for (const inputName in inputs) {
      const input = inputs[inputName];
      if (!input || !input.block) continue;
      const inputCached = getCached(runtime, container, input.block);
      if (!inputCached || inputCached._isHat) continue;
      this._ops.push(...inputCached._ops);
      inputCached._parentKey = inputName;
      inputCached._parentValues = this._argValues;
      if (inputCached._isShadowBlock) this._argValues[inputName] = inputCached._shadowValue;
    }

    // Operasi terakhir adalah blok ini sendiri.
    if (this._definedBlockFunction) this._ops.push(this);
  }
}

const fallbackCaches = new WeakMap<IBlocksContainer, Map<string, BlockCached>>();

/** BlocksExecuteCache.getCached. */
export function getCached(runtime: IRuntime, container: IBlocksContainer, blockId: string): BlockCached | null {
  if (isBlocksContainer(container)) {
    return container.getExecuteCached(blockId, (block) => new BlockCached(runtime, container, block));
  }
  // Container asing: cache sederhana (tanpa invalidasi otomatis).
  let map = fallbackCaches.get(container);
  if (!map) {
    map = new Map();
    fallbackCaches.set(container, map);
  }
  const hit = map.get(blockId);
  if (hit) return hit;
  const block = container.getBlock(blockId);
  if (!block) return null;
  const created = new BlockCached(runtime, container, block);
  map.set(blockId, created);
  return created;
}

const utilities = new WeakMap<ISequencer, BlockUtilityImpl>();

function utilityFor(sequencer: ISequencer): BlockUtilityImpl {
  let util = utilities.get(sequencer);
  if (!util) {
    util = new BlockUtilityImpl(sequencer, null);
    utilities.set(sequencer, util);
  }
  return util;
}

function setParentValue(opCached: BlockCached, value: unknown): void {
  const inputName = opCached._parentKey;
  const parentValues = opCached._parentValues;
  if (!inputName || !parentValues) return;
  if (inputName === "BROADCAST_INPUT") {
    // Reporter di input broadcast: cast ke string, tanpa id.
    const option = parentValues.BROADCAST_OPTION as BroadcastOption;
    option.id = null;
    option.name = Cast.toString(value);
  } else {
    parentValues[inputName] = value;
  }
}

function handleReport(
  resolvedValue: unknown,
  sequencer: ISequencer,
  thread: IThread,
  blockCached: BlockCached,
  lastOperation: boolean,
): void {
  const currentBlockId = blockCached.id;
  const opcode = blockCached.opcode;
  const runtime = sequencer.runtime;
  thread.pushReportedValue(resolvedValue as ScratchValue);
  if (blockCached._isHat) {
    if (runtime.getIsEdgeActivatedHat(opcode)) {
      // Hat edge: lanjut hanya bila nilai berubah false -> true (atau dipicu stack click).
      if (!thread.stackClick) {
        const target = asRenderedTarget(thread.target);
        const hasOldEdgeValue = target ? target.hasEdgeActivatedValue(currentBlockId) : false;
        const oldEdgeValue = target ? target.updateEdgeActivatedValue(currentBlockId, resolvedValue) : undefined;
        const edgeWasActivated = hasOldEdgeValue ? !oldEdgeValue && resolvedValue : resolvedValue;
        if (!edgeWasActivated) sequencer.retireThread(thread);
      }
    } else if (!resolvedValue) {
      sequencer.retireThread(thread);
    }
    return;
  }
  // Non-hat: laporan visual bila ini operasi terakhir di puncak stack.
  if (lastOperation && typeof resolvedValue !== "undefined" && thread.atStackTop()) {
    if (thread.stackClick) runtime.visualReport(currentBlockId, resolvedValue as ScratchValue);
    if (thread.updateMonitor) {
      const monitorBlock = runtime.monitorBlocks.getBlock(currentBlockId) as ContainerBlock | undefined;
      const targetId = monitorBlock?.targetId ?? null;
      if (targetId && !runtime.getTargetById(targetId)) return; // target sudah tidak ada
      runtime.requestUpdateMonitor({
        id: currentBlockId,
        spriteName: targetId ? (runtime.getTargetById(targetId)?.getName() ?? null) : null,
        value: resolvedValue as ScratchValue,
      });
    }
  }
  thread.status = ThreadStatus.RUNNING;
}

function handlePromise(
  promise: PromiseLike<unknown>,
  sequencer: ISequencer,
  thread: IThread,
  blockCached: BlockCached,
  lastOperation: boolean,
): void {
  if (thread.status === ThreadStatus.RUNNING) thread.status = ThreadStatus.PROMISE_WAIT;
  promise.then(
    (resolvedValue) => {
      handleReport(resolvedValue, sequencer, thread, blockCached, lastOperation);
      if (lastOperation) {
        // Blok command (atau reporter puncak): pop sampai ketemu blok berikutnya.
        let nextBlockId: string | null = null;
        let stackFrame;
        do {
          const popped = thread.popStack();
          if (popped === "") return; // penanda cabang kosong (scratch-vm: null)
          nextBlockId = popped === undefined ? null : thread.target.blocks.getNextBlock(popped);
          if (nextBlockId !== null) break;
          stackFrame = thread.peekStackFrame();
        } while (stackFrame !== undefined && !stackFrame.isLoop);
        thread.pushStack(nextBlockId as string);
      }
    },
    (rejectionReason: unknown) => {
      // Promise ditolak: catat lalu lanjut (scratch-vm log.warn).
      sequencer.runtime.emit("RUNTIME_ERROR", { error: rejectionReason, blockId: blockCached.id, opcode: blockCached.opcode });
      thread.status = ThreadStatus.RUNNING;
      thread.popStack();
    },
  );
}

export function execute(sequencer: ISequencer, thread: IThread): void {
  const runtime = sequencer.runtime;
  const util = utilityFor(sequencer);
  util.sequencer = sequencer;
  util.setThread(thread);

  const currentBlockId = thread.peekStack();
  const currentStackFrame = thread.peekStackFrame();
  if (!currentBlockId || !currentStackFrame) {
    sequencer.retireThread(thread);
    return;
  }

  let blockContainer: IBlocksContainer = thread.blockContainer;
  let blockCached = getCached(runtime, blockContainer, currentBlockId);
  if (blockCached === null) {
    blockContainer = runtime.flyoutBlocks;
    blockCached = getCached(runtime, blockContainer, currentBlockId);
    // Blok atau target sudah tidak ada: hentikan thread.
    if (blockCached === null) {
      sequencer.retireThread(thread);
      return;
    }
  }

  const ops = blockCached._ops;
  const length = ops.length;
  let i = 0;

  if (currentStackFrame.reported !== null) {
    const reported = currentStackFrame.reported as unknown as ReportedEntry[];
    // Kembalikan nilai-nilai yang sudah dilaporkan sebelum Promise.
    for (; i < reported.length; i++) {
      const entry = reported[i];
      if (!entry) continue;
      const opCached = ops.find((op) => op.id === entry.opCached);
      if (opCached) setParentValue(opCached, entry.inputValue);
    }
    // Cari operasi terakhir yang masih ada (blok bisa dihapus selama menunggu).
    if (reported.length > 0) {
      const lastExisting = reported.reverse().find((report) => ops.find((op) => op.id === report.opCached));
      i = lastExisting ? ops.findIndex((op) => op.id === lastExisting.opCached) + 1 : 0;
    }
    // Reporter yang ditunggu harus operasi berikutnya.
    const reportingOp = ops[i];
    if (thread.justReported !== null && reportingOp && reportingOp.id === currentStackFrame.reporting) {
      const inputValue = thread.justReported;
      thread.justReported = null;
      setParentValue(reportingOp, inputValue);
      i += 1;
    }
    currentStackFrame.reporting = "";
    currentStackFrame.reported = null;
  }

  for (; i < length; i++) {
    const lastOperation = i === length - 1;
    const opCached = ops[i];
    if (!opCached || !opCached._blockFunction) continue;
    // Glow saat skrip mulai (bukan setelah selesai); container flyout/monitor tidak glow.
    if (!blockContainer.forceNoGlow) thread.requestScriptGlowInFrame = true;

    let primitiveReportedValue: unknown;
    try {
      primitiveReportedValue = opCached._blockFunction(opCached._argValues, util);
    } catch (error) {
      // scratch-vm tidak menangkap error primitive; di sini dilaporkan dan diperlakukan sebagai undefined
      // agar satu blok rusak tidak menghentikan loop frame.
      runtime.emit("RUNTIME_ERROR", { error, blockId: opCached.id, opcode: opCached.opcode });
      primitiveReportedValue = undefined;
    }

    if (isPromise(primitiveReportedValue)) {
      handlePromise(primitiveReportedValue, sequencer, thread, opCached, lastOperation);
      // Simpan nilai yang sudah dilaporkan; dipulihkan per id blok saat lanjut.
      thread.justReported = null;
      currentStackFrame.reporting = opCached.id;
      currentStackFrame.reported = ops.slice(0, i).map((reportedCached) => {
        const inputName = reportedCached._parentKey ?? "";
        const reportedValues = reportedCached._parentValues ?? {};
        if (inputName === "BROADCAST_INPUT") {
          return {
            opCached: reportedCached.id,
            inputValue: (reportedValues.BROADCAST_OPTION as BroadcastOption).name,
          };
        }
        return { opCached: reportedCached.id, inputValue: reportedValues[inputName] };
      }) as unknown as Record<string, unknown>;
      break;
    } else if (thread.status === ThreadStatus.RUNNING) {
      if (lastOperation) {
        handleReport(primitiveReportedValue, sequencer, thread, opCached, lastOperation);
      } else {
        setParentValue(opCached, primitiveReportedValue);
      }
    }
  }
}
