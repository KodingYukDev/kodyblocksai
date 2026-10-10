/**
 * Logika variabel/list/pesan untuk editor (Blockly.Variables scratch-blocks):
 * validasi nama (trim, kosong = batal, prefiks awan "☁ ", bentrok peka huruf besar),
 * daftar opsi dropdown field_variable, dan event hapus variabel beserta pemakaiannya.
 */
import type { EditorWorkspaceEvent, IRuntime, ITarget, VariableType } from "@kody/engine";
import { msg, type Locale } from "./i18n";

export const CLOUD_PREFIX = "☁ ";
export const RENAME_VARIABLE_ID = "RENAME_VARIABLE_ID";
export const DELETE_VARIABLE_ID = "DELETE_VARIABLE_ID";
export const NEW_BROADCAST_MESSAGE_ID = "NEW_BROADCAST_MESSAGE_ID";

export interface VarModel {
  id: string;
  name: string;
  type: VariableType;
  isLocal: boolean;
  isCloud: boolean;
}

const collator = new Intl.Collator([], { sensitivity: "base", numeric: true });
export const compareStrings = (a: string, b: string): number => collator.compare(a, b);

/** Variabel yang terlihat di workspace target (lokal target + global stage), padanan workspace.getVariablesOfType. */
export function workspaceVariables(runtime: IRuntime, target: ITarget | null, type: VariableType): VarModel[] {
  const stage = runtime.getTargetForStage();
  const out: VarModel[] = [];
  const seen = new Set<string>();
  const add = (t: ITarget | undefined | null, isLocal: boolean): void => {
    if (!t) return;
    for (const v of Object.values(t.variables)) {
      if (v.type !== type || seen.has(v.id)) continue;
      seen.add(v.id);
      out.push({ id: v.id, name: v.name, type: v.type, isLocal, isCloud: v.isCloud });
    }
  };
  if (target && !target.isStage) add(target, true);
  add(stage, false);
  return out.sort((a, b) => compareStrings(a.name, b.name));
}

export type ValidateResult = { ok: true; name: string } | { ok: false; error: string | null };

/**
 * validateScalarVarOrListName_: trim; kosong -> batal tanpa pesan; awan -> prefiks;
 * bentrok jika nama persis sama (peka huruf) sudah ada di workspace atau di additionalVars.
 */
export function validateVariableName(
  raw: string,
  type: VariableType,
  existing: readonly VarModel[],
  additionalVarNames: readonly string[],
  isCloud: boolean,
  locale: Locale,
): ValidateResult {
  let name = raw.trim();
  if (!name) return { ok: false, error: null };
  if (isCloud) name = CLOUD_PREFIX + name;
  if (existing.some((v) => v.type === type && v.name === name) || additionalVarNames.includes(name)) {
    return { ok: false, error: msg(locale, type === "list" ? "LIST_ALREADY_EXISTS" : "VARIABLE_ALREADY_EXISTS", name) };
  }
  return { ok: true, name };
}

/** Opsi dropdown field_variable (FieldVariable.dropdownCreate). */
export function variableDropdownOptions(vars: readonly VarModel[], type: VariableType, currentName: string, locale: Locale): [string, string][] {
  const options: [string, string][] = vars.filter((v) => v.type === type).map((v) => [v.name, v.id]);
  if (type === "broadcast_msg") {
    options.unshift([msg(locale, "NEW_BROADCAST_MESSAGE"), NEW_BROADCAST_MESSAGE_ID]);
  } else {
    options.push([msg(locale, type === "list" ? "RENAME_LIST" : "RENAME_VARIABLE"), RENAME_VARIABLE_ID]);
    options.push([msg(locale, type === "list" ? "DELETE_LIST" : "DELETE_VARIABLE", currentName), DELETE_VARIABLE_ID]);
  }
  return options;
}

/** Nama pesan siaran: trim; kalau sudah ada -> pakai yang ada (validateBroadcastMessageName_). */
export function resolveBroadcastName(raw: string, existing: readonly VarModel[]): { name: string; existingId: string | null } | null {
  const name = raw.trim();
  if (!name) return null;
  const hit = existing.find((v) => v.type === "broadcast_msg" && v.name === name);
  return { name, existingId: hit?.id ?? null };
}

export function varCreateEvent(id: string, name: string, type: VariableType, isLocal: boolean, isCloud: boolean): EditorWorkspaceEvent {
  return { type: "var_create", varId: id, varName: name, varType: type, isLocal, isCloud };
}
