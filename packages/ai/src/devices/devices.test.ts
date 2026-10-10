import { describe, expect, it } from "vitest";
import { createFakeRuntime, fakeAudioContext, fakeCanvas, fakeMediaEnv, fakeServices, fakeVideo } from "../testing/fakes";
import { AudioListener } from "./audio-listener";
import { CAMERA_CONSTRAINTS, CameraController } from "./camera";
import { MicrophoneController } from "./microphone";

function camera(opts: { hidden?: boolean } = {}) {
  const media = fakeMediaEnv();
  const canvas = fakeCanvas();
  const cam = new CameraController({
    getUserMedia: media.getUserMedia,
    createVideo: fakeVideo,
    createCanvas: () => canvas,
    isHidden: () => opts.hidden ?? false,
  });
  const events: string[] = [];
  cam.events.on("active-change", ({ active }) => events.push(active ? "on" : "off"));
  cam.events.on("permission-result", ({ granted }) => events.push(granted ? "granted" : "denied"));
  return { cam, media, canvas, events };
}

describe("CameraController", () => {
  it("tidak meminta kamera sebelum enableVideo; video saja tanpa audio", async () => {
    const { cam, media, events } = camera();
    expect(cam.enabled).toBe(false);
    expect(cam.getFrame({ format: "canvas" })).toBeNull();
    expect(media.requests).toHaveLength(0);
    expect(await cam.enableVideo()).toBe(true);
    expect(media.requests[0]).toEqual(CAMERA_CONSTRAINTS);
    expect(media.requests[0]?.audio).toBe(false);
    expect(events).toEqual(["granted", "on"]);
  });

  it("disableVideo menghentikan semua track dan menghapus kanvas", async () => {
    const { cam, media, canvas, events } = camera();
    await cam.enableVideo();
    expect(cam.getFrame({ format: "canvas" })).toBe(canvas);
    cam.disableVideo();
    expect(media.streams[0]?.tracks.every((t) => t.stopped)).toBe(true);
    expect(cam.enabled).toBe(false);
    expect(cam.getFrame({ format: "canvas" })).toBeNull();
    expect(canvas.ops).toContain("clear");
    expect(events.at(-1)).toBe("off");
  });

  it("izin ditolak -> false tanpa melempar", async () => {
    const { cam, media, events } = camera();
    media.deny = true;
    expect(await cam.enableVideo()).toBe(false);
    expect(events).toEqual(["denied"]);
  });

  it("disable saat permintaan tertunda membatalkan dan langsung mematikan stream yang datang", async () => {
    const { cam, media } = camera();
    media.hold = true;
    const pending = cam.enableVideo();
    expect(cam.enableVideo()).toBe(pending);
    await Promise.resolve();
    cam.disableVideo();
    media.release();
    expect(await pending).toBe(false);
    expect(cam.enabled).toBe(false);
    expect(media.streams[0]?.tracks[0]?.stopped).toBe(true);
  });

  it("tidak menyala saat tab tersembunyi", async () => {
    const { cam, media } = camera({ hidden: true });
    expect(await cam.enableVideo()).toBe(false);
    expect(media.requests).toHaveLength(0);
  });

  it("frame dicerminkan secara default; tanpa cermin bila setMirrored(false)", async () => {
    const { cam, canvas } = camera();
    await cam.enableVideo();
    cam.getFrame({ format: "canvas" });
    expect(canvas.ops).toContain("scale(-1,1)");
    expect(canvas.width).toBe(480);
    canvas.ops.length = 0;
    cam.setMirrored(false);
    const img = cam.getFrame({ format: "image-data", dimensions: [100, 50] }) as ImageData;
    expect(canvas.ops).not.toContain("scale(-1,1)");
    expect(img.width).toBe(100);
  });
});

describe("MicrophoneController & AudioListener", () => {
  it("start/stop menutup track dan AudioContext; spektrum hanya saat aktif", async () => {
    const media = fakeMediaEnv();
    const ctx = fakeAudioContext(-20);
    const mic = new MicrophoneController({ getUserMedia: media.getUserMedia, createAudioContext: () => ctx, isHidden: () => false });
    expect(mic.readSpectrum()).toBeNull();
    expect(await mic.start()).toBe(true);
    expect(media.requests[0]?.video).toBe(false);
    expect(mic.readSpectrum()?.length).toBe(512);

    let ticks = 0;
    const timers = { handle: null as null | (() => void), setInterval: (fn: () => void) => (timers.handle = fn), clearInterval: () => (timers.handle = null) };
    const listener = new AudioListener(mic, () => ticks++, timers);
    listener.start();
    timers.handle?.();
    timers.handle?.();
    expect(ticks).toBe(2);
    expect(listener.window.level()).toBeCloseTo(0.8);
    mic.stop();
    timers.handle?.();
    expect(ticks).toBe(2);
    listener.stop();
    expect(listener.running).toBe(false);
    expect(media.streams[0]?.tracks[0]?.stopped).toBe(true);
    expect(ctx.closed).toBe(true);
  });
});

describe("AiServices: siklus hidup privasi", () => {
  it("stop (PROJECT_STOP_ALL), project baru, dan tab tersembunyi mematikan kamera & mic", async () => {
    const fake = createFakeRuntime();
    let hidden = false;
    let onVis: () => void = () => {};
    const { services, media } = fakeServices(fake, {}, {
      visibility: { isHidden: () => hidden, onChange: (fn) => ((onVis = fn), () => {}) },
    });
    const resets: string[] = [];
    const active: string[] = [];
    services.events.on("reset", ({ reason }) => resets.push(reason));
    services.events.on("device-active", ({ device, active: a }) => active.push(`${device}:${a}`));

    await services.ensureCamera("aiHand");
    await services.ensureMicrophone("aiAudio");
    expect(fake.runtime.ioDevices.video).toBe(services.camera);
    fake.emitter.emit("PROJECT_STOP_ALL", undefined);
    expect(media.streams.every((s) => s.tracks.every((t) => t.stopped))).toBe(true);
    expect(services.camera.enabled).toBe(false);
    expect(services.microphone.active).toBe(false);

    await services.ensureCamera("aiHand");
    fake.emitter.emit("PROJECT_LOADED", undefined);
    expect(services.camera.enabled).toBe(false);

    await services.ensureCamera("aiHand");
    hidden = true;
    onVis();
    expect(services.camera.enabled).toBe(false);
    expect(await services.ensureCamera("aiHand")).toBe(false);
    expect(resets).toEqual(["stop", "project", "hidden"]);
    expect(active).toContain("camera:true");
    expect(active.at(-1)).toBe("camera:false");
  });

  it("lapisan video mengikuti stage.videoState & transparansi, dan disembunyikan saat kamera mati", async () => {
    const fake = createFakeRuntime();
    const { services } = fakeServices(fake);
    fake.emitter.emit("RUNTIME_STEP", { threads: 0 });
    expect(fake.videoFrames).toHaveLength(0);
    await services.ensureCamera("aiFace");
    services.setVideoState("on-flipped");
    services.setVideoTransparency(150);
    expect(fake.stage.videoState).toBe("on-flipped");
    expect(fake.stage.videoTransparency).toBe(100);
    fake.emitter.emit("RUNTIME_STEP", { threads: 0 });
    expect(fake.videoFrames.at(-1)).toMatchObject({ transparency: 100, mirrored: false });
    services.setVideoState("off");
    expect(services.camera.enabled).toBe(false);
    expect(fake.videoFrames.at(-1)).toEqual({ frame: null, transparency: 0, mirrored: false });
  });

  it("dispose melepas kamera dari runtime dan menutup perangkat", async () => {
    const fake = createFakeRuntime();
    const { services, media } = fakeServices(fake);
    await services.ensureCamera("aiPose");
    services.dispose();
    expect(fake.runtime.ioDevices.video).toBeNull();
    expect(media.streams[0]?.tracks[0]?.stopped).toBe(true);
    expect(await services.ensureCamera("aiPose")).toBe(false);
  });

  it("gagal memuat model -> notice, lalu bisa dicoba lagi", async () => {
    const fake = createFakeRuntime();
    let attempts = 0;
    const { services } = fakeServices(fake, {
      hand: async () => {
        attempts++;
        throw new Error("hash SHA-256 tidak cocok");
      },
    });
    const notices: string[] = [];
    services.events.on("notice", (n) => notices.push(n.code));
    await expect(services.detector("hand")).rejects.toThrow();
    await expect(services.detector("hand")).rejects.toThrow();
    expect(attempts).toBe(2);
    expect(notices).toEqual(["model-load-failed", "model-load-failed"]);
  });
});
