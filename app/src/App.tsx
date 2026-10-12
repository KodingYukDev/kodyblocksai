/**
 * KodyBlocks AI v2: shell + runtime + editor blok + tab kostum/suara + ekstensi (Pena, Musik, AI).
 * Satu RuntimeHost per sesi; UI hanya bicara lewat ShellController / AssetEditorHost.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ComponentProps } from "react";
import { AiConsentDialog, CameraIndicator, loadAiExamples, peekAiServices } from "@kody/ai";
import type { TutorialCatalog } from "./components/AiTutorials";
import kodySvg from "./assets/kody.svg?raw";
import { createAppBus } from "./app-events";
import { CodePanel } from "./code-tab/CodePanel";
import { CostumeTab } from "./costume-tab/CostumeTab";
import { tabStrings } from "./costume-tab/strings";
import { createRuntimeHost, type RuntimeHost } from "./host/runtime-host";
import { LibraryModal } from "./library/LibraryModal";
import { createLibraryLoader } from "./library/library-loader";
import type { LibraryBackdropEntry, LibraryEntry, LibrarySpriteEntry } from "./library/library-types";
import { LoadingScreen } from "./components/LoadingScreen";
import { KodyShell } from "./shell/KodyShell";
import { SoundTab } from "./sound-tab/SoundTab";

type LibraryRequest = {
  kind: "sprite" | "backdrop";
  resolve(entry: LibrarySpriteEntry | LibraryBackdropEntry | null): void;
};

type Locale = "id" | "en";

/** AI Lab (melatih model sendiri) dimuat lazy agar tfjs/mediapipe tidak masuk bundle awal. */
const AiLab = lazy(() => import("@kody/ai/lab/AiLab"));

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

  if (!host) return <LoadingScreen text="Kody sedang menyiapkan panggung..." />;
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
  /** null = AI Lab tertutup; string = tab yang dibuka. */
  const [labTab, setLabTab] = useState<string | null>(null);
  const [labClasses, setLabClasses] = useState<readonly string[] | undefined>(undefined);
  const loadTutorials = useCallback(
    async (): Promise<TutorialCatalog> => {
      const ex = await loadAiExamples();
      return { examples: ex.AI_EXAMPLES, build: (id) => ex.buildAiExampleSb3(id, { kodySvg }) };
    },
    [],
  );
  const runtime = host.runtime;
  // iOS/iPadOS: AudioContext (mikrofon AI) dan speechSynthesis harus "dibuka" dari gestur pengguna.
  // Hanya bila ekstensi AI sudah dipakai, supaya proyek tanpa AI tidak membuat AudioContext.
  useEffect(() => {
    let speechPrimed = false;
    const onGesture = (): void => {
      const services = peekAiServices(runtime);
      if (!services) return;
      services.unlockAudio();
      if (!speechPrimed && typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance === "function") {
        speechPrimed = true;
        try {
          const u = new SpeechSynthesisUtterance("");
          u.volume = 0;
          window.speechSynthesis.speak(u);
        } catch {
          /* tidak didukung: diam saja */
        }
      }
    };
    const opts = { capture: true, passive: true } as const;
    window.addEventListener("pointerdown", onGesture, opts);
    window.addEventListener("keydown", onGesture, opts);
    return () => {
      window.removeEventListener("pointerdown", onGesture, opts);
      window.removeEventListener("keydown", onGesture, opts);
    };
  }, [runtime]);
  // Kesalahan saat skrip berjalan: beri tahu anak dengan bahasa sederhana, paling sering sekali per 15 detik.
  useEffect(() => {
    let last = -Infinity;
    return runtime.on("RUNTIME_ERROR", (e) => {
      // Blok AI sudah punya pemberitahuan sendiri (model gagal dimuat, izin ditolak, dst.).
      if (e.opcode && /^(ai|visionCommon)/.test(e.opcode)) return;
      const now = Date.now();
      if (now - last < 15_000) return;
      last = now;
      if (import.meta.env.DEV) console.warn("RUNTIME_ERROR", e);
      notify("warning", e.opcode ? "Ada blok yang tidak bisa dijalankan. Coba periksa skripmu, lalu jalankan lagi." : "Panggung sempat bermasalah. Kalau gambar hilang, muat ulang halaman.");
    });
  }, [runtime, notify]);
  // Perubahan oleh pengguna: blok (PROJECT_CHANGED) dan sprite/kostum/suara (TARGETS_UPDATE bertanda).
  const subscribeProjectChanges = useCallback(
    (listener: () => void) => {
      const offA = runtime.on("PROJECT_CHANGED", listener);
      const offB = runtime.on("TARGETS_UPDATE", (e) => {
        if (e.emitProjectChanged) listener();
      });
      return () => {
        offA();
        offB();
      };
    },
    [runtime],
  );
  const onSelect = (entry: LibraryEntry): void => {
    closeLibrary(entry.kind === "sprite" || entry.kind === "backdrop" ? entry : null);
  };

  return (
    <>
      <KodyShell
        controller={host.controller}
        bus={bus}
        initialLocale={locale}
        ready={host.ready}
        subscribeProjectChanges={subscribeProjectChanges}
        onOpenAiLab={(tab, classes) => {
          setLabClasses(classes);
          setLabTab(tab ?? "image");
        }}
        loadTutorials={loadTutorials}
        panels={{
          code: <CodePanel runtime={host.runtime} extensions={host.extensions} targetId={snapshot.editingTargetId} locale={locale} notify={notify} />,
          costumes: <CostumeTab host={host.assetHost} loader={loader} locale={locale} notify={notify} onDeviceActive={onDeviceActive} />,
          sounds: <SoundTab host={host.assetHost} loader={loader} locale={locale} notify={notify} onDeviceActive={onDeviceActive} />,
        }}
      />
      {labTab !== null ? (
        <div className="kb-ailab" role="dialog" aria-modal="true" aria-label="AI Lab">
          <div className="kb-ailab__box">
            <Suspense fallback={<div className="kb-ailab__loading">Memuat AI Lab...</div>}>
              <AiLab
                runtime={runtime}
                initialTab={labTab as NonNullable<ComponentProps<typeof AiLab>["initialTab"]>}
                initialClasses={labClasses}
                onClose={() => setLabTab(null)}
              />
            </Suspense>
          </div>
        </div>
      ) : null}
      <div className="kb-device-indicator">
        <CameraIndicator runtime={host.runtime} />
      </div>
      <AiConsentDialog />
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
