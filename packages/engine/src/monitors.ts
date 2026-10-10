/**
 * Helper monitor (scratch-vm engine/monitor-record.js, util/get-monitor-id.js + state monitor
 * runtime.js; port dari scratch-vm 4.8.102, BSD-3-Clause). Pemilik: agent engine-core.
 */
import { DEFAULT_MONITOR, type MonitorRecord } from "./types/monitor";
import type { BlockField } from "./types/project-model";

/** Id monitor untuk blok ber-field (mis. "current_year"), persis scratch-vm getMonitorIdForBlockWithArgs. */
export function getMonitorIdForBlockWithArgs(id: string, fields: Record<string, BlockField>): string {
  let fieldString = "";
  for (const fieldKey in fields) {
    let fieldValue = String(fields[fieldKey]?.value ?? "");
    if (fieldKey === "CURRENTMENU") {
      fieldValue = fieldValue.toLowerCase();
    }
    fieldString += `_${fieldValue}`;
  }
  return `${id}${fieldString}`;
}

/** MonitorRecord lengkap dengan default scratch-vm (Record immutable MonitorRecord). */
export function createMonitorRecord(partial: Partial<MonitorRecord> & { id: string; opcode: string }): MonitorRecord {
  return { ...DEFAULT_MONITOR, params: {}, ...partial };
}

/** Kesamaan nilai seperti Immutable.is untuk nilai biasa (array dibandingkan per referensi). */
function sameValue(a: unknown, b: unknown): boolean {
  return Object.is(a, b);
}

function sameRecord(a: MonitorRecord, b: MonitorRecord): boolean {
  if (a === b) return true;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof MonitorRecord>;
  for (const key of keys) {
    if (key === "params") {
      const pa = a.params;
      const pb = b.params;
      const pk = new Set([...Object.keys(pa), ...Object.keys(pb)]);
      for (const k of pk) if (pa[k] !== pb[k]) return false;
      continue;
    }
    if (!sameValue(a[key], b[key])) return false;
  }
  return true;
}

/**
 * State monitor runtime (padanan `_monitorState` OrderedMap). Setiap perubahan membuat Map baru
 * (copy-on-write) sehingga snapshot yang sudah dikirim ke UI tidak berubah.
 */
export class MonitorStore {
  private state: Map<string, MonitorRecord> = new Map();
  private prevState: Map<string, MonitorRecord> = this.state;

  get current(): ReadonlyMap<string, MonitorRecord> {
    return this.state;
  }

  has(id: string): boolean {
    return this.state.has(id);
  }

  /** requestAddMonitor: update bila sudah ada, kalau belum tambahkan. */
  add(record: MonitorRecord): void {
    if (!this.update(record)) {
      const next = new Map(this.state);
      next.set(record.id, record);
      this.state = next;
    }
  }

  /** requestUpdateMonitor: gabungkan field; nilai undefined/null tidak menimpa. true bila monitor ada. */
  update(partial: Partial<MonitorRecord> & { id: string }): boolean {
    const prev = this.state.get(partial.id);
    if (!prev) return false;
    const merged: MonitorRecord = { ...prev };
    let changed = false;
    for (const key of Object.keys(partial) as (keyof MonitorRecord)[]) {
      const value = partial[key];
      if (typeof value === "undefined" || value === null) continue;
      if (key === "params") {
        const params = value as Record<string, string>;
        if (!sameRecord({ ...prev, params }, prev)) {
          merged.params = { ...params };
          changed = true;
        }
        continue;
      }
      if (!sameValue(prev[key], value)) {
        (merged as unknown as Record<string, unknown>)[key] = value;
        changed = true;
      }
    }
    if (changed) {
      const next = new Map(this.state);
      next.set(partial.id, merged);
      this.state = next;
    }
    return true;
  }

  remove(id: string): void {
    if (!this.state.has(id)) return;
    const next = new Map(this.state);
    next.delete(id);
    this.state = next;
  }

  removeByTargetId(targetId: string): void {
    let next: Map<string, MonitorRecord> | null = null;
    for (const [id, record] of this.state) {
      if (record.targetId === targetId) {
        next ??= new Map(this.state);
        next.delete(id);
      }
    }
    if (next) this.state = next;
  }

  clear(): void {
    this.state = new Map();
  }

  /** true bila state berubah sejak panggilan sebelumnya (lalu tandai sudah dikirim). */
  takeChanged(): boolean {
    if (this.prevState === this.state) return false;
    let equal = this.prevState.size === this.state.size;
    if (equal) {
      const prevKeys = [...this.prevState.keys()];
      const keys = [...this.state.keys()];
      for (let i = 0; i < keys.length && equal; i++) {
        const key = keys[i] ?? "";
        const a = this.prevState.get(key);
        const b = this.state.get(key);
        equal = prevKeys[i] === key && a !== undefined && b !== undefined && sameRecord(a, b);
      }
    }
    this.prevState = this.state;
    return !equal;
  }
}
