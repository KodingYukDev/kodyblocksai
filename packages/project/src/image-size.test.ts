import { describe, expect, it } from "vitest";
import { readImageSize } from "./image-size";

const enc = (s: string) => new TextEncoder().encode(s);

describe("readImageSize", () => {
  it("SVG: width/height, viewBox, satuan px", () => {
    expect(readImageSize(enc('<?xml version="1.0"?><svg width="96" height="100"></svg>'), "svg")).toEqual({ width: 96, height: 100 });
    expect(readImageSize(enc("<svg viewBox='0 0 50.5 20'></svg>"), "svg")).toEqual({ width: 50.5, height: 20 });
    expect(readImageSize(enc('<svg width="10px" height="20px"/>'), "svg")).toEqual({ width: 10, height: 20 });
    expect(readImageSize(enc('<svg width="100%" height="100%"/>'), "svg")).toBeNull();
    expect(readImageSize(enc("bukan svg"), "svg")).toBeNull();
  });

  it("PNG, GIF, BMP, JPEG dari header", () => {
    const png = new Uint8Array(24);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    new DataView(png.buffer).setUint32(16, 640);
    new DataView(png.buffer).setUint32(20, 480);
    expect(readImageSize(png, "png")).toEqual({ width: 640, height: 480 });

    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 10, 0, 20, 0]);
    expect(readImageSize(gif, "gif")).toEqual({ width: 10, height: 20 });

    const bmp = new Uint8Array(26);
    bmp.set([0x42, 0x4d]);
    new DataView(bmp.buffer).setInt32(18, 33, true);
    new DataView(bmp.buffer).setInt32(22, -44, true);
    expect(readImageSize(bmp, "bmp")).toEqual({ width: 33, height: 44 });

    // SOI, APP0 (len 4), SOF0: len 11, precision 8, h=0x0102, w=0x0304
    const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 1, 2, 3, 4, 3, 0, 0, 0, 0]);
    expect(readImageSize(jpg, "jpg")).toEqual({ width: 0x0304, height: 0x0102 });
    expect(readImageSize(new Uint8Array([1, 2, 3]), "png")).toBeNull();
  });
});
