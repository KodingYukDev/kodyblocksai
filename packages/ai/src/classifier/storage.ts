/**
 * Penyimpanan model terlatih di project: custom state target panggung dengan kunci "Kody.<extId>"
 * (ikut tersimpan di TargetState.extensionState oleh paket project). Data dibaca sebagai input
 * TAK TEPERCAYA dan selalu divalidasi sebelum dipakai; hasil parse di-cache per objek.
 */
import type { IRuntime } from "@kody/engine";
import type { TrainedClassifier } from "../types";
import { KnnClassifier } from "./knn";
import { TextClassifier } from "./text-nb";

export type TrainedKind = TrainedClassifier["kind"];

export const TRAINED_STATE_KEYS: Record<TrainedKind, string> = {
  image: "Kody.aiImage",
  text: "Kody.aiText",
  audio: "Kody.aiAudio",
};

export function readTrained(runtime: IRuntime, kind: TrainedKind): unknown {
  return runtime.getTargetForStage()?.getCustomState<unknown>(TRAINED_STATE_KEYS[kind]);
}

export function writeTrained(runtime: IRuntime, model: TrainedClassifier | undefined): boolean {
  const stage = runtime.getTargetForStage();
  if (!stage || !model) return false;
  stage.setCustomState(TRAINED_STATE_KEYS[model.kind], model);
  runtime.emitProjectChanged();
  return true;
}

export function clearTrained(runtime: IRuntime, kind: TrainedKind): void {
  const stage = runtime.getTargetForStage();
  if (!stage) return;
  stage.setCustomState(TRAINED_STATE_KEYS[kind], undefined);
  runtime.emitProjectChanged();
}

type Parsed<K extends TrainedKind> = K extends "text" ? TextClassifier : KnnClassifier;

/** Memuat classifier dari state panggung dengan cache; error dilaporkan lewat onError (sekali per objek). */
export class TrainedModelCache<K extends TrainedKind> {
  private source: unknown = undefined;
  private parsed: Parsed<K> | null = null;

  constructor(
    private readonly runtime: IRuntime,
    private readonly kind: K,
    private readonly onError: (message: string) => void = () => {},
  ) {}

  get(): Parsed<K> | null {
    const raw = readTrained(this.runtime, this.kind);
    if (raw === this.source) return this.parsed;
    this.source = raw;
    this.parsed = null;
    if (raw === undefined || raw === null) return null;
    try {
      this.parsed = (
        this.kind === "text" ? TextClassifier.fromTrained(raw) : KnnClassifier.fromTrained(raw, this.kind as "image" | "audio")
      ) as Parsed<K>;
    } catch (err) {
      this.onError((err as Error).message);
    }
    return this.parsed;
  }

  labels(): string[] {
    return this.get()?.labels ?? [];
  }
}
