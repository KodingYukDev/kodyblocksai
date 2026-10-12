/**
 * Tambah sprite / latar (pustaka, gambar, unggah, kejutan): padanan vm.addSprite / vm.addBackdrop yang
 * dipanggil scratch-gui sprite-selector & stage-selector. Sprite baru dibuat langsung di runtime
 * (tanpa memuat ulang project) lalu diposisikan acak seperti randomizeSpritePosition scratch-gui.
 */
import type { IMediaLoader, IRuntime, ITarget } from "@kody/engine";
import { asRenderedTarget, createSprite, StringUtil } from "@kody/engine";
import { isSprite3Name, loadSprite3 } from "@kody/project";
import { costumesFromFile } from "../costume-tab/costume-media";
import { emptyCostume } from "../costume-tab/new-asset";
import type { NewCostume, NewSound } from "../costume-tab/types";
import { loadCostumeEntry, loadSpriteEntry, pickRandom } from "../library/library-actions";
import type { LibraryLoader } from "../library/library-loader";
import type { LibraryBackdropEntry, LibraryKind, LibrarySpriteEntry } from "../library/library-types";
import type { AssetActions } from "../shell/runtime-controller";
import type { AddMethod, PickedFile } from "../shell/types";
import { installSprite } from "./sprite-install";

export interface AssetActionDeps {
  runtime: IRuntime;
  media: IMediaLoader;
  loader: LibraryLoader;
  /** Buka modal pustaka; resolve dengan entri terpilih atau null bila ditutup. */
  chooseFromLibrary(kind: Extract<LibraryKind, "sprite" | "backdrop">): Promise<LibrarySpriteEntry | LibraryBackdropEntry | null>;
  locale?: "id" | "en";
  random?: () => number;
  /** Muat ekstensi yang dipakai sprite .sprite3; kembalikan id yang tidak dikenal. */
  loadExtensions?: (ids: readonly string[]) => Promise<string[]>;
  /** Peringatan non-fatal saat impor (mis. asset sprite hilang). */
  onWarnings?: (warnings: readonly string[]) => void;
}

export class UnsupportedUploadError extends Error {
  constructor(name: string) {
    super(`File ${name} belum didukung (unggah gambar .svg/.png/.jpg/.bmp/.gif atau sprite .sprite3)`);
    this.name = "UnsupportedUploadError";
  }
}

function isSprite2(name: string): boolean {
  return /\.sprite2$/i.test(name);
}

export function createAssetActions(deps: AssetActionDeps): AssetActions {
  const { runtime, media } = deps;
  const random = deps.random ?? Math.random;
  const locale = deps.locale ?? "id";

  /** vm.addSprite: sprite baru di depan, terpilih untuk diedit. */
  const addSpriteTarget = async (name: string, costumes: readonly NewCostume[], sounds: readonly NewSound[]): Promise<ITarget> => {
    const used = runtime.targets.filter((t) => !t.isStage).map((t) => t.sprite.name);
    const sprite = createSprite(runtime, undefined, StringUtil.unusedName(name || "Sprite1", used));
    sprite.costumes = await Promise.all(costumes.map((c) => media.loadCostume({ ...c.state }, c.asset)));
    sprite.sounds = await Promise.all(sounds.map((s) => media.loadSound({ ...s.state }, s.asset)));
    const target = sprite.createClone();
    runtime.addTarget(target);
    // randomizeSpritePosition (scratch-gui): x di [-100,100), y di [-50,50).
    target.setXY(Math.floor(200 * random()) - 100, Math.floor(100 * random()) - 50);
    asRenderedTarget(target)?.updateAllDrawableProperties();
    runtime.setEditingTarget(target);
    runtime.emit("TARGETS_UPDATE", { emitProjectChanged: true });
    runtime.emitProjectChanged();
    return target;
  };

  /** vm.addBackdrop: tambah costume ke stage dan langsung pakai. */
  const addBackdropCostumes = async (costumes: readonly NewCostume[]): Promise<void> => {
    const stage = runtime.getTargetForStage();
    if (!stage) throw new Error("Panggung belum ada");
    for (const c of costumes) {
      const loaded = await media.loadCostume({ ...c.state }, c.asset);
      stage.sprite.addCostumeAt(loaded, stage.sprite.costumes.length);
      stage.setCostume(stage.sprite.costumes.length - 1);
    }
    runtime.setEditingTarget(stage);
    runtime.emit("TARGETS_UPDATE", { emitProjectChanged: true });
    runtime.emitProjectChanged();
  };

  const costumesFromFiles = async (files: readonly PickedFile[] | undefined): Promise<{ name: string; costumes: NewCostume[] }[]> => {
    const out: { name: string; costumes: NewCostume[] }[] = [];
    for (const f of files ?? []) {
      if (isSprite2(f.name) || isSprite3Name(f.name)) throw new UnsupportedUploadError(f.name);
      const costumes = await costumesFromFile({ name: f.name, type: f.type, bytes: f.bytes });
      out.push({ name: f.name.replace(/\.[^.]+$/, ""), costumes });
    }
    return out;
  };

  const addLibrarySprite = async (entry: LibrarySpriteEntry): Promise<void> => {
    const loaded = await loadSpriteEntry(entry, deps.loader);
    await addSpriteTarget(locale === "en" ? entry.nameEn : loaded.name, loaded.costumes, loaded.sounds);
  };

  return {
    async addSprite(method: AddMethod, files?: readonly PickedFile[]) {
      switch (method) {
        case "library": {
          const entry = await deps.chooseFromLibrary("sprite");
          if (entry && entry.kind === "sprite") await addLibrarySprite(entry);
          return;
        }
        case "surprise": {
          const entry = pickRandom((await deps.loader.loadCatalog()).sprites, random);
          if (entry) await addLibrarySprite(entry);
          return;
        }
        case "paint": {
          await addSpriteTarget("Sprite1", [emptyCostume(locale === "en" ? "costume1" : "kostum1")], []);
          return;
        }
        case "upload": {
          for (const f of files ?? []) {
            if (isSprite3Name(f.name)) {
              const loaded = await loadSprite3(f.bytes);
              if (loaded.warnings.length) deps.onWarnings?.(loaded.warnings);
              await installSprite({ runtime, media, ...(deps.loadExtensions ? { loadExtensions: deps.loadExtensions } : {}) }, loaded);
              continue;
            }
            for (const { name, costumes } of await costumesFromFiles([f])) {
              if (costumes.length) await addSpriteTarget(name, costumes, []);
            }
          }
          return;
        }
      }
    },
    async addBackdrop(method: AddMethod, files?: readonly PickedFile[]) {
      switch (method) {
        case "library": {
          const entry = await deps.chooseFromLibrary("backdrop");
          if (entry && entry.kind === "backdrop") await addBackdropCostumes([await loadCostumeEntry(entry, deps.loader)]);
          return;
        }
        case "surprise": {
          const entry = pickRandom((await deps.loader.loadCatalog()).backdrops, random);
          if (entry) await addBackdropCostumes([await loadCostumeEntry(entry, deps.loader)]);
          return;
        }
        case "paint": {
          await addBackdropCostumes([emptyCostume(locale === "en" ? "backdrop1" : "latar1")]);
          return;
        }
        case "upload": {
          const all = (await costumesFromFiles(files)).flatMap((x) => x.costumes);
          if (all.length) await addBackdropCostumes(all);
          return;
        }
      }
    },
  };
}
