/** Seluruh korpus parity. Tambah kasus baru di file kategori lalu daftar di sini. */
import type { ParityCase } from "../case-types";
import { combinedCases } from "./combined";
import { controlCases } from "./control";
import { dataCases } from "./data";
import { looksCases } from "./looks";
import { motionCases } from "./motion";
import { operatorCases } from "./operators";
import { procedureCases } from "./procedures";
import { sensingCases } from "./sensing";
import { eventCases, soundCases } from "./sound-events";

let cache: ParityCase[] | null = null;

export function allParityCases(): ParityCase[] {
  if (cache) return cache;
  const cases = [
    ...motionCases(),
    ...looksCases(),
    ...soundCases(),
    ...eventCases(),
    ...controlCases(),
    ...sensingCases(),
    ...operatorCases(),
    ...dataCases(),
    ...procedureCases(),
    ...combinedCases(),
  ];
  const seen = new Set<string>();
  for (const c of cases) {
    if (seen.has(c.id)) throw new Error(`id kasus parity duplikat: ${c.id}`);
    seen.add(c.id);
  }
  cache = cases;
  return cases;
}
