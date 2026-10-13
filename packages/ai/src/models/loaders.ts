/**
 * Pemuat model AI nyata (dimuat LAZY lewat dynamic import, tidak masuk bundle utama).
 * Semua byte model + wasm diambil lewat createVerifiedFetcher (same-origin + SHA-256 di-pin),
 * lalu diberikan ke library dari MEMORI (modelAssetBuffer, tf.io.fromMemory, blob URL),
 * sehingga library tidak pernah mengambil URL sendiri.
 */
import type { DetectorFactories, FrameSource, ImageEmbedder, VisionDetector } from "../types";
import type { FaceResult, HandResult, ObjectResult, PoseResult } from "../types";
import { l2Normalize } from "../classifier/vector";
import { facesFromMediaPipe, handsFromMediaPipe, objectsFromCoco, posesFromMediaPipe } from "../vision/adapters";
import { loadGraphModelArtifacts } from "./tfjs-artifacts";
import { TensorGuard } from "./tensor-guard";

type TfModelArtifacts = import("@tensorflow/tfjs").io.ModelArtifacts;

export const MODEL_PATHS = {
  hand: "/models/mediapipe/hand_landmarker.task",
  face: "/models/mediapipe/face_landmarker.task",
  pose: "/models/mediapipe/pose_landmarker.task",
  wasmDir: "/models/mediapipe/wasm/",
  mobilenet: "/models/mobilenet/model.json",
  cocoSsd: "/models/coco-ssd/model.json",
} as const;

/** Modul wasm minimal yang memakai instruksi SIMD; valid = browser mendukung wasm SIMD. */
const SIMD_PROBE = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11,
]);

export function wasmSimdSupported(): boolean {
  try {
    return typeof WebAssembly !== "undefined" && WebAssembly.validate(SIMD_PROBE);
  } catch {
    return false;
  }
}

/** WebGL tersedia (syarat delegasi GPU MediaPipe & backend webgl tfjs). */
export function webglAvailable(): boolean {
  try {
    if (typeof document === "undefined") return false;
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

/** tfjs siap dengan backend webgl, atau cpu bila WebGL tidak ada/gagal (lambat tapi jalan). */
async function tfReady(): Promise<typeof import("@tensorflow/tfjs")> {
  const tf = await import("@tensorflow/tfjs");
  try {
    if (!webglAvailable()) await tf.setBackend("cpu");
    await tf.ready();
  } catch {
    await tf.setBackend("cpu");
    await tf.ready();
  }
  return tf;
}

export interface LoaderDeps {
  fetchVerified: (path: string) => Promise<ArrayBuffer>;
}

interface Fileset {
  wasmLoaderPath: string;
  wasmBinaryPath: string;
}

type FrameDims = { width: number; height: number };
const frameDims = (f: FrameSource): FrameDims => {
  const v = f as Partial<HTMLVideoElement> & FrameDims;
  return { width: v.videoWidth || v.width || 480, height: v.videoHeight || v.height || 360 };
};

/** Membuat pabrik detektor nyata. dispose() melepas blob URL wasm. */
export function createDefaultDetectorFactories(deps: LoaderDeps): DetectorFactories & { dispose(): void } {
  let filesetPromise: Promise<Fileset> | null = null;
  const blobUrls: string[] = [];

  const fileset = (): Promise<Fileset> => {
    filesetPromise ??= (async () => {
      const base = MODEL_PATHS.wasmDir + (wasmSimdSupported() ? "vision_wasm_internal" : "vision_wasm_nosimd_internal");
      // The loader script is served from our own origin and loaded by URL: the CSP allows
      // script-src 'self' but not blob:, so a blob loader would be blocked. It is still
      // hash-checked first; only the wasm binary goes through a blob URL (fetch, not script).
      const [, wasm] = await Promise.all([deps.fetchVerified(`${base}.js`), deps.fetchVerified(`${base}.wasm`)]);
      const binary = URL.createObjectURL(new Blob([wasm], { type: "application/wasm" }));
      blobUrls.push(binary);
      return { wasmLoaderPath: `${base}.js`, wasmBinaryPath: binary };
    })();
    filesetPromise.catch(() => (filesetPromise = null));
    return filesetPromise;
  };

  const taskBuffer = async (path: string): Promise<Uint8Array> => new Uint8Array(await deps.fetchVerified(path));

  /**
   * Task MediaPipe dengan delegasi GPU, jatuh ke CPU bila GPU gagal dibuat ATAU gagal saat deteksi
   * pertama (sebagian iPad/Android membuat task GPU tetapi gagal saat detectForVideo).
   */
  async function resilientTask<T extends { close(): void }>(
    make: (delegate: "GPU" | "CPU") => Promise<T>,
  ): Promise<{ current: () => T; fallback: () => Promise<T | null>; close: () => void }> {
    let delegate: "GPU" | "CPU" = webglAvailable() ? "GPU" : "CPU";
    let task: T;
    try {
      task = await make(delegate);
    } catch (err) {
      if (delegate === "CPU") throw err;
      delegate = "CPU";
      task = await make("CPU");
    }
    return {
      current: () => task,
      fallback: async () => {
        if (delegate === "CPU") return null;
        delegate = "CPU";
        try {
          task.close();
        } catch {
          // abaikan
        }
        task = await make("CPU");
        return task;
      },
      close: () => task.close(),
    };
  }

  /** detectForVideo dengan satu kali coba ulang di CPU bila delegasi GPU melempar error. */
  async function mediapipeDetector<T extends { close(): void }, Raw, R>(
    make: (delegate: "GPU" | "CPU") => Promise<T>,
    detectRaw: (task: T, frame: FrameSource, ts: number) => Raw,
    convert: (raw: Raw, mirrored: boolean) => R,
  ): Promise<VisionDetector<R>> {
    const h = await resilientTask(make);
    return {
      detect: async (frame, ts, opts) => {
        try {
          return convert(detectRaw(h.current(), frame, ts), opts.mirrored);
        } catch (err) {
          const cpu = await h.fallback();
          if (!cpu) throw err;
          return convert(detectRaw(cpu, frame, ts + 1), opts.mirrored);
        }
      },
      dispose: () => h.close(),
    };
  }

  const hand = async (): Promise<VisionDetector<HandResult[]>> => {
    const vision = await import("@mediapipe/tasks-vision");
    const [fs, model] = await Promise.all([fileset(), taskBuffer(MODEL_PATHS.hand)]);
    return mediapipeDetector(
      (delegate) =>
        vision.HandLandmarker.createFromOptions(fs, {
          baseOptions: { modelAssetBuffer: model, delegate },
          runningMode: "VIDEO",
          numHands: 2,
        }),
      (task, frame, ts) => task.detectForVideo(frame as TexImageSource, ts),
      (raw, mirrored) => handsFromMediaPipe(raw, mirrored),
    );
  };

  const face = async (): Promise<VisionDetector<FaceResult[]>> => {
    const vision = await import("@mediapipe/tasks-vision");
    const [fs, model] = await Promise.all([fileset(), taskBuffer(MODEL_PATHS.face)]);
    return mediapipeDetector(
      (delegate) =>
        vision.FaceLandmarker.createFromOptions(fs, {
          baseOptions: { modelAssetBuffer: model, delegate },
          runningMode: "VIDEO",
          numFaces: 4,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: false,
        }),
      (task, frame, ts) => task.detectForVideo(frame as TexImageSource, ts),
      (raw) => facesFromMediaPipe(raw),
    );
  };

  const pose = async (): Promise<VisionDetector<PoseResult[]>> => {
    const vision = await import("@mediapipe/tasks-vision");
    const [fs, model] = await Promise.all([fileset(), taskBuffer(MODEL_PATHS.pose)]);
    return mediapipeDetector(
      (delegate) =>
        vision.PoseLandmarker.createFromOptions(fs, {
          baseOptions: { modelAssetBuffer: model, delegate },
          runningMode: "VIDEO",
          numPoses: 1,
          outputSegmentationMasks: false,
        }),
      (task, frame, ts) => task.detectForVideo(frame as TexImageSource, ts),
      (raw) => posesFromMediaPipe(raw),
    );
  };

  const object = async (): Promise<VisionDetector<ObjectResult[]>> => {
    const tf = await tfReady();
    const coco = await import("@tensorflow-models/coco-ssd");
    const artifacts = await loadGraphModelArtifacts(MODEL_PATHS.cocoSsd, deps.fetchVerified);
    const graph = await tf.loadGraphModel(tf.io.fromMemory(artifacts as unknown as TfModelArtifacts));
    // ObjectDetection memuat URL sendiri di load(); kita isi model terverifikasi langsung.
    const od = new coco.ObjectDetection("lite_mobilenet_v2", MODEL_PATHS.cocoSsd);
    (od as unknown as { model: unknown }).model = graph;
    const guard = new TensorGuard(tf);
    return {
      detect: async (frame) => {
        const dims = frameDims(frame);
        const dets = await guard.run(() => od.detect(frame as HTMLCanvasElement, 20, 0.5));
        return objectsFromCoco(dets, dims.width, dims.height);
      },
      dispose: () => od.dispose(),
    };
  };

  const imageEmbedder = async (): Promise<ImageEmbedder> => {
    const tf = await tfReady();
    const mobilenet = await import("@tensorflow-models/mobilenet");
    const artifacts = await loadGraphModelArtifacts(MODEL_PATHS.mobilenet, deps.fetchVerified);
    const net = await mobilenet.load({
      version: 2,
      alpha: 1.0,
      modelUrl: tf.io.fromMemory(artifacts as unknown as TfModelArtifacts),
      inputRange: [0, 1],
    });
    const guard = new TensorGuard(tf);
    return {
      embed: (frame) =>
        guard.run(async () => {
          const t = net.infer(frame as HTMLCanvasElement, true);
          try {
            return l2Normalize(await t.data());
          } finally {
            t.dispose();
          }
        }),
      dispose: () => (net as unknown as { model?: { dispose(): void } }).model?.dispose(),
    };
  };

  return {
    hand,
    face,
    pose,
    object,
    imageEmbedder,
    dispose: () => {
      for (const u of blobUrls.splice(0)) URL.revokeObjectURL(u);
      filesetPromise = null;
    },
  };
}
