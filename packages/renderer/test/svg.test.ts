// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { fixupSvgString, isSafeHref, loadSvgString, measureFromText, sanitizeCss } from "../src/skins/svg-loader";
import { KodyRenderer } from "../src/renderer-core";

describe("pemuat SVG costume", () => {
  it("menambah xmlns dan membuang svg: prefix", () => {
    const out = fixupSvgString('<svg:svg width="10"><svg:rect/></svg:svg>'.replace("<svg:svg ", "<svg "));
    expect(out).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(out).not.toContain("svg:rect");
  });

  it("sanitasi: script, handler on*, href eksternal, @import, foreignObject dibuang", () => {
    const evil = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10" onload="alert(1)">
      <script>alert(2)</script>
      <style>@import url(https://evil.example/x.css); rect { fill: url(https://evil.example/p.svg#a); }</style>
      <foreignObject><div>x</div></foreignObject>
      <image xlink:href="https://evil.example/track.png" width="5" height="5"/>
      <image href="data:image/png;base64,AAAA" width="5" height="5"/>
      <a href="javascript:alert(3)"><rect width="1" height="1"/></a>
      <rect width="10" height="10" onclick="alert(4)" fill="red"/>
    </svg>`;
    const { text, viewBox } = loadSvgString(evil);
    expect(viewBox).toEqual({ x: 0, y: 0, width: 10, height: 10 });
    expect(text).not.toMatch(/script|onload|onclick|evil\.example|foreignObject|javascript:/i);
    expect(text).toContain("data:image/png;base64,AAAA");
    expect(text).toContain('fill="red"');
    expect(text).toContain("image-rendering: pixelated");
  });

  it("bukan SVG ditolak", () => {
    expect(() => loadSvgString("<html><body/></html>")).toThrow();
  });

  it("tanpa viewBox: width/height dipakai sebagai viewBox", () => {
    const { text, viewBox } = loadSvgString('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><rect width="40" height="30"/></svg>');
    expect(viewBox.width).toBe(40);
    expect(viewBox.height).toBe(30);
    expect(text).toContain('viewBox="0 0 40 30"');
  });

  it("helper keamanan", () => {
    expect(isSafeHref("#grad")).toBe(true);
    expect(isSafeHref(" data:image/svg+xml;base64,AA")).toBe(true);
    expect(isSafeHref("data:text/html,<script>")).toBe(false);
    expect(isSafeHref("http://x")).toBe(false);
    expect(sanitizeCss("a{background:url('http://x/y.png')} @import 'z.css';")).toBe("a{background:none} ");
    expect(measureFromText('<svg viewBox="-5 2 20,10">')).toEqual({ x: -5, y: 2, width: 20, height: 10 });
  });

  it("SVGSkin: ukuran tersedia langsung setelah dibuat, pusat dikompensasi offset viewBox", () => {
    const r = new KodyRenderer();
    const skin = r.createSVGSkin('<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 20 64 32"><rect width="64" height="32"/></svg>', [42, 36]);
    expect(r.getSkinSize(skin)).toEqual([64, 32]);
    expect(r.getSkinRotationCenter(skin)).toEqual([32, 16]);
    const bad = r.createSVGSkin("bukan svg");
    expect(r.getSkinSize(bad)).toEqual([0, 0]);
  });
});
