/**
 * Penerapan event editor ke container blok (padanan Blocks.blocklyListen scratch-vm 4.8.102,
 * BSD-3-Clause; lihat THIRD_PARTY.md). Pemilik: agent engine-core.
 */
import type { BlocksContainer } from "./blocks-container";
import { asRenderedTarget, asRuntimeInternal } from "./runtime-internal";
import type { EditorWorkspaceEvent } from "./types/editor";
import type { Block } from "./types/project-model";

function has(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/** Salinan blok supaya editor tidak berbagi objek dengan engine. */
function copyBlock(block: Block): Block {
  return JSON.parse(JSON.stringify(block)) as Block;
}

export function applyEditorEventTo(container: BlocksContainer, e: EditorWorkspaceEvent): void {
  const runtime = container.runtime;
  if (!runtime) {
    // Container tanpa runtime: hanya operasi blok murni.
    if (e.type === "create") e.blocks.forEach((b) => container.createBlock(copyBlock(b)));
    else if (e.type === "delete") container.deleteBlock(e.blockId);
    else if (e.type === "move") container.moveBlock({ id: e.blockId, ...e });
    else if (e.type === "change") container.changeBlock({ id: e.blockId, element: e.element, name: e.name, value: e.value });
    return;
  }
  const rt = asRuntimeInternal(runtime);
  const stage = runtime.getTargetForStage();
  const editingTarget = runtime.getEditingTarget();

  switch (e.type) {
    case "stackclick":
      runtime.toggleScript(e.blockId, { stackClick: true });
      return;
    case "create":
      for (const block of e.blocks) container.createBlock(copyBlock(block));
      return;
    case "change":
      container.changeBlock({ id: e.blockId, element: e.element, name: e.name, value: e.value });
      return;
    case "move":
      container.moveBlock({
        id: e.blockId,
        oldParent: e.oldParent,
        oldInput: e.oldInput,
        newParent: e.newParent,
        newInput: e.newInput,
        newCoordinate: e.newCoordinate,
      });
      return;
    case "drag_outside":
      rt?.emitBlockDragUpdate(e.isOutside);
      return;
    case "delete": {
      // Abaikan blok yang tidak ada atau shadow yang tertutup reporter.
      const block = container.getBlock(e.blockId);
      if (!block || block.shadow) return;
      if (block.topLevel) rt?.quietGlow(e.blockId);
      container.deleteBlock(e.blockId);
      return;
    }
    case "var_create": {
      if (e.isLocal && editingTarget && !editingTarget.isStage && !e.isCloud) {
        if (!editingTarget.lookupVariableById(e.varId)) {
          editingTarget.createVariable(e.varId, e.varName, e.varType);
          container.emitProjectChanged();
        }
      } else {
        if (!stage || stage.lookupVariableById(e.varId)) return;
        // Tolak bila nama bentrok dengan variabel lokal sprite mana pun.
        for (const target of runtime.targets.filter((t) => t.isOriginal)) {
          if (target.lookupVariableByNameAndType(e.varName, e.varType, true)) return;
        }
        // Variabel cloud diabaikan: dibuat sebagai variabel biasa.
        stage.createVariable(e.varId, e.varName, e.varType, false);
        container.emitProjectChanged();
      }
      return;
    }
    case "var_rename": {
      if (editingTarget && has(editingTarget.variables, e.varId)) {
        editingTarget.renameVariable(e.varId, e.newName);
        editingTarget.blocks.updateBlocksAfterVarRename(e.varId, e.newName);
      } else if (stage) {
        stage.renameVariable(e.varId, e.newName);
        for (const t of runtime.targets) t.blocks.updateBlocksAfterVarRename(e.varId, e.newName);
      }
      container.emitProjectChanged();
      return;
    }
    case "var_delete": {
      const target = editingTarget && has(editingTarget.variables, e.varId) ? editingTarget : stage;
      target?.deleteVariable(e.varId);
      container.emitProjectChanged();
      return;
    }
    case "comment_create": {
      const target = asRenderedTarget(editingTarget);
      if (target) {
        target.createComment(e.commentId, e.blockId, e.text, e.x, e.y, e.width, e.height, e.minimized);
      }
      container.emitProjectChanged();
      return;
    }
    case "comment_change": {
      if (!editingTarget) return;
      const comment = editingTarget.comments[e.commentId];
      if (!comment) return;
      if (e.minimized !== undefined) comment.minimized = e.minimized;
      if (e.width !== undefined && e.height !== undefined) {
        comment.width = e.width;
        comment.height = e.height;
      }
      if (e.text !== undefined) comment.text = e.text;
      container.emitProjectChanged();
      return;
    }
    case "comment_move": {
      if (!editingTarget) return;
      const comment = editingTarget.comments[e.commentId];
      if (!comment) return;
      comment.x = e.x;
      comment.y = e.y;
      container.emitProjectChanged();
      return;
    }
    case "comment_delete": {
      if (!editingTarget) return;
      const comment = editingTarget.comments[e.commentId];
      if (!comment) return;
      delete editingTarget.comments[e.commentId];
      if (comment.blockId) {
        const block = editingTarget.blocks.getBlock(comment.blockId);
        if (!block) return;
        delete block.comment;
      }
      container.emitProjectChanged();
      return;
    }
  }
}
