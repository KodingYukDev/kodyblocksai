/** scratch-vm engine/stage-layering.js */
import type { DrawableGroup } from "./types/renderer";

export const StageLayering = {
  BACKGROUND_LAYER: "background" as DrawableGroup,
  VIDEO_LAYER: "video" as DrawableGroup,
  PEN_LAYER: "pen" as DrawableGroup,
  SPRITE_LAYER: "sprite" as DrawableGroup,
  LAYER_GROUPS: ["background", "video", "pen", "sprite"] as readonly DrawableGroup[],
};
