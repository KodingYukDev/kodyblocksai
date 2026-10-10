/**
 * KodyBlocks AI v2: shell + runtime + editor blok + tab kostum/suara + ekstensi (Pena, Musik, AI).
 * Satu RuntimeHost per sesi; UI hanya bicara lewat ShellController / AssetEditorHost.
 */
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { CameraIndicator } from "@kody/ai";
import kodySvg from "./assets/kody.svg?raw";
import { createAppBus } from "./app-events";
import { CodePanel } from "./code-tab/CodePanel";
import { CostumeTab } from "./costume-tab/CostumeTab";
import { tabStrings } from "./costume-tab/strings";
import { createRuntimeHost, type RuntimeHost } from "./host/runtime-host";
import { LibraryModal } from "./library/LibraryModal";
import { createLibraryLoader } from "./library/library-loader";
import type { LibraryBackdropEntry, LibraryEntry, LibrarySpriteEntry } from "./library/library-types";
import { KodyShell } from "./shell/KodyShell";
import { SoundTab } from "./sound-tab/SoundTab";

type LibraryRequest = {
  kind: "sprite" | "backdrop";
  resolve(entry: LibrarySpriteEntry | LibraryBackdropEntry | null): void;
};

type Locale = "id" | "en";

export function App() {
  const bus = useMemo(() => createAppBus(), []);
  const loader = useMemo(() => createLibraryLoader(), []);
  const [locale, setLocale] = useState<Locale>("id");
  const [libraryRequest, setLibraryRequest] = useState<LibraryRequest | null>(null);

  const notify = useCallback(
    (level: "info" | "success" | "warning" | "error", message: string) => bus.emit("ui:alert", { level, message }),
    [bus],
  );
  const onDeviceActive = useCallback(
    (device: "camera" | "microphone", active: boolean) => bus.emit("ai:device-active", { device, active }),
    [bus],
  );

  const [host, setHost] = useState<RuntimeHost | null>(null);
  useEffect(() => {
    const h = createRuntimeHost({
      kodySvg,
      loader,
      locale: "id",
      chooseFromLibrary: (kind) => new Promise((resolve) => setLibraryRequest({ kind, resolve })),
      onDeviceActive,
      onWarnings: (w) => notify("warning", w.slice(0, 3).join("; ")),
    });
    setHost(h);
    if (import.meta.env.DEV || import.meta.env.MODE === "e2e") {
      (window as unknown as { __kody?: RuntimeHost }).__kody = h;
    }
    return () => h.dispose();
  }, [loader, notify, onDeviceActive]);

  useEffect(() => bus.on("locale:changed", ({ locale: l }) => setLocale(l)), [bus]);

  if (!host) return null;
  return (
    <AppWithHost
      host={host}
      bus={bus}
      locale={locale}
      loader={loader}
      notify={notify}
      onDeviceActive={onDeviceActive}
      libraryRequest={libraryRequest}
      closeLibrary={(entry) => {
        libraryRequest?.resolve(entry);
        setLibraryRequest(null);
      }}
    />
  );
}

interface AppWithHostProps {
  host: RuntimeHost;
  bus: ReturnType<typeof createAppBus>;
  locale: Locale;
  loader: ReturnType<typeof createLibraryLoader>;
  notify(level: "info" | "success" | "warning" | "error", message: string): void;
  onDeviceActive(device: "camera" | "microphone", active: boolean): void;
  libraryRequest: LibraryRequest | null;
  closeLibrary(entry: LibrarySpriteEntry | LibraryBackdropEntry | null): void;
}

function AppWithHost({ host, bus, locale, loader, notify, onDeviceActive, libraryRequest, closeLibrary }: AppWithHostProps) {
  const snapshot = useSyncExternalStore(host.controller.subscribe, host.controller.getSnapshot);
  const strings = tabStrings(locale);
  const onSelect = (entry: LibraryEntry): void => {
    closeLibrary(entry.kind === "sprite" || entry.kind === "backdrop" ? entry : null);
  };

  return (
    <>
      <KodyShell
        controller={host.controller}
        bus={bus}
        initialLocale={locale}
        panels={{
          code: <CodePanel runtime={host.runtime} extensions={host.extensions} targetId={snapshot.editingTargetId} locale={locale} notify={notify} />,
          costumes: <CostumeTab host={host.assetHost} loader={loader} locale={locale} notify={notify} onDeviceActive={onDeviceActive} />,
          sounds: <SoundTab host={host.assetHost} loader={loader} locale={locale} notify={notify} onDeviceActive={onDeviceActive} />,
        }}
      />
      <div className="kb-device-indicator">
        <CameraIndicator runtime={host.runtime} />
      </div>
      {libraryRequest ? (
        <LibraryModal
          kind={libraryRequest.kind}
          loader={loader}
          strings={strings}
          locale={locale}
          title={libraryRequest.kind === "sprite" ? strings.chooseSprite : strings.chooseBackdrop}
          onSelect={onSelect}
          onClose={() => closeLibrary(null)}
        />
      ) : null}
    </>
  );
}
