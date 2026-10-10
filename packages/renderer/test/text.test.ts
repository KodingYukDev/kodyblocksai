import { describe, expect, it } from "vitest";
import { TextWrapper, lineBreaks } from "../src/skins/text-wrap";
import { BubbleStyle, TextBubbleSkin } from "../src/skins/text-bubble-skin";

const mono = (t: string): number => Array.from(t).length * 10;

describe("pembungkus teks balon", () => {
  it("patah setelah spasi, baris dipaksa \\n", () => {
    expect(lineBreaks("ab cd\nef").map((b) => [b.position, b.required])).toEqual([
      [3, false],
      [6, true],
      [8, false],
    ]);
  });

  it("membungkus pada lebar maksimum dan memecah kata panjang per grapheme", () => {
    const w = new TextWrapper(mono);
    expect(w.wrapText(60, "halo dunia ini")).toEqual(["halo ", "dunia ", "ini"]);
    expect(w.wrapText(40, "abcdefghij")).toEqual(["abcd", "efgh", "ij"]);
    expect(w.wrapText(100, "a\n\nb")).toEqual(["a", "", "b"]);
    expect(w.wrapText(100, "")).toEqual([""]);
  });
});

describe("TextBubbleSkin (headless)", () => {
  it("ukuran = lebar teks + padding + stroke, tinggi + ekor", () => {
    const skin = new TextBubbleSkin(1);
    skin.setTextBubble("say", "hi", false);
    const [w, h] = skin.size;
    // teks pendek -> lebar minimum 50
    expect(w).toBe(BubbleStyle.MIN_WIDTH + BubbleStyle.PADDING * 2 + BubbleStyle.STROKE_WIDTH);
    expect(h).toBe(BubbleStyle.LINE_HEIGHT + BubbleStyle.PADDING * 2 + BubbleStyle.STROKE_WIDTH + BubbleStyle.TAIL_HEIGHT);
    skin.setTextBubble("think", "kalimat yang cukup panjang untuk dibungkus menjadi beberapa baris", true);
    expect(skin.wrappedLines.length).toBeGreaterThan(1);
    expect(skin.size[0]).toBeLessThanOrEqual(BubbleStyle.MAX_LINE_WIDTH + BubbleStyle.PADDING * 2 + BubbleStyle.STROKE_WIDTH);
  });
});
