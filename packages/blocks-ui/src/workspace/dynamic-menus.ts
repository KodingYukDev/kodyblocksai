/**
 * Menu dropdown dinamis yang di scratch-gui diisi dari VM (src/lib/blocks.js): sprite, kostum,
 * latar, suara, klon, "of" (sensing_of), plus menu ekstensi dari getInfo().menus.
 * Opsi = [teks, nilai]. Nilai khusus (_mouse_, _random_, _stage_, _myself_, _edge_) sama dengan Scratch.
 */
import type { Block, IBlocksContainer, IRuntime, ITarget } from "@kody/engine";
import type { Locale } from "./i18n";
import { compareStrings } from "./variables";

export type Option = [string, string];

const T: Record<string, { en: string; id: string }> = {
  random: { en: "random position", id: "posisi acak" },
  mouse: { en: "mouse-pointer", id: "penunjuk-tetikus" },
  edge: { en: "edge", id: "tepi" },
  stage: { en: "Stage", id: "Panggung" },
  myself: { en: "myself", id: "diriku" },
  record: { en: "record...", id: "rekam..." },
  next: { en: "next backdrop", id: "latar berikutnya" },
  previous: { en: "previous backdrop", id: "latar sebelumnya" },
  randomBackdrop: { en: "random backdrop", id: "latar acak" },
  "backdrop #": { en: "backdrop #", id: "latar #" },
  "backdrop name": { en: "backdrop name", id: "nama latar" },
  volume: { en: "volume", id: "volume" },
  "x position": { en: "x position", id: "posisi x" },
  "y position": { en: "y position", id: "posisi y" },
  direction: { en: "direction", id: "arah" },
  "costume #": { en: "costume #", id: "kostum #" },
  "costume name": { en: "costume name", id: "nama kostum" },
  size: { en: "size", id: "ukuran" },
};

function t(locale: Locale, key: string): string {
  return T[key]?.[locale] ?? key;
}

export interface MenuContext {
  runtime: IRuntime;
  target: ITarget | null;
  locale: Locale;
  /** Container tempat blok berada (workspace target atau flyout). */
  container: IBlocksContainer | null;
  getBlock(id: string): Block | undefined;
}

function spriteMenu(ctx: MenuContext): Option[] {
  const out: Option[] = [];
  for (const target of ctx.runtime.targets) {
    if (!target.isOriginal || target.isStage || target === ctx.target) continue;
    out.push([target.sprite.name, target.sprite.name]);
  }
  return out;
}

function costumes(target: ITarget | null | undefined): Option[] {
  const list = target?.getCostumes() ?? [];
  return list.length ? list.map((c) => [c.name, c.name] as Option) : [["", ""]];
}

function sensingOfProperty(ctx: MenuContext, block: Block): Option[] {
  const L = ctx.locale;
  const stageOptions: Option[] = (["backdrop #", "backdrop name", "volume"] as const).map((k) => [t(L, k), k]);
  const spriteOptions: Option[] = (["x position", "y position", "direction", "costume #", "costume name", "size", "volume"] as const).map(
    (k) => [t(L, k), k],
  );
  const stage = ctx.runtime.getTargetForStage();
  const stageVars = (stage?.getAllVariableNamesInScopeByType("") ?? []).slice().sort(compareStrings).map((n) => [n, n] as Option);
  const objectInput = block.inputs.OBJECT;
  if (!objectInput || objectInput.shadow !== objectInput.block) return stageOptions.concat(stageVars);
  const menu = objectInput.shadow ? ctx.getBlock(objectInput.shadow) : undefined;
  const selected = String(menu?.fields.OBJECT?.value ?? "_stage_");
  if (selected === "_stage_") return stageOptions.concat(stageVars);
  const target = ctx.runtime.getSpriteTargetByName(selected);
  const vars = (target?.getAllVariableNamesInScopeByType("", true) ?? []).slice().sort(compareStrings).map((n) => [n, n] as Option);
  return spriteOptions.concat(vars);
}

/** Opsi dropdown dinamis untuk opcode + field. Mengembalikan null kalau bukan menu dinamis yang dikenal. */
export function dynamicMenuOptions(ctx: MenuContext, block: Block, fieldName: string): Option[] | null {
  const L = ctx.locale;
  const stage = ctx.runtime.getTargetForStage();
  switch (`${block.opcode}.${fieldName}`) {
    case "sound_sounds_menu.SOUND_MENU": {
      const sounds = ctx.target?.getSounds() ?? [];
      return sounds.length ? sounds.map((s) => [s.name, s.name] as Option) : [["", ""]];
    }
    case "looks_costume.COSTUME":
      return costumes(ctx.target);
    case "looks_backdrops.BACKDROP": {
      const list = costumes(stage);
      if (list.length === 1 && list[0]?.[1] === "") return list;
      const extra: Option[] = [
        [t(L, "next"), "next backdrop"],
        [t(L, "previous"), "previous backdrop"],
        [t(L, "randomBackdrop"), "random backdrop"],
      ];
      return list.concat(extra);
    }
    case "event_whenbackdropswitchesto.BACKDROP":
      return costumes(stage);
    case "motion_pointtowards_menu.TOWARDS":
      return [[t(L, "mouse"), "_mouse_"] as Option].concat(spriteMenu(ctx));
    case "motion_goto_menu.TO":
    case "motion_glideto_menu.TO":
      return ([[t(L, "random"), "_random_"], [t(L, "mouse"), "_mouse_"]] as Option[]).concat(spriteMenu(ctx));
    case "sensing_of_object_menu.OBJECT":
      return [[t(L, "stage"), "_stage_"] as Option].concat(spriteMenu(ctx));
    case "sensing_of.PROPERTY":
      return sensingOfProperty(ctx, block);
    case "sensing_distancetomenu.DISTANCETOMENU":
      return [[t(L, "mouse"), "_mouse_"] as Option].concat(spriteMenu(ctx));
    case "sensing_touchingobjectmenu.TOUCHINGOBJECTMENU":
      return ([[t(L, "mouse"), "_mouse_"], [t(L, "edge"), "_edge_"]] as Option[]).concat(spriteMenu(ctx));
    case "control_create_clone_of_menu.CLONE_OPTION": {
      if (ctx.target?.isStage) {
        const menu = spriteMenu(ctx);
        return menu.length ? menu : [["", ""]];
      }
      return [[t(L, "myself"), "_myself_"] as Option].concat(spriteMenu(ctx));
    }
    default:
      return extensionMenu(ctx, block.opcode, fieldName);
  }
}

/** Menu ekstensi: shadow `${ext}_menu_${menu}` dengan field bernama sama dengan menu. */
function extensionMenu(ctx: MenuContext, opcode: string, fieldName: string): Option[] | null {
  const m = /^([A-Za-z0-9]+)_menu_(.+)$/.exec(opcode);
  if (!m) return null;
  const [, extId, menuName] = m;
  if (!extId || !menuName || menuName !== fieldName) return null;
  const info = ctx.runtime.getExtensionInfo(extId);
  const menu = info?.menus?.[menuName];
  if (!menu || typeof menu.items === "string") return null;
  return menu.items.map((it) => (typeof it === "string" ? ([it, it] as Option) : ([it.text, it.value] as Option)));
}

/** Teks tampilan untuk nilai field dropdown (label opsi yang cocok, atau nilai mentah). */
export function optionLabel(options: readonly Option[] | null, value: string): string {
  const hit = options?.find((o) => o[1] === value);
  return hit ? hit[0] : value;
}
