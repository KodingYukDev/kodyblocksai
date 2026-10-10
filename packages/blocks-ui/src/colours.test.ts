import { describe, expect, it } from "vitest";
import { CATEGORY_COLOURS, EXTENSION_COLOURS } from "./colours";

describe("warna kategori", () => {
  it("primary persis Scratch 3", () => {
    expect({
      motion: CATEGORY_COLOURS.motion.primary,
      looks: CATEGORY_COLOURS.looks.primary,
      sound: CATEGORY_COLOURS.sounds.primary,
      events: CATEGORY_COLOURS.event.primary,
      control: CATEGORY_COLOURS.control.primary,
      sensing: CATEGORY_COLOURS.sensing.primary,
      operators: CATEGORY_COLOURS.operators.primary,
      variables: CATEGORY_COLOURS.data.primary,
      lists: CATEGORY_COLOURS.data_lists.primary,
      myBlocks: CATEGORY_COLOURS.more.primary,
      extensions: EXTENSION_COLOURS.primary,
    }).toEqual({
      motion: "#4C97FF",
      looks: "#9966FF",
      sound: "#CF63CF",
      events: "#FFBF00",
      control: "#FFAB19",
      sensing: "#5CB1D6",
      operators: "#59C059",
      variables: "#FF8C1A",
      lists: "#FF661A",
      myBlocks: "#FF6680",
      extensions: "#0FBD8C",
    });
  });
});
