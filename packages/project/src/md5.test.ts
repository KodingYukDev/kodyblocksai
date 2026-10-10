import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { md5Hex, md5String } from "./md5";

describe("md5", () => {
  it("cocok dengan vektor RFC 1321", () => {
    expect(md5String("")).toBe("d41d8cd98f00b204e9800998ecf8427e");
    expect(md5String("a")).toBe("0cc175b9c0f1b6a831c399e269772661");
    expect(md5String("abc")).toBe("900150983cd24fb0d6963f7d28e17f72");
    expect(md5String("message digest")).toBe("f96b697d7cb7938d525a2f31aaf161d0");
    expect(md5String("abcdefghijklmnopqrstuvwxyz")).toBe("c3fcd3d76192e4007dfb496cca67e13b");
    expect(md5String("1234567890".repeat(8))).toBe("57edf4a22be3c955ac49da2e2107b67a");
  });

  it("sama dengan node:crypto untuk semua panjang 0..300 dan blok besar", () => {
    let seed = 7;
    const rand = (): number => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) & 0xff;
    for (let len = 0; len <= 300; len++) {
      const data = new Uint8Array(len).map(rand);
      expect(md5Hex(data)).toBe(createHash("md5").update(data).digest("hex"));
    }
    const big = new Uint8Array(1_000_003).map(rand);
    expect(md5Hex(big)).toBe(createHash("md5").update(big).digest("hex"));
  });

  it("menghormati byteOffset subarray", () => {
    const buf = new Uint8Array([1, 2, 3, 4, 5, 6]);
    expect(md5Hex(buf.subarray(2, 5))).toBe(createHash("md5").update(Buffer.from([3, 4, 5])).digest("hex"));
  });
});
