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
      const [js, wasm] = await Promise.all([deps.fetchVerified(`${base}.js`), deps.fetchVerified(`${base}.wasm`)]);
      const loader = URL.createObjectURL(new Blob([js], { type: "text/javascript" }));
      const binary = URL.createObjectURL(new Blob([wasm], { type: "application/wasm" }));
      blobUrls.push(loader, binary);
      return { wasmLoaderPath: loader, wasmBinaryPath: binary };
    })();
    filesetPromise.catch(() => (filesetPromise = null));
    return filesetPromise;
  };

  const taskBuffer = async (path: string): Promise<Uint8Array> => new Uint8Array(await deps.fetchVerified(path));

  /** Coba delegasi GPU lalu CPU (GPU gagal di sebagian perangkat). */
  async function createTask<T>(make: (delegate: "GPU" | "CPU") => Promise<T>): Promise<T> {
    try {
      return await make("GPU");
    } catch {
      return make("CPU");
    }
  }

  const hand = async (): Promise<VisionDetector<HandResult[]>> => {
    const vision = await import("@mediapipe/tasks-vision");
    const [fs, model] = await Promise.all([fileset(), taskBuffer(MODEL_PATHS.hand)]);
    const task = await createTask((delegate) =>
      vision.HandLandmarker.createFromOptions(fs, {
        baseOptions: { modelAssetBuffer: model, delegate },
        runningMode: "VIDEO",
        numHands: 2,
      }),
    );
    return {
      detect: async (frame, ts, opts) => handsFromMediaPipe(task.detectForVideo(frame as TexImageSource, ts), opts.mirrored),
      dispose: () => task.close(),
    };
  };

  const face = async (): Promise<VisionDetector<FaceResult[]>> => {
    const vision = await import("@mediapipe/tasks-vision");
    const [fs, model] = await Promise.all([fileset(), taskBuffer(MODEL_PATHS.face)]);
    const task = await createTask((delegate) =>
      vision.FaceLandmarker.createFromOptions(fs, {
        baseOptions: { modelAssetBuffer: model, delegate },
        runningMode: "VIDEO",
        numFaces: 4,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: false,
      }),
    );
    return {
      detect: async (frame, ts) => facesFromMediaPipe(task.detectForVideo(frame as TexImageSource, ts)),
      dispose: () => task.close(),
    };
  };

  const pose = async (): Promise<VisionDetector<PoseResult[]>> => {
    const vision = await import("@mediapipe/tasks-vision");
    const [fs, model] = await Promise.all([fileset(), taskBuffer(MODEL_PATHS.pose)]);
    const task = await createTask((delegate) =>
      vision.PoseLandmarker.createFromOptions(fs, {
        baseOptions: { modelAssetBuffer: model, delegate },
        runningMode: "VIDEO",
        numPoses: 1,
        outputSegmentationMasks: false,
      }),
    );
    return {
      detect: async (frame, ts) => posesFromMediaPipe(task.detectForVideo(frame as TexImageSource, ts)),
      dispose: () => task.close(),
    };
  };

  const object = async (): Promise<VisionDetector<ObjectResult[]>> => {
    const tf = await import("@tensorflow/tfjs");
    await tf.ready();
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
    const tf = await import("@tensorflow/tfjs");
    await tf.ready();
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
