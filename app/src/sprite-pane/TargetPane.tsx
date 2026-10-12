/** Panel target: info sprite + grid sprite + pemilih panggung (scratch-gui target-pane). */
import { useCallback } from "react";
import { useT } from "../shell/i18n";
import { CatIcon, PaintIcon, SearchIcon, SurpriseIcon, UploadIcon } from "../shell/icons";
import { downloadBytes, pickFiles, readPickedFile, saveFile } from "../shell/project-file";
import type { AddMethod, PickedFile, ShellController, ShellSnapshot, SpriteInfoPatch } from "../shell/types";
import { ActionMenu } from "./ActionMenu";
import { SpriteInfo } from "./SpriteInfo";
import { SpriteSelector } from "./SpriteSelector";
import { StageSelector } from "./StageSelector";

/** Tipe file yang diterima unggah sprite / latar (scratch-gui). */
/** `image/*` agar pemilih iPad menampilkan Foto (HEIC diubah Safari / didekode browser). */
export const SPRITE_UPLOAD_ACCEPT = "image/*,.svg,.png,.bmp,.jpg,.jpeg,.gif,.webp,.sprite3,.sprite2";
export const BACKDROP_UPLOAD_ACCEPT = "image/*,.svg,.png,.bmp,.jpg,.jpeg,.gif,.webp";
/** Batas ukuran satu file unggahan (input tak tepercaya). */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export interface TargetPaneProps {
  controller: ShellController;
  snapshot: ShellSnapshot;
  compact: boolean;
  onError(error: unknown): void;
  /** Dipanggil setelah menambah sprite/latar dengan "gambar" agar shell membuka tab kostum. */
  onOpenCostumes?(): void;
}

async function pickUploads(accept: string): Promise<PickedFile[]> {
  const files = await pickFiles(accept, true);
  const ok = files.filter((f) => f.size <= MAX_UPLOAD_BYTES);
  if (ok.length !== files.length) throw new Error("File terlalu besar");
  return Promise.all(ok.map(readPickedFile));
}

export function TargetPane({ controller, snapshot, compact, onError, onOpenCostumes }: TargetPaneProps) {
  const t = useT();
  const stage = snapshot.targets.find((x) => x.isStage) ?? null;
  const sprites = snapshot.targets.filter((x) => !x.isStage);
  const editing = snapshot.targets.find((x) => x.id === snapshot.editingTargetId) ?? null;

  const onPatch = useCallback((p: SpriteInfoPatch) => controller.postSpriteInfo(p), [controller]);
  const editingId = editing?.id ?? null;
  const onRename = useCallback(
    (name: string) => {
      if (editingId) controller.renameSprite(editingId, name);
    },
    [controller, editingId],
  );
  const guard = useCallback(
    (fn: () => unknown) => {
      try {
        const r = fn();
        if (r instanceof Promise) r.catch(onError);
      } catch (e) {
        onError(e);
      }
    },
    [onError],
  );
  const onSelect = useCallback((id: string) => guard(() => controller.selectTarget(id)), [controller, guard]);
  const onDelete = useCallback((id: string) => guard(() => controller.deleteSprite(id)), [controller, guard]);
  const onDuplicate = useCallback((id: string) => guard(() => controller.duplicateSprite(id)), [controller, guard]);
  const onExport = useCallback(
    (id: string) =>
      guard(async () => {
        const out = await controller.exportSprite?.(id);
        if (!out) return;
        // iPad: lembar Bagikan; bila Safari menolak tanpa ketukan baru, coba unduhan biasa.
        const r = await saveFile(out.fileName, out.data, "application/x.scratch.sprite3");
        if (r === "needs-gesture") downloadBytes(out.fileName, out.data, "application/octet-stream");
      }),
    [controller, guard],
  );

  const add = (kind: "sprite" | "backdrop", method: AddMethod): void => {
    guard(async () => {
      const files = method === "upload" ? await pickUploads(kind === "sprite" ? SPRITE_UPLOAD_ACCEPT : BACKDROP_UPLOAD_ACCEPT) : undefined;
      if (method === "upload" && (!files || files.length === 0)) return;
      if (kind === "sprite") await controller.addSprite(method, files);
      else await controller.addBackdrop(method, files);
      if (method === "paint") onOpenCostumes?.();
    });
  };

  return (
    <div className="kb-target-pane">
      <div className="kb-sprite-selector">
        <SpriteInfo sprite={editing} compact={compact} onPatch={onPatch} onRename={onRename} />
        <div className="kb-sprite-selector__scroll">
          <SpriteSelector
            sprites={sprites}
            selectedId={snapshot.editingTargetId}
            onSelect={onSelect}
            onDelete={onDelete}
            onDuplicate={onDuplicate}
            onExport={controller.exportSprite ? onExport : undefined}
          />
        </div>
        <ActionMenu
          className="kb-sprite-selector__actions"
          main={{ method: "library", title: t("sprite.choose"), icon: <CatIcon size={24} /> }}
          more={[
            { method: "upload", title: t("sprite.upload"), icon: <UploadIcon size={18} /> },
            { method: "surprise", title: t("sprite.surprise"), icon: <SurpriseIcon size={18} /> },
            { method: "paint", title: t("sprite.paint"), icon: <PaintIcon size={18} /> },
            { method: "library", title: t("sprite.choose"), icon: <SearchIcon size={18} /> },
          ]}
          onAction={(m) => add("sprite", m)}
        />
      </div>
      <div className="kb-stage-selector-col">
        <StageSelector
          stage={stage}
          selected={!!editing?.isStage}
          onSelect={onSelect}
          onAddBackdrop={(m) => add("backdrop", m)}
        />
      </div>
    </div>
  );
}
