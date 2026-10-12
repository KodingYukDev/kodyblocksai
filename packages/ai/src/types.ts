/**
 * Tipe ekstensi AI. Semua inferensi berjalan DI BROWSER; tidak ada frame kamera/audio yang dikirim
 * ke server. Lihat docs/CONTRACTS.md bagian "Keamanan AI".
 */
export type AiExtensionId = "aiFace" | "aiHand" | "aiPose" | "aiImage" | "aiObject" | "aiText" | "aiAudio";

export interface Point2 {
  /** Koordinat panggung Scratch (-240..240, -180..180), sudah memperhitungkan mirror video. */
  x: number;
  y: number;
}

/** Kotak dalam koordinat panggung: x,y = PUSAT kotak, width/height dalam piksel panggung. */
export interface BoxResult {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FaceResult extends BoxResult {
  landmarks: Point2[];
  /** Nama ekspresi -> skor 0..1 (dari blendshape). */
  expressions: Record<string, number>;
}

export interface HandResult {
  handedness: "Left" | "Right";
  landmarks: Point2[];
  gesture: string | null;
  gestureScore: number;
}

export interface PoseResult {
  keypoints: (Point2 & { visibility: number })[];
}

export interface ClassificationResult {
  label: string;
  confidence: number;
  /** label -> confidence. */
  scores: Record<string, number>;
}

export interface ObjectResult extends BoxResult {
  label: string;
  confidence: number;
}

export type AiSource = "camera" | "stage";

/** Model terlatih dari AI Lab yang disimpan di project (TargetState.extensionState). */
export type TrainedKind = "image" | "text" | "audio" | "pose" | "hand";

export interface TrainedClassifier {
  kind: TrainedKind;
  version: 1;
  labels: string[];
  /** Data model (bobot KNN / dense head) ter-serialisasi; ukuran dibatasi AI_LIMITS. */
  payload: string;
  createdAt: number;
}

/** Penyedia model; implementasi dimuat lazy (tfjs / mediapipe besar). */
export interface ModelProvider<R> {
  readonly ready: boolean;
  load(): Promise<void>;
  detect(frame: ImageData | HTMLCanvasElement | ImageBitmap | HTMLVideoElement): Promise<R>;
  dispose(): void;
}

/** Frame yang dianalisis: selalu salinan lokal di memori; tidak pernah dikirim ke jaringan. */
export type FrameSource = HTMLCanvasElement | ImageData | ImageBitmap | HTMLVideoElement | OffscreenCanvas;

/** Detektor visi yang sudah dimuat (MediaPipe / COCO-SSD) dibungkus bentuk seragam. */
export interface VisionDetector<R> {
  detect(frame: FrameSource, timestampMs: number, opts: { mirrored: boolean }): Promise<R>;
  dispose(): void;
}

/** Ekstraktor fitur gambar (MobileNet embedding) untuk classifier AI Lab. */
export interface ImageEmbedder {
  /** Vektor fitur (sudah dinormalisasi L2). Tensor sementara sudah di-dispose. */
  embed(frame: FrameSource): Promise<Float32Array>;
  dispose(): void;
}

export interface DetectorFactories {
  hand(): Promise<VisionDetector<HandResult[]>>;
  face(): Promise<VisionDetector<FaceResult[]>>;
  pose(): Promise<VisionDetector<PoseResult[]>>;
  object(): Promise<VisionDetector<ObjectResult[]>>;
  imageEmbedder(): Promise<ImageEmbedder>;
}

export type DetectorKind = keyof DetectorFactories;

export type AiDevice = "camera" | "microphone";

/** Kamera depan (selfie, dicerminkan) atau belakang (tidak dicerminkan). */
export type CameraFacing = "user" | "environment";

export type AiNoticeLevel = "info" | "warning" | "error";

/** Pemberitahuan untuk UI (toast/alert). Pesan berbahasa Indonesia, aman ditampilkan sebagai teks. */
export interface AiNotice {
  level: AiNoticeLevel;
  code: string;
  message: string;
}

/** Fitur yang (bisa) membutuhkan jaringan; app wajib meminta persetujuan eksplisit. */
export type NetworkFeature = "speech-recognition" | "speech-synthesis";
