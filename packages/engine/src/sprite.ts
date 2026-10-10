/**
 * Sprite (padanan scratch-vm 4.8.102 sprites/sprite.js, BSD-3-Clause; lihat THIRD_PARTY.md):
 * data bersama sprite asli + semua clone (costume, sound, blok). Pemilik: agent engine-core.
 */
import { BlocksContainer } from "./blocks-container";
import { StageLayering } from "./stage-layering";
import { RenderedTarget, type CloneableSprite } from "./target";
import type { Block } from "./types/project-model";
import type { DrawableGroup } from "./types/renderer";
import type { IBlocksContainer, IRuntime } from "./types/runtime";
import type { Costume, ITarget, Sound } from "./types/target";
import { newBlockIds, StringUtil } from "./util/string-util";

interface RuntimeHooks {
  fireTargetWasCreated?(target: ITarget, source: ITarget | null): void;
  fireTargetWasRemoved?(target: ITarget): void;
  mediaLoader?: import("./types/target").IMediaLoader | null;
}

export class Sprite implements CloneableSprite {
  readonly runtime: IRuntime;
  blocks: IBlocksContainer;
  name = "";
  sounds: Sound[] = [];
  clones: ITarget[] = [];
  private costumes_: Costume[] = [];

  constructor(blocks: IBlocksContainer | null | undefined, runtime: IRuntime) {
    this.runtime = runtime;
    this.blocks = blocks ?? new BlocksContainer(runtime);
  }

  /** Setter memakai addCostumeAt agar nama costume unik (sprite.js). */
  set costumes(costumes: Costume[]) {
    this.costumes_ = [];
    for (const costume of costumes) this.addCostumeAt(costume, this.costumes_.length);
  }
  get costumes(): Costume[] {
    return this.costumes_;
  }

  addCostumeAt(costume: Costume, index: number): void {
    if (!costume.name) costume.name = "";
    const used = this.costumes_.map((c) => c.name);
    costume.name = StringUtil.unusedName(costume.name, used);
    this.costumes_.splice(index, 0, costume);
  }

  deleteCostumeAt(index: number): Costume | null {
    return this.costumes_.splice(index, 1)[0] ?? null;
  }

  /** Nama sound dibuat unik (RenderedTarget.addSound). */
  addSound(sound: Sound, index?: number): void {
    const used = this.sounds.map((s) => s.name);
    sound.name = StringUtil.unusedName(sound.name, used);
    if (typeof index === "number" && !isNaN(index)) this.sounds.splice(index, 0, sound);
    else this.sounds.push(sound);
  }

  deleteSoundAt(index: number): Sound | null {
    return this.sounds.splice(index, 1)[0] ?? null;
  }

  /** Clone pertama = target asli (drawable dibuat di sini); clone berikutnya dibuat via makeClone. */
  createClone(optLayerGroup?: DrawableGroup, id?: string): RenderedTarget {
    const clone = new RenderedTarget(this, this.runtime, id);
    clone.isOriginal = this.clones.length === 0;
    this.clones.push(clone);
    const hooks = this.runtime as IRuntime & RuntimeHooks;
    if (clone.isOriginal) {
      clone.initDrawable(optLayerGroup ?? StageLayering.SPRITE_LAYER);
      hooks.fireTargetWasCreated?.(clone, null);
    } else {
      hooks.fireTargetWasCreated?.(clone, this.clones[0] ?? null);
    }
    return clone;
  }

  removeClone(clone: ITarget): void {
    (this.runtime as IRuntime & RuntimeHooks).fireTargetWasRemoved?.(clone);
    const i = this.clones.indexOf(clone);
    if (i >= 0) this.clones.splice(i, 1);
  }

  /** Salinan sprite dengan id blok baru dan nama unik; costume/sound dimuat ulang lewat media loader. */
  async duplicate(): Promise<Sprite> {
    const newSprite = new Sprite(null, this.runtime);
    const copied = JSON.parse(JSON.stringify(Object.values(this.blocks.toRecord()))) as Block[];
    newBlockIds(copied);
    for (const block of copied) newSprite.blocks.createBlock(block);
    newSprite.name = StringUtil.unusedName(
      this.name,
      this.runtime.targets.map((t) => t.sprite.name),
    );
    const loader = (this.runtime as IRuntime & RuntimeHooks).mediaLoader ?? null;
    const costumes = await Promise.all(
      this.costumes_.map((c) => (loader ? loader.loadCostume({ ...c }, c.asset) : Promise.resolve({ ...c }))),
    );
    newSprite.costumes = costumes.map((c, i) => ({ ...c, name: this.costumes_[i]?.name ?? c.name }));
    newSprite.sounds = await Promise.all(
      this.sounds.map((s) => (loader ? loader.loadSound({ ...s }, s.asset) : Promise.resolve({ ...s }))),
    );
    return newSprite;
  }
}

export function createSprite(runtime: IRuntime, blocks?: IBlocksContainer, name = "Sprite1"): Sprite {
  const sprite = new Sprite(blocks, runtime);
  sprite.name = name;
  return sprite;
}
