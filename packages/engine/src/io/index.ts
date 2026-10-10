import type { IODevices, IVideoProvider } from "../types/io";
import type { IRuntime } from "../types/runtime";
import { createClock } from "./clock";
import { createKeyboard } from "./keyboard";
import { createMouse } from "./mouse";
import { createMouseWheel } from "./mouse-wheel";
import { createUserData } from "./user-data";

export { createClock, createKeyboard, createMouse, createMouseWheel, createUserData };

export function createIODevices(runtime: IRuntime, video: IVideoProvider | null = null): IODevices {
  return {
    keyboard: createKeyboard(runtime),
    mouse: createMouse(runtime),
    mouseWheel: createMouseWheel(runtime),
    clock: createClock(runtime),
    userData: createUserData(),
    video,
  };
}
