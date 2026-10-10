import { describe, expect, it } from "vitest";
import { validateExtensionInfo } from "@kody/engine";
import { AI_EXTENSIONS } from "./catalog";
import { AI_LIMITS, clampTextInput, isAllowedModelUrl, sanitizeLabel, validateTrainedClassifier } from "./security";

describe("keamanan AI", () => {
  it("hanya mengizinkan model same-origin di /models/", () => {
    expect(isAllowedModelUrl("/models/mediapipe/hand_landmarker.task")).toBe(true);
    expect(isAllowedModelUrl("https://cdn.example.com/models/x.task")).toBe(false);
    expect(isAllowedModelUrl("//evil.example/models/x")).toBe(false);
    expect(isAllowedModelUrl("/models/../secret")).toBe(false);
    expect(isAllowedModelUrl("/models//evil.example/x")).toBe(false);
    expect(isAllowedModelUrl("javascript:alert(1)")).toBe(false);
    expect(isAllowedModelUrl("/models/a b")).toBe(false);
  });

  it("sanitizeLabel membuang karakter kontrol & bidi lalu memotong", () => {
    expect(sanitizeLabel("  kucing\u0000‮ ")).toBe("kucing");
    expect(sanitizeLabel("x".repeat(500))).toHaveLength(AI_LIMITS.maxLabelLength);
    expect(sanitizeLabel(42)).toBe("42");
  });

  it("clampTextInput memotong teks panjang", () => {
    expect(clampTextInput("a".repeat(AI_LIMITS.maxTextInputLength + 10))).toHaveLength(AI_LIMITS.maxTextInputLength);
  });

  it("validateTrainedClassifier menolak data project yang rusak", () => {
    expect(validateTrainedClassifier({ kind: "image", version: 1, labels: ["a", "b"], payload: "{}", createdAt: 1 })).toEqual([]);
    expect(validateTrainedClassifier(null)).toEqual(["bukan objek"]);
    expect(validateTrainedClassifier({ kind: "x", version: 2, labels: ["\u0000"], payload: 1, createdAt: NaN })).toHaveLength(5);
  });

  it("katalog AI memuat ekstensi yang valid", async () => {
    expect(AI_EXTENSIONS.map((e) => e.id)).toEqual(["aiFace", "aiHand", "aiPose", "aiImage", "aiObject", "aiText", "aiAudio"]);
    for (const entry of AI_EXTENSIONS) {
      const factory = await entry.load();
      const info = factory({} as never).getInfo();
      expect(info.id).toBe(entry.id);
      expect(validateExtensionInfo(info)).toEqual([]);
    }
  });
});
