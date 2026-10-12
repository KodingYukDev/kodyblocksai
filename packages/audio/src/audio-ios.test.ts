/**
 * Perilaku iPad/iPhone Safari: AudioContext suspended sampai gesture, dan bisa suspended lagi setelah
 * app ke latar belakang. Listener gesture harus tetap bekerja setelah resume pertama.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAudioEngine } from "./audio-engine";
import { MockAudioContext } from "./test-utils/mock-audio-context";

function fakeDocument() {
  const doc = new EventTarget() as EventTarget & { visibilityState: string };
  doc.visibilityState = "visible";
  return doc;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("resume AudioContext di iOS", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("gesture membangunkan context, juga setelah context ter-suspend lagi", async () => {
    const doc = fakeDocument();
    vi.stubGlobal("document", doc);
    const ctx = new MockAudioContext();
    const engine = createAudioEngine({ context: ctx.asAudioContext(), getUserMedia: null });
    expect(ctx.state).toBe("suspended");

    doc.dispatchEvent(new Event("touchend"));
    await flush();
    expect(ctx.state).toBe("running");

    // Safari: app ke latar belakang / telepon masuk.
    ctx.state = "suspended";
    doc.dispatchEvent(new Event("pointerdown"));
    await flush();
    expect(ctx.state).toBe("running");

    ctx.state = "suspended";
    doc.dispatchEvent(new Event("visibilitychange"));
    await flush();
    expect(ctx.state).toBe("running");

    engine.dispose();
    ctx.state = "suspended";
    doc.dispatchEvent(new Event("pointerdown"));
    await flush();
    expect(ctx.state).toBe("suspended");
  });

  it("stopAllSounds tanpa target menghentikan semua pemutaran", async () => {
    const ctx = new MockAudioContext();
    const engine = createAudioEngine({ context: ctx.asAudioContext(), resumeOnGesture: false, getUserMedia: null });
    const buffer = ctx.createBuffer(1, 2205, 22050) as unknown as AudioBuffer;
    const a = engine.registerBuffer(buffer);
    const b = engine.registerBuffer(buffer);
    void engine.playSound("clone-1", a);
    void engine.playSound("sprite-2", b);
    expect(engine.isSoundPlaying("clone-1", a)).toBe(true);
    engine.stopAllSounds();
    expect(engine.isSoundPlaying("clone-1", a)).toBe(false);
    expect(engine.isSoundPlaying("sprite-2", b)).toBe(false);
  });
});
