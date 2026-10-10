// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  classifyCostumeFile,
  defaultBitmapRotationCenter,
  defaultSvgRotationCenter,
  extractFileName,
  frameCostumeName,
  getResizedWidthHeight,
  sanitizeSvgRegex,
  sanitizeSvgText,
  sniffImage,
  svgViewBox,
} from "./costume-upload";

describe("costume-upload", () => {
  it("extractFileName mengambil teks sebelum titik pertama", () => {
    expect(extractFileName("kucing.lucu.png")).toBe("kucing");
    expect(extractFileName("tanpa")).toBe("tanpa");
  });

  it("classify dari MIME, ekstensi, lalu isi", () => {
    expect(classifyCostumeFile("a.bin", "image/png")).toBe("png");
    expect(classifyCostumeFile("a.JPEG", "")).toBe("jpg");
    expect(classifyCostumeFile("a", "", new Uint8Array([0x47, 0x49, 0x46, 0x38]))).toBe("gif");
    expect(classifyCostumeFile("a.exe", "application/x-msdownload")).toBeNull();
    expect(sniffImage(new TextEncoder().encode('<?xml version="1.0"?><svg/>'))).toBe("svg");
  });

  it("getResizedWidthHeight = BitmapAdapter", () => {
    expect(getResizedWidthHeight(100, 50)).toEqual({ width: 200, height: 100 });
    expect(getResizedWidthHeight(480, 360)).toEqual({ width: 960, height: 720 });
    expect(getResizedWidthHeight(600, 400)).toEqual({ width: 600, height: 400 });
    expect(getResizedWidthHeight(2000, 1000)).toEqual({ width: 960, height: 480 });
    expect(getResizedWidthHeight(1000, 2000)).toEqual({ width: 360, height: 720 });
  });

  it("nama frame GIF", () => {
    expect([0, 1, 2].map((i) => frameCostumeName("anim", i))).toEqual(["anim", "anim2", "anim3"]);
  });

  it("viewBox & pusat rotasi default", () => {
    expect(svgViewBox('<svg width="100" height="50px">')).toEqual({ x: 0, y: 0, width: 100, height: 50 });
    expect(svgViewBox('<svg viewBox="-1 -1 2 2" width="9">')).toEqual({ x: -1, y: -1, width: 2, height: 2 });
    expect(defaultSvgRotationCenter('<svg viewBox="0,0,96,40">')).toEqual([48, 20]);
    expect(defaultBitmapRotationCenter(201, 100)).toEqual([100.5, 50]);
  });

  it("sanitasi DOM membuang script, on*, href eksternal", () => {
    const dirty =
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" onload="alert(1)">' +
      '<script>alert(1)</script><rect onclick="x()" width="5" height="5" style="fill:url(http://evil/x)"/>' +
      '<image xlink:href="http://evil/a.png"/><image href="data:image/png;base64,AAAA"/><use href="#a"/>' +
      "<foreignObject><div>hi</div></foreignObject></svg>";
    const clean = sanitizeSvgText(dirty);
    expect(clean).not.toMatch(/script|onload|onclick|evil|foreignObject/i);
    expect(clean).toContain("data:image/png;base64,AAAA");
    expect(clean).toContain('href="#a"');
    expect(clean).toContain("<rect");
  });

  it("sanitasi regex (fallback)", () => {
    const clean = sanitizeSvgRegex('<svg onload=alert(1)><script>bad()</script><a href="javascript:x">t</a></svg>');
    expect(clean).not.toMatch(/script|onload|javascript/i);
  });
});
