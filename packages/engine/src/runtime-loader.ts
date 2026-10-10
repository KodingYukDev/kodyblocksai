/**
 * Memuat ProjectModel ke runtime (padanan sb3.deserialize parseScratchObject/deserializeMonitor +
 * VirtualMachine.installTargets scratch-vm 4.8.102, BSD-3-Clause; lihat THIRD_PARTY.md).
 * Pemilik: agent engine-core.
 */
import { BlocksContainer } from "./blocks-container";
import type { Runtime } from "./runtime";
import { createMonitorRecord } from "./monitors";
import { Sprite } from "./sprite";
import { StageLayering } from "./stage-layering";
import type { RenderedTarget } from "./target";
import type { BlockField, CostumeState, MonitorState, ProjectModel, SoundState, TargetState } from "./types/project-model";
import type { AssetData, Costume, IMediaLoader, Sound, Variable } from "./types/target";
import { MathUtil } from "./util/math-util";
import { StringUtil } from "./util/string-util";
import { createVariable } from "./variable";

function findAsset(
  assets: ReadonlyMap<string, Uint8Array> | undefined,
  item: { assetId: string; md5ext: string; dataFormat: string },
): AssetData | null {
  const data = assets?.get(item.md5ext) ?? assets?.get(item.assetId) ?? null;
  return data ? { assetId: item.assetId, dataFormat: item.dataFormat, data } : null;
}

async function loadCostume(media: IMediaLoader, state: CostumeState, asset: AssetData | null): Promise<Costume> {
  try {
    return await media.loadCostume({ ...state }, asset);
  } catch {
    // Costume rusak tidak boleh menggagalkan seluruh project.
    return { ...state, skinId: -1, size: [0, 0], asset };
  }
}

async function loadSound(media: IMediaLoader, state: SoundState, asset: AssetData | null): Promise<Sound> {
  try {
    return await media.loadSound({ ...state }, asset);
  } catch {
    return { ...state, soundId: "", asset };
  }
}

/** parseScratchObject: buat sprite + target asli, isi properti dari JSON (tanpa fencing). */
async function parseTarget(
  runtime: Runtime,
  state: TargetState,
  media: IMediaLoader,
  assets: ReadonlyMap<string, Uint8Array> | undefined,
): Promise<RenderedTarget> {
  const blocks = new BlocksContainer(runtime);
  const sprite = new Sprite(blocks, runtime);
  sprite.name = state.name;
  for (const blockId in state.blocks) {
    const block = state.blocks[blockId];
    if (block) blocks.createBlock(JSON.parse(JSON.stringify(block)) as typeof block);
  }
  const costumePromises = state.costumes.map((c) => loadCostume(media, c, findAsset(assets, c)));
  const soundPromises = state.sounds.map((s) => loadSound(media, s, findAsset(assets, s)));

  const target = sprite.createClone(state.isStage ? StageLayering.BACKGROUND_LAYER : StageLayering.SPRITE_LAYER, state.id);
  if (state.tempo !== undefined) target.tempo = state.tempo;
  target.volume = state.volume;
  if (state.videoTransparency !== undefined) target.videoTransparency = state.videoTransparency;
  if (state.videoState !== undefined) target.videoState = state.videoState;
  if (state.textToSpeechLanguage !== undefined) target.textToSpeechLanguage = state.textToSpeechLanguage;
  for (const varId in state.variables) {
    const v = state.variables[varId];
    if (!v) continue;
    // Variabel cloud dimuat sebagai variabel biasa.
    const variable: Variable = createVariable(varId, v.name, v.type, false);
    if (v.type === "list") variable.value = Array.isArray(v.value) ? [...v.value] : [];
    else if (v.type === "") variable.value = Array.isArray(v.value) ? String(v.value) : v.value;
    target.variables[variable.id] = variable;
  }
  for (const commentId in state.comments) {
    const c = state.comments[commentId];
    if (c) target.comments[commentId] = { ...c };
  }
  if (state.x !== undefined) target.x = state.x;
  if (state.y !== undefined) target.y = state.y;
  if (state.direction !== undefined) target.direction = MathUtil.wrapClamp(state.direction, -179, 180);
  if (state.size !== undefined) target.size = state.size;
  if (state.visible !== undefined) target.visible = state.visible;
  target.currentCostume = MathUtil.clamp(state.currentCostume, 0, state.costumes.length - 1);
  if (state.rotationStyle !== undefined) target.rotationStyle = state.rotationStyle;
  target.isStage = state.isStage;
  if (state.draggable !== undefined) target.draggable = state.draggable;
  for (const key in state.extensionState ?? {}) target.setCustomState(key, state.extensionState?.[key]);

  const [costumes, sounds] = await Promise.all([Promise.all(costumePromises), Promise.all(soundPromises)]);
  sprite.costumes = costumes;
  sprite.sounds = sounds;
  return target;
}

/** deserializeMonitor: blok monitor + MonitorRecord. */
function loadMonitor(runtime: Runtime, data: MonitorState, targets: RenderedTarget[]): void {
  let targetId: string | null = null;
  if (data.spriteName) {
    targetId = targets.find((t) => t.sprite.name === data.spriteName)?.id ?? null;
  }
  const params = { ...data.params };
  if (data.opcode === "data_listcontents") {
    const listTarget = targetId ? targets.find((t) => t.id === targetId) : targets.find((t) => t.isStage);
    const list = listTarget?.variables[data.id];
    if (list) params.LIST = list.name;
  }
  const fields: Record<string, BlockField> = {};
  for (const key in params) fields[key] = { name: key, value: params[key] ?? "" };

  const info = runtime.monitorBlockInfo[data.opcode];
  let id = data.id;
  if (data.opcode !== "data_variable" && data.opcode !== "data_listcontents" && info?.isSpriteSpecific && info.getId) {
    id = info.getId(targetId, fields);
  } else {
    id = StringUtil.replaceUnsafeChars(id);
  }

  const existing = runtime.monitorBlocks.getBlock(id);
  if (existing) {
    existing.isMonitored = data.visible;
    existing.targetId = targetId;
  } else {
    if (data.opcode === "data_variable" && fields.VARIABLE) {
      fields.VARIABLE.id = id;
      fields.VARIABLE.variableType = "";
    } else if (data.opcode === "data_listcontents" && fields.LIST) {
      fields.LIST.id = id;
      fields.LIST.variableType = "list";
    }
    runtime.monitorBlocks.createBlock({
      id,
      opcode: data.opcode,
      inputs: {},
      fields,
      topLevel: true,
      next: null,
      parent: null,
      shadow: false,
      x: 0,
      y: 0,
      isMonitored: data.visible,
      targetId,
    } as Parameters<BlocksContainer["createBlock"]>[0]);
  }
  runtime.requestAddMonitor(
    createMonitorRecord({
      id,
      opcode: data.opcode,
      spriteName: data.spriteName,
      targetId,
      params,
      value: Array.isArray(data.value) ? [...data.value] : data.value,
      width: data.width,
      height: data.height,
      x: data.x,
      y: data.y,
      visible: data.visible,
      mode: data.mode,
      sliderMin: data.sliderMin,
      sliderMax: data.sliderMax,
      isDiscrete: data.isDiscrete,
    }),
  );
}

export async function loadProjectInto(
  runtime: Runtime,
  model: ProjectModel,
  media: IMediaLoader,
  assets?: ReadonlyMap<string, Uint8Array>,
): Promise<void> {
  runtime.clear();
  // Buat drawable dalam urutan layer (belakang -> depan), lalu kembalikan ke urutan panel sprite.
  const ordered = model.targets
    .map((state, paneOrder) => ({ state, paneOrder }))
    .sort((a, b) => a.state.layerOrder - b.state.layerOrder);
  const parsed: { target: RenderedTarget; paneOrder: number }[] = [];
  for (const { state, paneOrder } of ordered) {
    parsed.push({ target: await parseTarget(runtime, state, media, assets), paneOrder });
  }
  parsed.forEach((p, layerIndex) => {
    p.target.layerOrder = layerIndex;
  });
  const targets = parsed.sort((a, b) => a.paneOrder - b.paneOrder).map((p) => p.target);

  for (const monitor of model.monitors) loadMonitor(runtime, monitor, targets);

  // installTargets
  for (const target of targets) {
    runtime.addTarget(target);
    target.updateAllDrawableProperties();
  }
  runtime.executableTargets.sort((a, b) => ((a as RenderedTarget).layerOrder ?? 0) - ((b as RenderedTarget).layerOrder ?? 0));
  for (const target of targets) delete target.layerOrder;

  const editing = targets.length > 1 ? targets[1] : targets[0];
  runtime.emit("TARGETS_UPDATE", { emitProjectChanged: false });
  runtime.setEditingTarget(editing ?? null);
  runtime.emit("PROJECT_LOADED", undefined);
}
