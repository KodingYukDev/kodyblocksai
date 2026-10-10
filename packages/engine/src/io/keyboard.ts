/**
 * Keyboard (padanan scratch-vm 4.8.102 io/keyboard.js, BSD-3-Clause; lihat THIRD_PARTY.md):
 * pemetaan event.key DOM -> nama tombol Scratch dan pemicu hat "when key pressed".
 * Pemilik: agent engine-core.
 */
import { Cast } from "../cast";
import { asRuntimeInternal } from "../runtime-internal";
import type { IKeyboard, KeyboardData } from "../types/io";
import type { IRuntime } from "../types/runtime";

export const KEY_NAME = {
  SPACE: "space",
  LEFT: "left arrow",
  UP: "up arrow",
  RIGHT: "right arrow",
  DOWN: "down arrow",
  ENTER: "enter",
} as const;

const KEY_NAME_LIST: readonly string[] = Object.values(KEY_NAME);

/** event.key DOM -> nama Scratch ("" = tombol tidak didukung). */
export function keyStringToScratchKey(keyString: unknown): string {
  const key = Cast.toString(keyString);
  switch (key) {
    case " ":
      return KEY_NAME.SPACE;
    case "ArrowLeft":
    case "Left":
      return KEY_NAME.LEFT;
    case "ArrowUp":
    case "Up":
      return KEY_NAME.UP;
    case "Right":
    case "ArrowRight":
      return KEY_NAME.RIGHT;
    case "Down":
    case "ArrowDown":
      return KEY_NAME.DOWN;
    case "Enter":
      return KEY_NAME.ENTER;
  }
  // Tombol khusus lain (Shift, Tab, F1, ...) tidak didukung Scratch.
  if (key.length > 1) return "";
  return key.toUpperCase();
}

/** Nilai argumen blok (nama, huruf, atau kode tombol) -> nama Scratch. */
export function keyArgToScratchKey(keyArg: unknown): string {
  if (typeof keyArg === "number") {
    // Kode 48-90: digit dan huruf.
    if (keyArg >= 48 && keyArg <= 90) return String.fromCharCode(keyArg);
    switch (keyArg) {
      case 32:
        return KEY_NAME.SPACE;
      case 37:
        return KEY_NAME.LEFT;
      case 38:
        return KEY_NAME.UP;
      case 39:
        return KEY_NAME.RIGHT;
      case 40:
        return KEY_NAME.DOWN;
    }
  }
  let arg = Cast.toString(keyArg);
  if (KEY_NAME_LIST.includes(arg)) return arg;
  // Hanya karakter pertama yang dipakai.
  if (arg.length > 1) arg = arg[0] ?? "";
  if (arg === " ") return KEY_NAME.SPACE;
  return arg.toUpperCase();
}

export class Keyboard implements IKeyboard {
  private keysPressed: string[] = [];

  constructor(private readonly runtime: IRuntime) {}

  postData(data: KeyboardData): void {
    if (!data.key) return;
    const scratchKey = keyStringToScratchKey(data.key);
    if (scratchKey === "") return;
    const index = this.keysPressed.indexOf(scratchKey);
    if (data.isDown) {
      // scratch-vm: emit KEY_PRESSED, lalu Scratch3EventBlocks memulai hat tombol itu + "any".
      // Hat dimulai langsung di sini (RuntimeEventMap tidak memuat KEY_PRESSED).
      asRuntimeInternal(this.runtime)?.emitExtra("KEY_PRESSED", scratchKey);
      this.runtime.startHats("event_whenkeypressed", { KEY_OPTION: scratchKey });
      this.runtime.startHats("event_whenkeypressed", { KEY_OPTION: "any" });
      if (index < 0) this.keysPressed.push(scratchKey);
    } else if (index > -1) {
      this.keysPressed.splice(index, 1);
    }
  }

  getKeyIsDown(keyArg: unknown): boolean {
    if (keyArg === "any") return this.keysPressed.length > 0;
    return this.keysPressed.indexOf(keyArgToScratchKey(keyArg)) > -1;
  }
}

export function createKeyboard(runtime: IRuntime): IKeyboard {
  return new Keyboard(runtime);
}
