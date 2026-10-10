import { describe, expect, it } from "vitest";
import type { AiNotice, NetworkFeature } from "../types";
import { parseLanguage } from "./language";
import { SpeechRecognizer } from "./speech-recognition";
import type { SpeechRecognitionCtor, SpeechRecognitionLike } from "./speech-recognition";
import { TextToSpeech, chooseVoice } from "./tts";
import type { UtteranceLike, VoiceLike } from "./tts";

function fakeRecognition(opts: { available?: string; transcript?: string; error?: string; silent?: boolean } = {}) {
  const instances: SpeechRecognitionLike[] = [];
  class Rec implements SpeechRecognitionLike {
    lang = "";
    continuous = true;
    interimResults = true;
    maxAlternatives = 5;
    processLocally?: boolean;
    onresult: SpeechRecognitionLike["onresult"] = null;
    onerror: SpeechRecognitionLike["onerror"] = null;
    onend: SpeechRecognitionLike["onend"] = null;
    aborted = false;
    constructor() {
      instances.push(this);
    }
    start(): void {
      if (opts.silent) return;
      queueMicrotask(() => {
        if (opts.error) this.onerror?.({ error: opts.error });
        else if (opts.transcript !== undefined) this.onresult?.({ results: [[{ transcript: opts.transcript, confidence: 0.9 }]] });
        this.onend?.();
      });
    }
    stop(): void {}
    abort(): void {
      this.aborted = true;
    }
    static available = opts.available === undefined ? undefined : async () => opts.available as string;
  }
  return { ctor: Rec as unknown as SpeechRecognitionCtor, instances };
}

describe("SpeechRecognizer", () => {
  it("memakai pengenalan on-device tanpa meminta izin internet", async () => {
    const { ctor, instances } = fakeRecognition({ available: "available", transcript: "  halo kody  " });
    const asked: NetworkFeature[] = [];
    const rec = new SpeechRecognizer({ ctor, requestNetworkConsent: async (f) => (asked.push(f), true) });
    expect(await rec.recognizeOnce("id-ID")).toBe("halo kody");
    expect(asked).toEqual([]);
    expect(instances[0]?.processLocally).toBe(true);
    expect(instances[0]?.lang).toBe("id-ID");
    expect(instances[0]?.continuous).toBe(false);
  });

  it("tanpa on-device: default DITOLAK (tidak ada audio terkirim) + notice", async () => {
    const { ctor, instances } = fakeRecognition({ transcript: "rahasia" });
    const notices: AiNotice[] = [];
    const rec = new SpeechRecognizer({ ctor, notice: (n) => notices.push(n) });
    expect(await rec.recognizeOnce("id-ID")).toBe("");
    expect(instances).toHaveLength(0);
    expect(notices[0]?.code).toBe("speech-network-denied");
  });

  it("dengan persetujuan: sekali ditanya per sesi, pengguna diberi tahu", async () => {
    const { ctor } = fakeRecognition({ available: "downloadable", transcript: "maju" });
    let asks = 0;
    const notices: string[] = [];
    const rec = new SpeechRecognizer({ ctor, requestNetworkConsent: async () => (asks++, true), notice: (n) => notices.push(n.code) });
    expect(await rec.recognizeOnce("id-ID")).toBe("maju");
    expect(await rec.recognizeOnce("id-ID")).toBe("maju");
    expect(asks).toBe(1);
    expect(notices).toContain("speech-network");
    rec.resetConsent();
    await rec.recognizeOnce("id-ID");
    expect(asks).toBe(2);
  });

  it("error izin & timeout -> string kosong; cancel menghentikan", async () => {
    const denied = fakeRecognition({ available: "available", error: "not-allowed" });
    const notices: string[] = [];
    expect(await new SpeechRecognizer({ ctor: denied.ctor, notice: (n) => notices.push(n.code) }).recognizeOnce("id-ID")).toBe("");
    expect(notices).toEqual(["speech-denied"]);

    const silent = fakeRecognition({ available: "available", silent: true });
    let fire: () => void = () => {};
    let delay = 0;
    const rec = new SpeechRecognizer({ ctor: silent.ctor, setTimer: (fn, ms) => ((fire = fn), (delay = ms), 1), clearTimer: () => {} });
    const pending = rec.recognizeOnce("id-ID", 60_000);
    await new Promise((r) => setTimeout(r, 0));
    expect(delay).toBe(10_000);
    fire();
    expect(await pending).toBe("");
    expect((silent.instances[0] as unknown as { aborted: boolean }).aborted).toBe(true);

    const p2 = rec.recognizeOnce("id-ID");
    await new Promise((r) => setTimeout(r, 0));
    rec.cancel();
    expect(await p2).toBe("");
  });
});

describe("TTS", () => {
  const voices: VoiceLike[] = [
    { name: "Google Bahasa Indonesia", lang: "id-ID", localService: false },
    { name: "Damayanti", lang: "id_ID", localService: true },
    { name: "Samantha", lang: "en-US", localService: true, default: true },
    { name: "Google UK", lang: "en-GB", localService: false },
  ];

  it("chooseVoice mendahulukan suara offline, suara online hanya bila diizinkan", () => {
    expect(chooseVoice(voices, "id-ID", false)?.name).toBe("Damayanti");
    expect(chooseVoice(voices, "en-GB", false)?.name).toBe("Samantha");
    expect(chooseVoice(voices, "ja-JP", true)).toBeNull();
    expect(chooseVoice(voices.filter((v) => v.name !== "Damayanti"), "id-ID", false)).toBeNull();
    expect(chooseVoice(voices.filter((v) => v.name !== "Damayanti"), "id-ID", true)?.name).toBe("Google Bahasa Indonesia");
  });

  function synth(list: VoiceLike[]) {
    const spoken: UtteranceLike[] = [];
    return {
      spoken,
      synth: { getVoices: () => list, speak: (u: UtteranceLike) => (spoken.push(u), u.onend?.()), cancel: () => {} },
      createUtterance: (text: string): UtteranceLike => ({ text, lang: "", voice: null, rate: 1, pitch: 1, volume: 1, onend: null, onerror: null }),
    };
  }

  it("tanpa suara offline: tidak bicara kecuali disetujui", async () => {
    const remoteOnly = voices.filter((v) => !v.localService);
    const s = synth(remoteOnly);
    const notices: string[] = [];
    await new TextToSpeech({ synth: s.synth, createUtterance: s.createUtterance, notice: (n) => notices.push(n.code) }).speak("halo", "id-ID");
    expect(s.spoken).toHaveLength(0);
    expect(notices).toEqual(["tts-no-local-voice"]);
    await new TextToSpeech({ synth: s.synth, createUtterance: s.createUtterance, requestNetworkConsent: async () => true }).speak("halo", "id-ID");
    expect(s.spoken[0]?.voice?.name).toBe("Google Bahasa Indonesia");
  });

  it("memotong teks panjang, mengabaikan teks kosong, cancel me-resolve", async () => {
    const s = synth(voices);
    const tts = new TextToSpeech({ synth: s.synth, createUtterance: s.createUtterance });
    await tts.speak("a".repeat(2000), "id-ID");
    expect(s.spoken[0]?.text).toHaveLength(500);
    await tts.speak("   ", "id-ID");
    expect(s.spoken).toHaveLength(1);

    const hanging = { getVoices: () => voices, speak: () => {}, cancel: () => {} };
    const t2 = new TextToSpeech({ synth: hanging, createUtterance: s.createUtterance });
    const p = t2.speak("lama", "id-ID");
    await new Promise((r) => setTimeout(r, 0));
    t2.cancel();
    await expect(p).resolves.toBeUndefined();
  });

  it("parseLanguage menerima kode BCP-47 atau nama menu, selain itu default", () => {
    expect(parseLanguage("Jepang")).toBe("ja-JP");
    expect(parseLanguage("en-US")).toBe("en-US");
    expect(parseLanguage("x\"><img>")).toBe("id-ID");
  });
});
