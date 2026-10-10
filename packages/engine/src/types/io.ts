/**
 * Perangkat IO runtime. Bentuk data mengikuti scratch-vm/src/io/*.
 */

export interface KeyboardData {
  /** event.key dari DOM (mis. "ArrowLeft", "a", " "). */
  key: string;
  isDown: boolean;
}

export interface IKeyboard {
  postData(data: KeyboardData): void;
  /** keyArg: nilai blok ("space", "left arrow", "any", "a", kode angka) -> sedang ditekan? */
  getKeyIsDown(keyArg: unknown): boolean;
}

export interface MouseData {
  /** Koordinat klien relatif terhadap kanvas panggung (px CSS). */
  x?: number;
  y?: number;
  canvasWidth?: number;
  canvasHeight?: number;
  isDown?: boolean;
  wasDragged?: boolean;
}

export interface IMouse {
  postData(data: MouseData): void;
  /** Koordinat Scratch, di-clamp dan dibulatkan persis seperti scratch-vm Mouse. */
  getScratchX(): number;
  getScratchY(): number;
  getClientX(): number;
  getClientY(): number;
  getIsDown(): boolean;
}

export interface IMouseWheel {
  postData(data: { deltaY: number }): void;
}

export interface IClock {
  /** Detik sejak reset (blok timer). */
  projectTimer(): number;
  resetProjectTimer(): void;
  pause(): void;
  resume(): void;
}

export interface IUserData {
  getUsername(): string;
  postData(data: { username: string }): void;
}

export interface VideoFrameRequest {
  format: "image-data" | "canvas" | "bitmap";
  dimensions?: [number, number];
}

/** Sumber kamera bersama untuk AI dan lapisan video panggung. Implementasi milik packages/ai. */
export interface IVideoProvider {
  readonly enabled: boolean;
  enableVideo(): Promise<boolean>;
  disableVideo(): void;
  setMirrored(mirrored: boolean): void;
  getFrame(req: VideoFrameRequest): ImageData | HTMLCanvasElement | ImageBitmap | null;
}

export interface IODevices {
  keyboard: IKeyboard;
  mouse: IMouse;
  mouseWheel: IMouseWheel;
  clock: IClock;
  userData: IUserData;
  video: IVideoProvider | null;
}

export type IODeviceName = keyof IODevices;
