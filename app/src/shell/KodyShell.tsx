/**
 * Shell aplikasi ala KodyBlocks/scratch-gui: menu bar, tab editor, kolom panggung + panel sprite.
 * Area kode/kostum/suara diisi lewat `panels` (milik agent lain); semua aksi runtime lewat ShellController.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SB3_LIMITS } from "@kody/project";
import type { AppBus, AppLocale, EditorTab, StageSizeMode } from "../app-events";
import type { ExtensionLabelResolver } from "../stage-pane/monitors/monitor-adapter";
import { StagePane } from "../stage-pane/StagePane";
import { TargetPane } from "../sprite-pane/TargetPane";
import { AlertStack, type ShellAlert } from "./AlertStack";
import { EditorTabs } from "./EditorTabs";
import { useShellSnapshot, useViewport } from "./hooks";
import { LocaleContext, makeTranslate, type MessageKey } from "./i18n";
import { computeShellLayout, nextSizeMode } from "./layout";
import {
  DEFAULT_PROJECT_TITLE,
  downloadBytes,
  getProjectFilename,
  getProjectTitleFromFilename,
  pickFiles,
  PROJECT_FILE_ACCEPT,
  readPickedFile,
} from "./project-file";
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
}

export function KodyShell(props: KodyShellProps) {
  const { controller, bus } = props;
  const snapshot = useShellSnapshot(controller);
  const viewport = useViewport();
  const [locale, setLocale] = useState<AppLocale>(props.initialLocale ?? "id");
  const t = useMemo(() => makeTranslate(locale), [locale]);
  const [tab, setTab] = useState<EditorTab>("code");
  const [sizeMode, setSizeMode] = useState<StageSizeMode>("normal");
  const lastWindowed = useRef<StageSizeMode>("normal");
  const [title, setTitle] = useState(props.initialTitle ?? DEFAULT_PROJECT_TITLE);
  const [alerts, setAlerts] = useState<ShellAlert[]>([]);
  const alertId = useRef(0);
  const layout = computeShellLayout(viewport, sizeMode);
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

  useEffect(() => bus?.on("ui:alert", ({ level, message }) => pushAlert(level, message)), [bus, pushAlert]);
  useEffect(() => {
    if (snapshot.editingTargetId) bus?.emit("editor:target-selected", { targetId: snapshot.editingTargetId });
  }, [bus, snapshot.editingTargetId]);

  const changeTab = (next: EditorTab): void => {
    setTab(next);
    bus?.emit("editor:tab-changed", { tab: next });
  };
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

  // Esc keluar dari layar penuh.
  useEffect(() => {
    if (sizeMode !== "fullscreen") return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") changeSize("normal");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sizeMode, changeSize]);

  const changeLocale = (l: AppLocale): void => {
    setLocale(l);
    document.documentElement.lang = l;
    bus?.emit("locale:changed", { locale: l });
  };
  const changeTitle = (next: string): void => {
    setTitle(next);
    bus?.emit("project:title-changed", { title: next });
  };
  const toggleTurbo = (): void => {
    const enabled = !snapshot.turbo;
    controller.setTurbo(enabled);
    bus?.emit("run:turbo", { enabled });
  };

  const onNew = async (): Promise<void> => {
    const confirmFn = props.confirm ?? ((m: string) => window.confirm(m));
    if (!confirmFn(t("menu.confirmNew"))) return;
    try {
      await controller.newProject();
      setTitle(DEFAULT_PROJECT_TITLE);
      changeTab("code");
      bus?.emit("project:new", undefined);
      bus?.emit("project:loaded", { title: DEFAULT_PROJECT_TITLE, source: "default" });
    } catch (e) {
      onError(e);
    }
  };
  const onLoad = async (): Promise<void> => {
    const [file] = await pickFiles(PROJECT_FILE_ACCEPT, false);
    if (!file) return;
    try {
      if (file.size > SB3_LIMITS.maxFileBytes) throw new Error("File terlalu besar");
      await controller.loadProjectFile(await readPickedFile(file));
      const loadedTitle = getProjectTitleFromFilename(file.name) || title;
      setTitle(loadedTitle);
      changeTab("code");
      bus?.emit("project:loaded", { title: loadedTitle, source: "file" });
    } catch {
      alertKey("alert.loadFailed");
    }
  };
  const onSave = async (): Promise<void> => {
    try {
      const bytes = await controller.saveProjectFile();
      downloadBytes(getProjectFilename(title), bytes, "application/x.scratch.sb3");
      bus?.emit("project:saved", { kind: "download", at: Date.now() });
    } catch {
      alertKey("alert.saveFailed");
    }
  };

  const full = sizeMode === "fullscreen";
  const shellClass = ["kb-shell", layout.stacked ? "kb-shell--stacked" : "kb-shell--wide", full ? "kb-shell--fullscreen" : ""]
    .join(" ")
    .trim();

  return (
    <LocaleContext.Provider value={t}>
      <div className={shellClass}>
        <ShellMenuBar
          title={title}
          locale={locale}
          turbo={snapshot.turbo}
          onTitleChange={changeTitle}
          onLocaleChange={changeLocale}
          onToggleTurbo={toggleTurbo}
          onNew={() => void onNew()}
          onLoad={() => void onLoad()}
          onSave={() => void onSave()}
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
            />
          </section>
          <aside
            className="kb-shell__stage-column"
            style={layout.stacked ? undefined : { width: layout.stageColumnWidth }}
            aria-label="Panggung dan sprite"
          >
            <StagePane
              controller={controller}
              dims={layout.dims}
              sizeMode={sizeMode}
              showSizeToggle={!layout.stacked}
              running={snapshot.running}
              turbo={snapshot.turbo}
              monitors={snapshot.monitors}
              question={snapshot.question}
              onSizeMode={changeSize}
              extensionLabel={props.extensionLabel}
              onAlert={(m) => pushAlert("error", m)}
            />
            <TargetPane
              controller={controller}
              snapshot={snapshot}
              compact={layout.compactSpriteInfo}
              onError={onError}
              onOpenCostumes={() => changeTab("costumes")}
            />
          </aside>
        </main>
      </div>
    </LocaleContext.Provider>
  );
}
