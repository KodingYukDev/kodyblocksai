/**
 * Tab Suara: daftar suara di kiri, editor di kanan. Aturan seleksi persis scratch-gui
 * containers/sound-tab.jsx (selectedSoundIndex lokal, bukan bagian dari target).
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AddMenu, type AddMenuItem } from "../costume-tab/AddMenu";
import { AssetList } from "../costume-tab/AssetList";
import { clampSoundSelection, selectionAfterSoundDelete } from "../costume-tab/asset-list-logic";
import { IconMic, IconSearch, IconSound, IconSurprise, IconUpload } from "../costume-tab/icons";
import { mimeForFormat } from "../costume-tab/new-asset";
import { tabStrings, type TabLocale } from "../costume-tab/strings";
import type { AssetEditorHost, DeviceActiveFn, NewSound, NotifyFn } from "../costume-tab/types";
import { downloadBytes, readInputFiles } from "../costume-tab/use-asset-url";
import { loadSoundEntry, pickRandom } from "../library/library-actions";
import type { LibraryLoader } from "../library/library-loader";
import { LibraryModal } from "../library/LibraryModal";
import { RecordModal } from "./RecordModal";
import { SoundEditor } from "./SoundEditor";
import { SOUND_ACCEPT, soundFromFile } from "./sound-media";
import { formatDuration } from "./waveform";
import type { PcmSound } from "./wav";
import "../costume-tab/asset-tab.css";

export interface SoundTabProps {
  host: AssetEditorHost;
  loader: LibraryLoader;
  locale?: TabLocale;
  notify?: NotifyFn;
  onDeviceActive?: DeviceActiveFn;
}

export function SoundTab({ host, loader, locale = "id", notify, onDeviceActive }: SoundTabProps) {
  const t = tabStrings(locale);
  const target = useSyncExternalStore(host.subscribe, host.getEditingTarget, host.getEditingTarget);
  const [selected, setSelected] = useState(0);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);
  const [clipboard, setClipboard] = useState<PcmSound | null>(null);
  const lastTarget = useRef<string | null>(null);
  const sounds = target?.sounds ?? [];

  // Ganti target -> seleksi 0; seleksi di luar batas -> dibatasi (componentWillReceiveProps).
  useEffect(() => {
    if (!target) return;
    if (lastTarget.current !== target.id) {
      lastTarget.current = target.id;
      setSelected(0);
    } else setSelected((s) => clampSoundSelection(s, target.sounds.length));
  }, [target]);

  const report = useCallback((e: unknown) => notify?.("error", e instanceof Error ? e.message : String(e)), [notify]);
  const onSave = useCallback((i: number, s: NewSound) => host.updateSound(i, s), [host]);
  const onRename = useCallback((i: number, name: string) => host.renameSound(i, name), [host]);

  /** handleNewSound: setelah menambah, pilih suara terakhir. */
  const addSounds = async (list: NewSound[]): Promise<void> => {
    if (list.length === 0) return;
    await host.addSounds(list);
    const n = host.getEditingTarget()?.sounds.length ?? 0;
    setSelected(Math.max(n - 1, 0));
  };

  if (!target) return <div className="kb-assettab kb-assettab--empty" />;
  const current = sounds[selected];

  const fromFiles = async (files: FileList): Promise<void> => {
    try {
      const out: NewSound[] = [];
      for (const f of await readInputFiles(files)) out.push(await soundFromFile(f));
      await addSounds(out);
    } catch (e) {
      report(e);
    }
  };

  const surprise = async (): Promise<void> => {
    try {
      const entry = pickRandom((await loader.loadCatalog()).sounds);
      if (entry) await addSounds([await loadSoundEntry(entry, loader)]);
    } catch (e) {
      report(e);
    }
  };

  const main: AddMenuItem = { key: "library", title: t.chooseSound, icon: <IconSearch />, onClick: () => setLibraryOpen(true) };
  const items: AddMenuItem[] = [
    { key: "upload", title: t.uploadSound, icon: <IconUpload />, fileAccept: SOUND_ACCEPT, fileMultiple: true, onFiles: (f) => void fromFiles(f) },
    { key: "surprise", title: t.surprise, icon: <IconSurprise />, onClick: () => void surprise() },
    { key: "record", title: t.record, icon: <IconMic />, onClick: () => setRecordOpen(true) },
  ];

  return (
    <div className="kb-assettab">
      <AssetList
        ariaLabel={t.sound}
        strings={t}
        selectedIndex={selected}
        items={sounds.map((s, i) => ({ key: `${i}:${s.assetId}:${s.name}`, name: s.name, detail: formatDuration(s.sampleCount, s.rate, locale), icon: <IconSound /> }))}
        onSelect={setSelected}
        onDuplicate={(i) =>
          void host
            .duplicateSound(i)
            .then(() => setSelected(i + 1))
            .catch(report)
        }
        onDelete={(i) => {
          if (host.deleteSound(i)) setSelected((s) => selectionAfterSoundDelete(s, i));
        }}
        onExport={(i) => {
          const s = sounds[i];
          if (s?.asset) downloadBytes(s.asset.data, `${s.name}.${s.dataFormat}`, mimeForFormat(s.dataFormat));
        }}
        onReorder={(from, to) => {
          const active = sounds[selected];
          if (host.reorderSound(from, to) && active) {
            const after = host.getEditingTarget()?.sounds ?? [];
            const idx = after.findIndex((s) => s.assetId === active.assetId && s.name === active.name);
            if (idx >= 0) setSelected(idx);
          }
        }}
        addMenu={<AddMenu main={main} items={items} />}
      />
      <section className="kb-assettab__editor" aria-label={t.sound}>
        {current ? (
          <SoundEditor
            sound={current}
            index={selected}
            strings={t}
            locale={locale}
            clipboard={clipboard}
            onClipboard={setClipboard}
            onSave={onSave}
            onRename={onRename}
            onCopyToNew={(s) => void addSounds([s]).catch(report)}
            notify={notify}
          />
        ) : (
          <p className="kb-assettab__hint">{t.noSounds}</p>
        )}
      </section>
      {libraryOpen ? (
        <LibraryModal
          kind="sound"
          loader={loader}
          strings={t}
          locale={locale}
          title={t.chooseSound}
          onSelect={(entry) => {
            setLibraryOpen(false);
            if (entry.kind === "sound") void loadSoundEntry(entry, loader).then((s) => addSounds([s])).catch(report);
          }}
          onClose={() => setLibraryOpen(false)}
        />
      ) : null}
      {recordOpen ? <RecordModal strings={t} onClose={() => setRecordOpen(false)} onSave={(s) => void addSounds([s]).catch(report)} onDeviceActive={onDeviceActive} /> : null}
    </div>
  );
}
