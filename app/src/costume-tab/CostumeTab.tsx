/**
 * Tab Kostum (atau Latar untuk panggung): daftar costume di kiri, paint editor di kanan.
 * Perilaku tambah/duplikat/hapus/urut/ganti nama mengikuti scratch-gui containers/costume-tab.jsx.
 */
import { useCallback, useState, useSyncExternalStore } from "react";
import { loadCostumeEntry, pickRandom } from "../library/library-actions";
import type { LibraryLoader } from "../library/library-loader";
import { LibraryModal } from "../library/LibraryModal";
import type { LibraryBackdropEntry, LibraryCostumeEntry, LibraryEntry } from "../library/library-types";
import { AddMenu, type AddMenuItem } from "./AddMenu";
import { AssetList } from "./AssetList";
import { defaultCostumeName, formatCostumeDetails } from "./asset-list-logic";
import { CameraModal } from "./CameraModal";
import { costumesFromFile } from "./costume-media";
import { COSTUME_ACCEPT } from "./costume-upload";
import { IconBrush, IconCamera, IconSearch, IconSurprise, IconUpload } from "./icons";
import { emptyCostume, mimeForFormat } from "./new-asset";
import { PaintEditor } from "./paint/PaintEditor";
import { tabStrings, type TabLocale } from "./strings";
import type { AssetEditorHost, DeviceActiveFn, NewCostume, NotifyFn } from "./types";
import { downloadBytes, readInputFiles, useAssetUrls } from "./use-asset-url";
import "./asset-tab.css";

export interface CostumeTabProps {
  host: AssetEditorHost;
  loader: LibraryLoader;
  locale?: TabLocale;
  notify?: NotifyFn;
  onDeviceActive?: DeviceActiveFn;
}

export function CostumeTab({ host, loader, locale = "id", notify, onDeviceActive }: CostumeTabProps) {
  const t = tabStrings(locale);
  const target = useSyncExternalStore(host.subscribe, host.getEditingTarget, host.getEditingTarget);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const costumes = target?.costumes ?? [];
  const thumbs = useAssetUrls(costumes);

  const report = useCallback((e: unknown) => notify?.("error", e instanceof Error ? e.message : String(e)), [notify]);
  const onSave = useCallback((index: number, c: NewCostume) => host.updateCostume(index, c), [host]);
  const onRename = useCallback((index: number, name: string) => host.renameCostume(index, name), [host]);

  if (!target) return <div className="kb-assettab kb-assettab--empty" />;
  const isStage = target.isStage;
  const selected = Math.min(Math.max(0, target.currentCostume), Math.max(0, costumes.length - 1));
  const current = costumes[selected];

  const addFromFiles = async (files: FileList): Promise<void> => {
    try {
      for (const f of await readInputFiles(files)) await host.addCostumes(await costumesFromFile(f));
    } catch (e) {
      report(e);
    }
  };

  const addFromLibrary = async (entry: LibraryEntry): Promise<void> => {
    setLibraryOpen(false);
    if (entry.kind !== "costume" && entry.kind !== "backdrop") return;
    try {
      await host.addCostumes([await loadCostumeEntry(entry, loader)]);
    } catch (e) {
      report(e);
    }
  };

  const surprise = async (): Promise<void> => {
    try {
      const cat = await loader.loadCatalog();
      const entry = pickRandom<LibraryCostumeEntry | LibraryBackdropEntry>(isStage ? cat.backdrops : cat.costumes);
      if (entry) await host.addCostumes([await loadCostumeEntry(entry, loader)]);
    } catch (e) {
      report(e);
    }
  };

  const main: AddMenuItem = { key: "library", title: isStage ? t.chooseBackdrop : t.chooseCostume, icon: <IconSearch />, onClick: () => setLibraryOpen(true) };
  const items: AddMenuItem[] = [
    { key: "upload", title: isStage ? t.uploadBackdrop : t.uploadCostume, icon: <IconUpload />, fileAccept: COSTUME_ACCEPT, fileMultiple: true, onFiles: (f) => void addFromFiles(f) },
    { key: "surprise", title: t.surprise, icon: <IconSurprise />, onClick: () => void surprise() },
    { key: "paint", title: t.paint, icon: <IconBrush />, onClick: () => void host.addCostumes([emptyCostume(defaultCostumeName(isStage, locale))]).catch(report) },
  ];
  if (!isStage) items.push({ key: "camera", title: t.camera, icon: <IconCamera />, onClick: () => setCameraOpen(true) });

  return (
    <div className="kb-assettab">
      <AssetList
        ariaLabel={isStage ? t.backdrop : t.costume}
        strings={t}
        selectedIndex={selected}
        items={costumes.map((c, i) => ({
          key: `${i}:${c.assetId}:${c.name}`,
          name: c.name,
          detail: c.size ? formatCostumeDetails(c.size, c.bitmapResolution) : null,
          thumbUrl: thumbs[i] ?? null,
        }))}
        onSelect={(i) => host.setCostume(i)}
        onDuplicate={(i) => void host.duplicateCostume(i).catch(report)}
        onDelete={(i) => {
          if (!host.deleteCostume(i)) notify?.("warning", t.deleteFailedLast);
        }}
        onExport={(i) => {
          const c = costumes[i];
          if (c?.asset) downloadBytes(c.asset.data, `${c.name}.${c.dataFormat}`, mimeForFormat(c.dataFormat));
        }}
        onReorder={(from, to) => void host.reorderCostume(from, to)}
        addMenu={<AddMenu main={main} items={items} />}
      />
      <section className="kb-assettab__editor" aria-label={t.paint}>
        {current ? <PaintEditor key={target.id} costume={current} costumeIndex={selected} strings={t} onSave={onSave} onRename={onRename} notify={notify} /> : null}
      </section>
      {libraryOpen ? (
        <LibraryModal
          kind={isStage ? "backdrop" : "costume"}
          loader={loader}
          strings={t}
          locale={locale}
          title={isStage ? t.chooseBackdrop : t.chooseCostume}
          onSelect={(e) => void addFromLibrary(e)}
          onClose={() => setLibraryOpen(false)}
        />
      ) : null}
      {cameraOpen ? (
        <CameraModal
          strings={t}
          costumeName={defaultCostumeName(false, locale)}
          onClose={() => setCameraOpen(false)}
          onCapture={(c) => void host.addCostumes([c]).catch(report)}
          onDeviceActive={onDeviceActive}
        />
      ) : null}
    </div>
  );
}
