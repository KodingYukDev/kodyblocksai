/**
 * Shell aplikasi ala KodyBlocks/scratch-gui: menu bar, tab editor, kolom panggung + panel sprite.
 * Area kode/kostum/suara diisi lewat `panels` (milik agent lain); semua aksi runtime lewat ShellController.
 * Tata letak menyesuaikan desktop, tablet (landscape/potret), dan ponsel (layout.ts).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SB3_LIMITS } from "@kody/project";
import type { AppBus, AppLocale, StageSizeMode } from "../app-events";
import { AiTutorials, type TutorialCard, type TutorialCatalog } from "../components/AiTutorials";
import { KodyDialog } from "../components/KodyDialog";
import { LoadingScreen } from "../components/LoadingScreen";
import type { ExtensionLabelResolver } from "../stage-pane/monitors/monitor-adapter";
import { StagePane } from "../stage-pane/StagePane";
import { TargetPane } from "../sprite-pane/TargetPane";
import { AlertStack, type ShellAlert } from "./AlertStack";
import {
  createIdbAutosaveStore,
  createShellAutosaver,
  type AutosaveRecord,
  type ShellAutosaver,
  type ShellAutosaveStore,
} from "./autosave";
import { EditorTabs, type ShellTab } from "./EditorTabs";
import { useCoarsePointer, useShellSnapshot, useViewport } from "./hooks";
import { LocaleContext, makeTranslate, type MessageKey } from "./i18n";
import { computeShellLayout, nextSizeMode } from "./layout";
import {
  DEFAULT_PROJECT_TITLE,
  getProjectFilename,
  getProjectTitleFromFilename,
  matchesAccept,
  pickFiles,
  PROJECT_FILE_ACCEPT,
  readPickedFile,
  saveFile,
} from "./project-file";
import { useRealFullscreen } from "./fullscreen";
import { ShellMenuBar } from "./ShellMenuBar";
import type { ShellController } from "./types";
import "./shell.css";
import "../stage-pane/stage-pane.css";
import "../sprite-pane/sprite-pane.css";

export interface KodyShellPanels {
  code: ReactNode;
  costumes?: ReactNode;
  sounds?: ReactNode;
}

export interface KodyShellProps {
  controller: ShellController;
  panels: KodyShellPanels;
  bus?: AppBus;
  initialTitle?: string;
  initialLocale?: AppLocale;
  extensionLabel?: ExtensionLabelResolver;
  /** Konfirmasi "Baru" (default window.confirm). */
  confirm?(message: string): boolean;
  /** Selesai saat engine + project awal siap; selama itu layar muat Kody tampil. */
  ready?: Promise<void>;
  /** Berlangganan perubahan project oleh pengguna (blok, sprite, kostum...). Dipakai simpan otomatis. */
  subscribeProjectChanges?(listener: () => void): () => void;
  /** Penyimpanan simpan otomatis. undefined = IndexedDB bawaan, null = mati. */
  autosaveStore?: ShellAutosaveStore | null;
  /** Menu "Belajar AI": katalog tutorial & contoh project AI (dimuat lazy). Shell menampilkan kartunya. */
  loadTutorials?(): Promise<TutorialCatalog>;
  /** Alternatif loadTutorials: app menampilkan tutorial sendiri. undefined (keduanya) = item tidak tampil. */
  onOpenTutorials?(): void;
  /** Menu "Belajar AI": buka AI Lab untuk melatih model sendiri (opsional langsung ke tab tertentu). */
  onOpenAiLab?(tab?: string, classes?: readonly string[]): void;
}

const KEYPAD_PREF = "kb.keypad";
const readKeypadPref = (): boolean | null => {
  try {
    const v = window.localStorage.getItem(KEYPAD_PREF);
    return v === null ? null : v === "1";
  } catch {
    return null;
  }
};
const writeKeypadPref = (on: boolean): void => {
  try {
    window.localStorage.setItem(KEYPAD_PREF, on ? "1" : "0");
  } catch {
    // Penyimpanan diblokir (mode privat): preferensi hanya berlaku sesi ini.
  }
};

/** Jeda setelah memuat project sebelum perubahan dianggap buatan pengguna. */
const LOAD_QUIET_MS = 800;

/**
 * Engine (ready) yang sudah ditawari pemulihan. Shell yang dipasang ulang di atas engine yang sama
 * (hot reload, StrictMode) tidak menawarkan lagi draf dari sesi yang sedang berjalan; engine baru
 * (mis. setelah "Coba lagi" di layar error) tetap ditawari.
 */
const restoreOffered = new WeakSet<Promise<void>>();

export function KodyShell(props: KodyShellProps) {
  const { controller, bus } = props;
  const snapshot = useShellSnapshot(controller);
  const viewport = useViewport();
  const coarse = useCoarsePointer();
  const locale: AppLocale = props.initialLocale ?? "id";
  const t = useMemo(() => makeTranslate(locale), [locale]);
  const [tab, setTab] = useState<ShellTab>("code");
  const [sizeMode, setSizeMode] = useState<StageSizeMode>("normal");
  const lastWindowed = useRef<StageSizeMode>("normal");
  const [title, setTitle] = useState(props.initialTitle ?? DEFAULT_PROJECT_TITLE);
  const titleRef = useRef(title);
  titleRef.current = title;
  const [alerts, setAlerts] = useState<ShellAlert[]>([]);
  const alertId = useRef(0);
  const [keypadPref, setKeypadPref] = useState<boolean | null>(readKeypadPref);
  const keypadOn = keypadPref ?? false;
  const [loading, setLoading] = useState(props.ready !== undefined);
  const [restore, setRestore] = useState<AutosaveRecord | null>(null);
  const [saveReady, setSaveReady] = useState<Uint8Array | null>(null);
  const [tutorialsOpen, setTutorialsOpen] = useState(false);
  const layout = computeShellLayout(viewport, sizeMode, { keypad: keypadOn });
  const editing = snapshot.targets.find((x) => x.id === snapshot.editingTargetId) ?? null;

  const pushAlert = useCallback((level: ShellAlert["level"], message: string) => {
    alertId.current += 1;
    const id = alertId.current;
    setAlerts((a) => [...a.slice(-3), { id, level, message }]);
  }, []);
  const dismissAlert = useCallback((id: number) => setAlerts((a) => a.filter((x) => x.id !== id)), []);
  const alertKey = useCallback((key: MessageKey, level: ShellAlert["level"] = "error") => pushAlert(level, t(key)), [pushAlert, t]);
  const onError = useCallback(
    (e: unknown) => {
      const unavailable = e instanceof Error && e.name === "FeatureUnavailableError";
      alertKey(unavailable ? "alert.notAvailable" : "alert.actionFailed", unavailable ? "info" : "error");
    },
    [alertKey],
  );

  // ---------- simpan otomatis & perubahan belum disimpan ----------
  const store = useMemo<ShellAutosaveStore | null>(
    () => (props.autosaveStore !== undefined ? props.autosaveStore : createIdbAutosaveStore()),
    // Penyimpanan dipilih sekali per shell.
    [],
  );
  // Dibuat di effect (bukan useMemo) agar siklus pasang-lepas StrictMode tidak meninggalkan autosaver yang sudah dibuang.
  const autosaverRef = useRef<ShellAutosaver | null>(null);
  useEffect(() => {
    if (!store) return;
    const a = createShellAutosaver({
      store,
      serialize: () => controller.saveProjectFile(),
      getTitle: () => titleRef.current,
      onError: (e) => console.warn("Simpan otomatis gagal", e),
    });
    autosaverRef.current = a;
    return () => {
      a.dispose();
      if (autosaverRef.current === a) autosaverRef.current = null;
    };
  }, [store, controller]);
  const dirty = useRef(false);
  /** Perubahan sebelum waktu ini berasal dari memuat project, bukan dari pengguna. */
  const quietUntil = useRef(props.ready !== undefined ? Number.POSITIVE_INFINITY : 0);
  const markChanged = useCallback(() => {
    if (Date.now() < quietUntil.current) return;
    dirty.current = true;
    autosaverRef.current?.changed();
    bus?.emit("project:changed", undefined);
  }, [bus]);
  const markLoaded = useCallback(() => {
    quietUntil.current = Date.now() + LOAD_QUIET_MS;
    dirty.current = false;
    autosaverRef.current?.reset();
  }, []);

  const subscribeChanges = props.subscribeProjectChanges;
  useEffect(() => subscribeChanges?.(markChanged), [subscribeChanges, markChanged]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent): void => {
      if (!dirty.current) return;
      void autosaverRef.current?.flush();
      e.preventDefault();
      // Chrome/Safari lama butuh returnValue terisi.
      e.returnValue = t("unsaved.warning");
    };
    const onHide = (): void => {
      if (document.visibilityState === "hidden") void autosaverRef.current?.flush();
    };
    const onPageHide = (): void => void autosaverRef.current?.flush();
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [t]);

  // Engine siap -> tutup layar muat, lalu tawarkan draf simpan otomatis yang belum disimpan.
  const ready = props.ready;
  useEffect(() => {
    let alive = true;
    // Tanpa engine async (tes/pratinjau) dan tanpa penyimpanan: tidak ada yang perlu ditunggu.
    if (!ready && !store) return;
    void (ready ?? Promise.resolve()).then(async () => {
      if (!alive) return;
      if (ready) {
        setLoading(false);
        quietUntil.current = Date.now() + LOAD_QUIET_MS;
        if (restoreOffered.has(ready)) return;
        restoreOffered.add(ready);
      }
      if (!store) return;
      const rec = await store.read().catch(() => null);
      if (alive && rec?.dirty) setRestore(rec);
    });
    return () => {
      alive = false;
    };
  }, [ready, store]);

  useEffect(() => bus?.on("ui:alert", ({ level, message }) => pushAlert(level, message)), [bus, pushAlert]);
  useEffect(() => {
    if (snapshot.editingTargetId) bus?.emit("editor:target-selected", { targetId: snapshot.editingTargetId });
  }, [bus, snapshot.editingTargetId]);

  const changeTab = useCallback(
    (next: ShellTab): void => {
      setTab(next);
      if (next !== "sprites") bus?.emit("editor:tab-changed", { tab: next });
    },
    [bus],
  );
  // Tab "Sprite" hanya ada di layar sempit; kembali ke Kode saat layar melebar.
  useEffect(() => {
    if (tab === "sprites" && !layout.spritesInTab) changeTab("code");
  }, [tab, layout.spritesInTab, changeTab]);

  const changeSize = useCallback(
    (requested: StageSizeMode) => {
      const next = nextSizeMode(sizeMode, requested, lastWindowed.current);
      if (next === sizeMode) return;
      if (next !== "fullscreen") lastWindowed.current = next;
      setSizeMode(next);
      bus?.emit("stage:size-mode", { mode: next });
    },
    [bus, sizeMode],
  );
  const full = sizeMode === "fullscreen";
  // Layar penuh sungguhan (menyembunyikan bilah browser) bila didukung; keluar lewat sistem = keluar juga di sini.
  useRealFullscreen(full, () => changeSize("normal"));

  // Esc keluar dari layar penuh.
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") changeSize("normal");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [full, changeSize]);

  const changeTitle = (next: string): void => {
    if (next === title) return;
    setTitle(next);
    bus?.emit("project:title-changed", { title: next });
    markChanged();
  };
  const toggleTurbo = (): void => {
    const enabled = !snapshot.turbo;
    controller.setTurbo(enabled);
    bus?.emit("run:turbo", { enabled });
  };
  const toggleKeypad = (): void => {
    const next = !keypadOn;
    setKeypadPref(next);
    writeKeypadPref(next);
  };

  const confirmFn = props.confirm ?? ((m: string) => window.confirm(m));
  const onNew = async (): Promise<void> => {
    if (!confirmFn(t("menu.confirmNew"))) return;
    try {
      quietUntil.current = Number.POSITIVE_INFINITY;
      await controller.newProject();
      markLoaded();
      setTitle(DEFAULT_PROJECT_TITLE);
      changeTab("code");
      bus?.emit("project:new", undefined);
      bus?.emit("project:loaded", { title: DEFAULT_PROJECT_TITLE, source: "default" });
    } catch (e) {
      quietUntil.current = 0;
      onError(e);
    }
  };
  const onLoad = async (): Promise<void> => {
    const [file] = await pickFiles(PROJECT_FILE_ACCEPT, false);
    if (!file) return;
    if (!matchesAccept(file.name, PROJECT_FILE_ACCEPT)) {
      alertKey("alert.wrongFileType");
      return;
    }
    try {
      if (file.size > SB3_LIMITS.maxFileBytes) throw new Error("File terlalu besar");
      quietUntil.current = Number.POSITIVE_INFINITY;
      await controller.loadProjectFile(await readPickedFile(file));
      markLoaded();
      const loadedTitle = getProjectTitleFromFilename(file.name) || title;
      setTitle(loadedTitle);
      changeTab("code");
      bus?.emit("project:loaded", { title: loadedTitle, source: "file" });
    } catch {
      quietUntil.current = 0;
      alertKey("alert.loadFailed");
    }
  };
  const onOpenExample = async (card: TutorialCard, bytes: Uint8Array): Promise<boolean> => {
    if (dirty.current && !confirmFn(t("menu.confirmNew"))) return false;
    try {
      quietUntil.current = Number.POSITIVE_INFINITY;
      await controller.loadProjectFile({ name: `${card.title}.sb3`, type: "application/x.scratch.sb3", bytes });
      markLoaded();
      setTitle(card.title);
      changeTab("code");
      bus?.emit("project:loaded", { title: card.title, source: "file" });
      return true;
    } catch (e) {
      quietUntil.current = 0;
      throw e;
    }
  };
  const loadTutorials = props.loadTutorials;
  const openTutorials = loadTutorials ? () => setTutorialsOpen(true) : props.onOpenTutorials;
  const closeTutorials = useCallback(() => setTutorialsOpen(false), []);

  const afterSaved = (): void => {
    dirty.current = false;
    autosaverRef.current?.markSaved();
    bus?.emit("project:saved", { kind: "download", at: Date.now() });
  };
  const writeFile = async (bytes: Uint8Array): Promise<void> => {
    const result = await saveFile(getProjectFilename(title), bytes, "application/x.scratch.sb3");
    if (result === "needs-gesture") setSaveReady(bytes);
    else if (result !== "cancelled") afterSaved();
  };
  const onSave = async (): Promise<void> => {
    try {
      await writeFile(await controller.saveProjectFile());
    } catch {
      alertKey("alert.saveFailed");
    }
  };

  const onRestore = async (rec: AutosaveRecord): Promise<void> => {
    setRestore(null);
    try {
      quietUntil.current = Number.POSITIVE_INFINITY;
      await controller.loadProjectFile({ name: `${rec.title}.sb3`, type: "application/x.scratch.sb3", bytes: rec.bytes });
      quietUntil.current = Date.now() + LOAD_QUIET_MS;
      // Draf tetap "belum disimpan ke file" sampai anak menyimpannya sebagai .sb3.
      dirty.current = true;
      setTitle(rec.title);
      changeTab("code");
      bus?.emit("project:loaded", { title: rec.title, source: "autosave" });
    } catch {
      quietUntil.current = 0;
      void store?.clear().catch(() => undefined);
      pushAlert("error", t("restore.failed"));
    }
  };
  const onDeclineRestore = (): void => {
    setRestore(null);
    void store?.clear().catch(() => undefined);
  };

  const shellClass = [
    "kb-shell",
    `kb-shell--${layout.mode}`,
    layout.stacked ? "kb-shell--stacked" : "",
    layout.spritesInTab ? "kb-shell--sprites-in-tab" : "",
    full ? "kb-shell--fullscreen" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const targetPane = (
    <TargetPane
      controller={controller}
      snapshot={snapshot}
      compact={layout.compactSpriteInfo}
      onError={onError}
      onOpenCostumes={() => changeTab("costumes")}
    />
  );

  const columnStyle = layout.mode === "wide" ? { width: layout.stageColumnWidth } : layout.mode === "split" ? { height: layout.topRowHeight } : undefined;

  return (
    <LocaleContext.Provider value={t}>
      <div className={shellClass}>
        <ShellMenuBar
          title={title}
          turbo={snapshot.turbo}
          compact={viewport.width < 600}
          onTitleChange={changeTitle}
          onToggleTurbo={toggleTurbo}
          onNew={() => void onNew()}
          onLoad={() => void onLoad()}
          onSave={() => void onSave()}
          onOpenTutorials={openTutorials}
          onOpenAiLab={props.onOpenAiLab ? () => props.onOpenAiLab?.() : undefined}
        />
        <AlertStack alerts={alerts} onDismiss={dismissAlert} />
        <main className="kb-shell__body">
          <section className="kb-shell__editor" aria-label={t("tab.code")}>
            <EditorTabs
              active={tab}
              isStage={!!editing?.isStage}
              onChange={changeTab}
              panels={{
                code: props.panels.code,
                costumes: props.panels.costumes ?? <div className="kb-tabpanel__empty">{t("alert.notAvailable")}</div>,
                sounds: props.panels.sounds ?? <div className="kb-tabpanel__empty">{t("alert.notAvailable")}</div>,
              }}
              spritesPanel={layout.spritesInTab ? targetPane : undefined}
            />
          </section>
          <aside className="kb-shell__stage-column" style={columnStyle} aria-label="Panggung dan sprite">
            <StagePane
              controller={controller}
              dims={layout.dims}
              sizeMode={sizeMode}
              showSizeToggle
              running={snapshot.running}
              turbo={snapshot.turbo}
              monitors={snapshot.monitors}
              question={snapshot.question}
              onSizeMode={changeSize}
              extensionLabel={props.extensionLabel}
              onAlert={(m) => pushAlert("error", m)}
              keypad={keypadOn}
              onToggleKeypad={coarse || keypadOn ? toggleKeypad : undefined}
            />
            {layout.spritesInTab ? null : targetPane}
          </aside>
        </main>
        {tutorialsOpen && loadTutorials && (
          <AiTutorials
            load={loadTutorials}
            onOpenExample={onOpenExample}
            onOpenLab={
              props.onOpenAiLab
                ? (tab, classes) => {
                    setTutorialsOpen(false);
                    props.onOpenAiLab?.(tab, classes);
                  }
                : undefined
            }
            onClose={closeTutorials}
          />
        )}
        {loading && <LoadingScreen text={t("loading.text")} overlay />}
        {!loading && restore && (
          <KodyDialog
            title={t("restore.title")}
            onDismiss={onDeclineRestore}
            actions={[
              { label: t("restore.no"), onClick: onDeclineRestore },
              { label: t("restore.yes"), onClick: () => void onRestore(restore), primary: true },
            ]}
          >
            {t("restore.body", {
              title: restore.title,
              time: new Date(restore.savedAt).toLocaleString(locale === "id" ? "id-ID" : "en-US", {
                dateStyle: "medium",
                timeStyle: "short",
              }),
            })}
          </KodyDialog>
        )}
        {saveReady && (
          <KodyDialog
            title={t("save.readyTitle")}
            onDismiss={() => setSaveReady(null)}
            actions={[
              { label: t("save.cancel"), onClick: () => setSaveReady(null) },
              {
                label: t("save.readyButton"),
                primary: true,
                onClick: () => {
                  const bytes = saveReady;
                  setSaveReady(null);
                  void writeFile(bytes).catch(() => alertKey("alert.saveFailed"));
                },
              },
            ]}
          >
            {t("save.readyBody")}
          </KodyDialog>
        )}
      </div>
    </LocaleContext.Provider>
  );
}
