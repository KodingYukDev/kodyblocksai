import { describe, expect, it } from "vitest";
import { fakeAudioContext, fakeCanvas, fakeMediaEnv, fakeVideo } from "../testing/fakes";
import { CameraController, FALLBACK_CAMERA_CONSTRAINTS, cameraConstraints } from "./camera";
import type { MediaStreamLike, VideoElementLike } from "./camera";
import { MicrophoneController } from "./microphone";

describe("kamera di tablet / iPad", () => {
  it("video diberi atribut playsinline + muted (syarat iOS Safari)", async () => {
    const media = fakeMediaEnv();
    const attrs: Record<string, string> = {};
    const video = Object.assign(fakeVideo(), { setAttribute: (k: string, v: string) => void (attrs[k] = v) }) as VideoElementLike;
    const cam = new CameraController({ getUserMedia: media.getUserMedia, createVideo: () => video, createCanvas: fakeCanvas, isHidden: () => false });
    expect(await cam.enableVideo()).toBe(true);
    expect(video.muted).toBe(true);
    expect(video.playsInline).toBe(true);
    expect(Object.keys(attrs)).toEqual(expect.arrayContaining(["playsinline", "muted"]));
  });

  it("OverconstrainedError -> dicoba sekali lagi tanpa batasan", async () => {
    const requests: MediaStreamConstraints[] = [];
    const media = fakeMediaEnv();
    const cam = new CameraController({
      getUserMedia: async (c) => {
        requests.push(c);
        if (requests.length === 1) throw Object.assign(new Error("x"), { name: "OverconstrainedError" });
        return media.getUserMedia(c);
      },
      createVideo: fakeVideo,
      createCanvas: fakeCanvas,
      isHidden: () => false,
    });
    expect(await cam.enableVideo()).toBe(true);
    expect(requests).toEqual([cameraConstraints("user"), FALLBACK_CAMERA_CONSTRAINTS]);
  });

  it("ganti kamera belakang: stream lama dihentikan, tidak dicerminkan", async () => {
    const media = fakeMediaEnv();
    const cam = new CameraController({ getUserMedia: media.getUserMedia, createVideo: fakeVideo, createCanvas: fakeCanvas, isHidden: () => false });
    // Belum menyala: hanya mengubah pilihan, tidak meminta kamera.
    expect(await cam.setFacingMode("environment")).toBe(false);
    expect(media.requests).toHaveLength(0);
    expect(cam.isMirrored).toBe(false);
    await cam.setFacingMode("user");
    await cam.enableVideo();
    expect(await cam.setFacingMode("environment")).toBe(true);
    expect(media.streams[0]?.tracks[0]?.stopped).toBe(true);
    expect(media.requests[1]).toEqual(cameraConstraints("environment"));
    expect(cam.facingMode).toBe("environment");
  });

  it("getFrameFor memakai kanvas terpisah per pemakai", async () => {
    const media = fakeMediaEnv();
    const made: ReturnType<typeof fakeCanvas>[] = [];
    const cam = new CameraController({
      getUserMedia: media.getUserMedia,
      createVideo: fakeVideo,
      createCanvas: () => {
        const c = fakeCanvas();
        made.push(c);
        return c;
      },
      isHidden: () => false,
    });
    expect(cam.getFrameFor("a")).toBeNull();
    await cam.enableVideo();
    const a = cam.getFrameFor("analysis", [480, 360]);
    const b = cam.getFrameFor("lab-preview", [224, 224]);
    expect(a).not.toBe(b);
    expect((a as unknown as { width: number }).width).toBe(480);
    cam.disableVideo();
    expect(made.every((c) => c.ops.includes("clear"))).toBe(true);
  });
});

describe("mikrofon di iOS", () => {
  it("AudioContext dibuat langsung saat start (masih dalam gestur), bukan setelah izin", async () => {
    let held: (() => void) | null = null;
    const order: string[] = [];
    const mic = new MicrophoneController({
      getUserMedia: async () => {
        order.push("getUserMedia");
        await new Promise<void>((r) => (held = r));
        return { getTracks: () => [{ stop: () => {} }] } as MediaStreamLike;
      },
      createAudioContext: () => {
        order.push("context");
        return fakeAudioContext();
      },
      isHidden: () => false,
    });
    const p = mic.start();
    expect(order).toEqual(["context", "getUserMedia"]);
    await Promise.resolve();
    (held as unknown as () => void)?.();
    expect(await p).toBe(true);
    mic.stop();
  });

  it("unlock() menyiapkan AudioContext sekali; ditolak -> context ditutup", async () => {
    const contexts: ReturnType<typeof fakeAudioContext>[] = [];
    const media = fakeMediaEnv();
    media.deny = true;
    const mic = new MicrophoneController({
      getUserMedia: media.getUserMedia,
      createAudioContext: () => {
        const c = fakeAudioContext();
        contexts.push(c);
        return c;
      },
      isHidden: () => false,
    });
    mic.unlock();
    mic.unlock();
    expect(contexts).toHaveLength(1);
    expect(await mic.start()).toBe(false);
    expect(contexts).toHaveLength(1);
    await Promise.resolve();
    expect(contexts[0]?.closed).toBe(true);
  });

  it("tanpa AudioContext sama sekali -> unsupported, tanpa melempar", async () => {
    const media = fakeMediaEnv();
    const g = globalThis as { AudioContext?: unknown; webkitAudioContext?: unknown };
    const saved = [g.AudioContext, g.webkitAudioContext];
    g.AudioContext = undefined;
    g.webkitAudioContext = undefined;
    try {
      const mic = new MicrophoneController({ getUserMedia: media.getUserMedia, isHidden: () => false });
      const reasons: string[] = [];
      mic.events.on("permission-result", (r) => reasons.push(r.reason ?? ""));
      expect(await mic.start()).toBe(false);
      expect(reasons).toEqual(["unsupported"]);
      expect(media.requests).toHaveLength(0);
    } finally {
      [g.AudioContext, g.webkitAudioContext] = saved;
    }
  });
});
