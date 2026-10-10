/**
 * Project default: Stage putih + sprite Kody, padanan default-project scratch-gui (Stage dengan
 * backdrop putih dan satu variabel global "my variable", Sprite1 di tengah). Pemilik: agent project.
 */
import type { CostumeState, ProjectModel, TargetState } from "@kody/engine";
import { uid } from "@kody/engine/util/string-util";
import { addAsset, createAssetStore } from "./asset-store";
import { readImageSize } from "./image-size";
import { KODY_VM_VERSION } from "./serialize";
import type { LoadedProject } from "./types";

/** Backdrop putih 480x360 (pusat rotasi = tengah panggung). */
export const WHITE_BACKDROP_SVG =
  '<svg version="1.1" xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">' +
  '<rect x="0" y="0" width="480" height="360" fill="#ffffff"/></svg>';

const TEXT = {
  id: { backdrop: "latar1", sprite: "Kody", costume: "kostum1", variable: "variabelku" },
  en: { backdrop: "backdrop1", sprite: "Kody", costume: "costume1", variable: "my variable" },
} as const;

export interface DefaultProjectOptions {
  locale?: keyof typeof TEXT;
  makeId?: () => string;
}

function svgCostume(svg: string, name: string, store: ReturnType<typeof createAssetStore>): CostumeState {
  const bytes = new TextEncoder().encode(svg);
  const { assetId, md5ext } = addAsset(store, bytes, "svg");
  const size = readImageSize(bytes, "svg") ?? { width: 0, height: 0 };
  return {
    name,
    assetId,
    md5ext,
    dataFormat: "svg",
    bitmapResolution: 1,
    rotationCenterX: size.width / 2,
    rotationCenterY: size.height / 2,
  };
}

/** Buat project baru. `kodySvg` = isi SVG maskot (app/public/kody.svg). */
export function createDefaultProject(kodySvg: string, options: DefaultProjectOptions = {}): LoadedProject {
  const text = TEXT[options.locale ?? "id"];
  const makeId = options.makeId ?? (() => uid());
  const assets = createAssetStore();
  const backdrop = svgCostume(WHITE_BACKDROP_SVG, text.backdrop, assets);
  const kody = svgCostume(kodySvg, text.costume, assets);

  const variableId = makeId();
  const stage: TargetState = {
    id: makeId(),
    isStage: true,
    name: "Stage",
    variables: {
      [variableId]: { id: variableId, name: text.variable, type: "", value: 0, isCloud: false },
    },
    blocks: {},
    comments: {},
    currentCostume: 0,
    costumes: [backdrop],
    sounds: [],
    volume: 100,
    layerOrder: 0,
    tempo: 60,
    videoTransparency: 50,
    videoState: "on",
    textToSpeechLanguage: null,
  };
  const sprite: TargetState = {
    id: makeId(),
    isStage: false,
    name: text.sprite,
    variables: {},
    blocks: {},
    comments: {},
    currentCostume: 0,
    costumes: [kody],
    sounds: [],
    volume: 100,
    layerOrder: 1,
    visible: true,
    x: 0,
    y: 0,
    size: 100,
    direction: 90,
    draggable: false,
    rotationStyle: "all around",
  };
  const model: ProjectModel = {
    targets: [stage, sprite],
    monitors: [],
    extensions: [],
    meta: { semver: "3.0.0", vm: KODY_VM_VERSION, agent: "" },
  };
  return { model, assets, warnings: [] };
}
