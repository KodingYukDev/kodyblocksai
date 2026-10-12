import { describe, expect, it } from "vitest";
import { pickRecorderMime } from "./recorder";
import { SOUND_ACCEPT, classifySoundFile, sniffSound } from "./sound-media";

describe("unggah suara (termasuk rekaman iPad)", () => {
  it("wav/mp3 disimpan apa adanya; m4a/aac/ogg/webm dikonversi ke WAV", () => {
    expect(classifySoundFile("a.wav", "audio/wav")).toBe("wav");
    expect(classifySoundFile("a.mp3", "audio/mpeg")).toBe("mp3");
    expect(classifySoundFile("Rekaman Baru.m4a", "audio/x-m4a")).toBe("convert");
    expect(classifySoundFile("memo.m4a", "")).toBe("convert");
    expect(classifySoundFile("suara.aac", "audio/aac")).toBe("convert");
    expect(classifySoundFile("x.ogg", "audio/ogg; codecs=opus")).toBe("convert");
    expect(classifySoundFile("rekaman", "audio/webm;codecs=opus")).toBe("convert");
    expect(classifySoundFile("a.txt", "text/plain")).toBeNull();
    expect(SOUND_ACCEPT).toContain("audio/*");
    expect(SOUND_ACCEPT).toContain(".m4a");
  });

  it("mengenali isi file dari tanda tangan byte", () => {
    expect(sniffSound(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0]))).toBe("wav");
    expect(sniffSound(new Uint8Array([0x49, 0x44, 0x33, 4]))).toBe("mp3");
    expect(sniffSound(new Uint8Array([0xff, 0xfb, 0x90, 0]))).toBe("mp3");
    // AAC ADTS (0xFFF1) bukan mp3
    expect(sniffSound(new Uint8Array([0xff, 0xf1, 0x50, 0x80]))).toBe("other");
    // m4a: ....ftyp
    expect(sniffSound(new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70]))).toBe("other");
    expect(sniffSound(new Uint8Array([1]))).toBeNull();
  });

  it("MediaRecorder: Safari/iPad memakai audio/mp4, Chrome webm, sisanya default browser", () => {
    const safari = new Set(["audio/mp4", "audio/mp4;codecs=mp4a.40.2"]);
    expect(pickRecorderMime((m) => safari.has(m))).toBe("audio/mp4;codecs=mp4a.40.2");
    expect(pickRecorderMime((m) => m.startsWith("audio/webm"))).toBe("audio/webm;codecs=opus");
    expect(pickRecorderMime(() => false)).toBe("");
    expect(
      pickRecorderMime(() => {
        throw new Error("tidak didukung");
      }),
    ).toBe("");
  });
});
