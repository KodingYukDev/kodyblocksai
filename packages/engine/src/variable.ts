/** Variable (scratch-vm engine/variable.js). */
import type { VariableType } from "./types/project-model";
import type { Variable } from "./types/target";

export function createVariable(id: string, name: string, type: VariableType, isCloud = false): Variable {
  let value: Variable["value"];
  if (type === "list") value = [];
  else if (type === "broadcast_msg") value = name;
  else value = 0;
  return { id, name, type, value, isCloud: type === "" ? isCloud : false };
}
