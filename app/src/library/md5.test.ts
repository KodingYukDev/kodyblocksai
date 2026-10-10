import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { MD5EXT_RE, md5, md5Text } from "./md5";

const ref = (b: Uint8Array): string => createHash("md5").update(b).digest("hex");

describe("md5", () => {
  it("cocok dengan vektor RFC 1321", () => {
    expect(md5Text("")).toBe("d41d8cd98f00b204e9800998ecf8427e");
    expect(md5Text("abc")).toBe("900150983cd24fb0d6963f7d28e17f72");
    expect(md5Text("message digest")).toBe("f96b697d7cb7938d525a2f31aaf161d0");
  });

  it("cocok dengan node:crypto untuk berbagai panjang (batas blok 55/56/64)", () => {
    for (const n of [1, 55, 56, 63, 64, 65, 127, 128, 1000, 70001]) {
      const b = new Uint8Array(n);
      for (let i = 0; i < n; i++) b[i] = (i * 31 + 7) & 0xff;
      expect(md5(b)).toBe(ref(b));
    }
  });

  it("MD5EXT_RE menolak path aneh", () => {
    expect(MD5EXT_RE.test("d41d8cd98f00b204e9800998ecf8427e.svg")).toBe(true);
    expect(MD5EXT_RE.test("../d41d8cd98f00b204e9800998ecf8427e.svg")).toBe(false);
    expect(MD5EXT_RE.test("d41d8cd98f00b204e9800998ecf8427e.html")).toBe(false);
  });
});
