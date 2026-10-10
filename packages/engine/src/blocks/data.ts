/**
 * Primitive kategori Variables & Lists - port scratch-vm 4.8.102 src/blocks/scratch3_data.js (BSD-3-Clause).
 * Item list disimpan apa adanya (tanpa cast), sama seperti scratch-vm.
 */
import type { ScratchValue } from "../types/project-model";
import type {
  BlockArgs,
  BlockPackage,
  BlockPackageFactory,
  BlockUtility,
  FieldRef,
  IRuntime,
  PrimitiveFn,
} from "../types/runtime";
import type { Variable } from "../types/target";
import { Cast, LIST_ALL, LIST_INVALID } from "../util/cast";
import { getRuntimeRandom } from "../util/math-util";

/** Batas jumlah item list (Scratch3DataBlocks.LIST_ITEM_LIMIT). */
export const LIST_ITEM_LIMIT = 200000;

type ListVariable = Variable & { value: ScratchValue[] };

function fieldRef(value: unknown): FieldRef {
  if (typeof value === "object" && value !== null) {
    const v = value as Partial<FieldRef>;
    return { id: String(v.id ?? ""), name: String(v.name ?? "") };
  }
  return { id: "", name: "" };
}

function getVariable(args: BlockArgs, util: BlockUtility): Variable {
  const ref = fieldRef(args.VARIABLE);
  return util.target.lookupOrCreateVariable(ref.id, ref.name);
}

function getList(args: BlockArgs, util: BlockUtility): ListVariable {
  const ref = fieldRef(args.LIST);
  const list = util.target.lookupOrCreateList(ref.id, ref.name);
  if (!Array.isArray(list.value)) list.value = [];
  return list as ListVariable;
}

/** Item list mentah: execute memberi string/number/boolean. */
function asItem(value: unknown): ScratchValue {
  return value as ScratchValue;
}

function requestCloudUpdate(util: BlockUtility, variable: Variable, value: ScratchValue): void {
  if (!variable.isCloud) return;
  // IODevices belum punya "cloud"; ioQuery scratch-vm diam saja bila perangkat tidak ada.
  const devices = util.runtime.ioDevices as unknown as Record<string, unknown>;
  if (!devices["cloud"]) return;
  const ioQuery = util.ioQuery as unknown as (device: string, func: string, args?: unknown[]) => unknown;
  ioQuery.call(util, "cloud", "requestUpdateVariable", [variable.name, value]);
}

/** data_listcontents di luar monitor: digabung tanpa spasi bila semua item string 1 karakter. */
export function listContentsToString(items: readonly ScratchValue[]): string {
  let allSingleLetters = true;
  for (const item of items) {
    if (!(typeof item === "string" && item.length === 1)) {
      allSingleLetters = false;
      break;
    }
  }
  return allSingleLetters ? items.join("") : items.join(" ");
}

export const createDataBlocks: BlockPackageFactory = (runtime: IRuntime): BlockPackage => {
  const changeMonitorVisibility = (id: string, visible: boolean): void => {
    // Meniru event checkbox flyout: memperbarui state monitor dan flag isMonitored blok.
    runtime.monitorBlocks.changeBlock({ id, element: "checkbox", value: visible });
  };

  const primitives: Record<string, PrimitiveFn> = {
    data_variable: (args, util) => getVariable(args, util).value as ScratchValue,

    data_setvariableto: (args, util) => {
      const variable = getVariable(args, util);
      const value = asItem(args.VALUE);
      variable.value = value;
      requestCloudUpdate(util, variable, value);
    },

    data_changevariableby: (args, util) => {
      const variable = getVariable(args, util);
      const castedValue = Cast.toNumber(variable.value);
      const dValue = Cast.toNumber(args.VALUE);
      const newValue = castedValue + dValue;
      variable.value = newValue;
      requestCloudUpdate(util, variable, newValue);
    },

    data_showvariable: (args) => changeMonitorVisibility(fieldRef(args.VARIABLE).id, true),
    data_hidevariable: (args) => changeMonitorVisibility(fieldRef(args.VARIABLE).id, false),
    data_showlist: (args) => changeMonitorVisibility(fieldRef(args.LIST).id, true),
    data_hidelist: (args) => changeMonitorVisibility(fieldRef(args.LIST).id, false),

    data_listcontents: (args, util) => {
      const list = getList(args, util);
      if (util.thread.updateMonitor) {
        // Monitor hanya diperbarui bila objek berubah: kembalikan salinan saat list berubah.
        if (list._monitorUpToDate) return list.value as unknown as ScratchValue;
        list._monitorUpToDate = true;
        return list.value.slice() as unknown as ScratchValue;
      }
      return listContentsToString(list.value);
    },

    data_addtolist: (args, util) => {
      const list = getList(args, util);
      if (list.value.length < LIST_ITEM_LIMIT) {
        list.value.push(asItem(args.ITEM));
        list._monitorUpToDate = false;
      }
    },

    data_deleteoflist: (args, util) => {
      const list = getList(args, util);
      const index = Cast.toListIndex(args.INDEX, list.value.length, true, getRuntimeRandom(runtime));
      if (index === LIST_INVALID) return;
      if (index === LIST_ALL) {
        list.value = [];
        return;
      }
      list.value.splice(index - 1, 1);
      list._monitorUpToDate = false;
    },

    data_deletealloflist: (args, util) => {
      const list = getList(args, util);
      list.value = [];
    },

    data_insertatlist: (args, util) => {
      const item = asItem(args.ITEM);
      const list = getList(args, util);
      const index = Cast.toListIndex(args.INDEX, list.value.length + 1, false, getRuntimeRandom(runtime));
      if (index === LIST_INVALID || index === LIST_ALL) return;
      if (index > LIST_ITEM_LIMIT) return;
      list.value.splice(index - 1, 0, item);
      // Bila sisipan membuat list melebihi batas, buang item terakhir.
      if (list.value.length > LIST_ITEM_LIMIT) list.value.pop();
      list._monitorUpToDate = false;
    },

    data_replaceitemoflist: (args, util) => {
      const item = asItem(args.ITEM);
      const list = getList(args, util);
      const index = Cast.toListIndex(args.INDEX, list.value.length, false, getRuntimeRandom(runtime));
      if (index === LIST_INVALID || index === LIST_ALL) return;
      list.value[index - 1] = item;
      list._monitorUpToDate = false;
    },

    data_itemoflist: (args, util) => {
      const list = getList(args, util);
      const index = Cast.toListIndex(args.INDEX, list.value.length, false, getRuntimeRandom(runtime));
      if (index === LIST_INVALID || index === LIST_ALL) return "";
      return list.value[index - 1];
    },

    data_itemnumoflist: (args, util) => {
      const item = args.ITEM;
      const list = getList(args, util);
      // Cast.compare agar 123 dan "123" dianggap sama; item pertama yang cocok menang.
      for (let i = 0; i < list.value.length; i++) {
        if (Cast.compare(list.value[i], item) === 0) return i + 1;
      }
      return 0;
    },

    data_lengthoflist: (args, util) => getList(args, util).value.length,

    data_listcontainsitem: (args, util) => {
      const item = args.ITEM;
      const list = getList(args, util);
      if (list.value.indexOf(item as ScratchValue) >= 0) return true;
      for (let i = 0; i < list.value.length; i++) {
        if (Cast.compare(list.value[i], item) === 0) return true;
      }
      return false;
    },
  };

  return {
    getPrimitives: () => primitives,
    getHats: () => ({}),
    getMonitored: () => ({}),
  };
};
