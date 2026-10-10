/**
 * Antarmuka editor blok (packages/blocks-ui) <-> engine.
 * Editor TIDAK menyimpan sumber kebenaran blok: setiap perubahan dikirim sebagai EditorWorkspaceEvent
 * ke target.blocks.applyEditorEvent() (padanan vm.blockListener / blocks.blocklyListen),
 * lalu editor merender ulang dari IBlocksContainer target yang sedang diedit.
 */
import type { Block, ScratchValue, VariableType } from "./project-model";

export type EditorWorkspaceEvent =
  /** Blok baru (root lebih dulu, termasuk shadow & anak). */
  | { type: "create"; blocks: Block[] }
  | { type: "delete"; blockId: string }
  | {
      type: "move";
      blockId: string;
      oldParent?: string | null;
      oldInput?: string | null;
      newParent?: string | null;
      newInput?: string | null;
      newCoordinate?: { x: number; y: number } | null;
    }
  | { type: "change"; blockId: string; element: "field" | "mutation" | "checkbox"; name?: string; value: unknown }
  | { type: "var_create"; varId: string; varName: string; varType: VariableType; isLocal: boolean; isCloud: boolean }
  | { type: "var_rename"; varId: string; newName: string }
  | { type: "var_delete"; varId: string }
  | { type: "comment_create"; commentId: string; blockId: string | null; text: string; x: number; y: number; width: number; height: number; minimized: boolean }
  | { type: "comment_change"; commentId: string; text?: string; width?: number; height?: number; minimized?: boolean }
  | { type: "comment_move"; commentId: string; x: number; y: number }
  | { type: "comment_delete"; commentId: string }
  /** Blok dijatuhkan ke sprite lain di sprite pane (copy ke target lain). */
  | { type: "drag_outside"; blockId: string; isOutside: boolean }
  /** Klik pada stack/reporter di editor. */
  | { type: "stackclick"; blockId: string };

/** Engine -> editor. Diterima blocks-ui lewat runtime.on(...). Lihat RuntimeEventMap. */
export interface EditorFeedback {
  glowStack(topBlockId: string, glowing: boolean): void;
  glowBlock(blockId: string, glowing: boolean): void;
  /** Gelembung nilai reporter setelah diklik. */
  visualReport(blockId: string, value: ScratchValue): void;
  /** Toolbox perlu dibangun ulang (ekstensi baru, variabel baru, target berganti). */
  refreshToolbox(): void;
}

/** Status checkbox monitor di flyout (variabel, x position, dll). */
export interface FlyoutCheckboxState {
  blockId: string;
  checked: boolean;
}
