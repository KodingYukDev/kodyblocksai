/**
 * Event bus app (UI shell). Event runtime (thread, monitor, say) TIDAK lewat sini:
 * komponen mendengarkan runtime.on(...) langsung. Bus ini untuk koordinasi antar-panel UI.
 */
import { TypedEmitter } from "@kody/engine";

export type EditorTab = "code" | "costumes" | "sounds";
export type StageSizeMode = "small" | "normal" | "fullscreen";
export type AppLocale = "id" | "en";

export type AppEventMap = {
  "project:new": void;
  "project:loaded": { title: string; source: "default" | "file" | "autosave" | "url" };
  "project:changed": void;
  "project:save-requested": { kind: "download" | "autosave" };
  "project:saved": { kind: "download" | "autosave"; at: number };
  "project:title-changed": { title: string };
  "editor:target-selected": { targetId: string };
  "editor:tab-changed": { tab: EditorTab };
  "stage:size-mode": { mode: StageSizeMode };
  "run:green-flag": void;
  "run:stop": void;
  "run:turbo": { enabled: boolean };
  "extension:library-open": void;
  "extension:add-requested": { id: string };
  "extension:added": { id: string };
  "ai:permission-requested": { device: "camera" | "microphone"; extensionId: string };
  "ai:permission-result": { device: "camera" | "microphone"; granted: boolean };
  "ai:device-active": { device: "camera" | "microphone"; active: boolean };
  "ui:alert": { level: "info" | "success" | "warning" | "error"; message: string };
  "locale:changed": { locale: AppLocale };
};

export type AppBus = TypedEmitter<AppEventMap>;

export function createAppBus(): AppBus {
  return new TypedEmitter<AppEventMap>();
}
