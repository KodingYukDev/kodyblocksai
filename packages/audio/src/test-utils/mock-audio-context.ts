/**
 * AudioContext tiruan untuk tes node (hanya dipakai *.test.ts). Mencatat sambungan node dan
 * pemanggilan AudioParam agar graf & penjadwalan bisa diperiksa.
 */

export class MockParam {
  value: number;
  readonly calls: { method: string; args: number[] }[] = [];
  constructor(initial: number) {
    this.value = initial;
  }
  setValueAtTime(v: number, t: number): this {
    this.calls.push({ method: "setValueAtTime", args: [v, t] });
    this.value = v;
    return this;
  }
  linearRampToValueAtTime(v: number, t: number): this {
    this.calls.push({ method: "linearRampToValueAtTime", args: [v, t] });
    this.value = v;
    return this;
  }
  setTargetAtTime(v: number, t: number, c: number): this {
    this.calls.push({ method: "setTargetAtTime", args: [v, t, c] });
    this.value = v;
    return this;
  }
  last(): { method: string; args: number[] } | undefined {
    return this.calls[this.calls.length - 1];
  }
}

export class MockNode {
  readonly connections = new Set<MockNode>();
  constructor(
    readonly ctx: MockAudioContext,
    readonly kind: string,
  ) {
    ctx.nodes.push(this);
  }
  connect(dest: MockNode): MockNode {
    this.connections.add(dest);
    return dest;
  }
  disconnect(): void {
    this.connections.clear();
  }
}

export class MockGain extends MockNode {
  readonly gain = new MockParam(1);
  constructor(ctx: MockAudioContext) {
    super(ctx, "gain");
  }
}

export class MockSource extends MockNode {
  buffer: unknown = null;
  readonly playbackRate = new MockParam(1);
  started = false;
  stoppedAt: number | null = null;
  private readonly listeners = new Set<() => void>();
  constructor(ctx: MockAudioContext) {
    super(ctx, "source");
  }
  addEventListener(_type: string, fn: () => void): void {
    this.listeners.add(fn);
  }
  removeEventListener(_type: string, fn: () => void): void {
    this.listeners.delete(fn);
  }
  start(): void {
    if (this.started) throw new Error("InvalidStateError: start dua kali");
    this.started = true;
  }
  stop(when = this.ctx.currentTime): void {
    if (this.stoppedAt !== null) throw new Error("InvalidStateError: stop dua kali");
    this.stoppedAt = when;
  }
  /** Simulasikan event "ended" dari browser. */
  fireEnded(): void {
    for (const fn of [...this.listeners]) fn();
  }
}

export class MockBuffer {
  private readonly data: Float32Array[];
  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.data = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  get duration(): number {
    return this.length / this.sampleRate;
  }
  getChannelData(ch: number): Float32Array {
    const d = this.data[ch];
    if (!d) throw new Error("channel");
    return d;
  }
}

export class MockAnalyser extends MockNode {
  fftSize = 8;
  fill = 0;
  constructor(ctx: MockAudioContext) {
    super(ctx, "analyser");
  }
  getFloatTimeDomainData(arr: Float32Array): void {
    arr.fill(this.fill);
  }
}

export class MockAudioContext {
  currentTime = 0;
  sampleRate = 48000;
  state: "suspended" | "running" | "closed" = "suspended";
  readonly nodes: MockNode[] = [];
  readonly destination: MockNode;
  /** decodeAudioData: data dengan 4 byte awal "PCM!" dianggap valid. */
  decodeCalls = 0;

  constructor() {
    this.destination = new MockNode(this, "destination");
  }
  createGain(): MockGain {
    return new MockGain(this);
  }
  createChannelMerger(): MockNode {
    return new MockNode(this, "merger");
  }
  createBufferSource(): MockSource {
    return new MockSource(this);
  }
  createBuffer(ch: number, len: number, rate: number): MockBuffer {
    if (len < 1) throw new Error("NotSupportedError: length 0");
    return new MockBuffer(ch, len, rate);
  }
  createAnalyser(): MockAnalyser {
    return new MockAnalyser(this);
  }
  createMediaStreamSource(): MockNode {
    return new MockNode(this, "mic");
  }
  decodeAudioData(data: ArrayBuffer): Promise<MockBuffer> {
    this.decodeCalls++;
    const head = String.fromCharCode(...new Uint8Array(data.slice(0, 4)));
    if (head === "PCM!") return Promise.resolve(new MockBuffer(1, 1000, 44100));
    return Promise.reject(new Error("EncodingError"));
  }
  resume(): Promise<void> {
    this.state = "running";
    return Promise.resolve();
  }
  sources(): MockSource[] {
    return this.nodes.filter((n): n is MockSource => n instanceof MockSource);
  }
  asAudioContext(): AudioContext {
    return this as unknown as AudioContext;
  }
}

export function pcmBytes(): ArrayBuffer {
  return new Uint8Array([80, 67, 77, 33, 0, 0]).buffer;
}

/** Pembuat WAV IMA ADPCM deterministik (sama persis dengan skrip oracle scratch-audio). */
export function buildAdpcmWav(dataLen: number, seed: number): ArrayBuffer {
  let s = seed >>> 0;
  const rnd = (): number => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s >>> 24;
  };
  const blockAlign = 256;
  const list = 12;
  const total = 12 + (8 + 20) + (8 + list) + (8 + dataLen);
  const buf = new ArrayBuffer(total);
  const v = new DataView(buf);
  let p = 0;
  const str = (t: string): void => {
    for (let i = 0; i < 4; i++) v.setUint8(p++, t.charCodeAt(i));
  };
  str("RIFF");
  v.setInt32(p, total - 8, true);
  p += 4;
  str("WAVE");
  str("fmt ");
  v.setInt32(p, 20, true);
  p += 4;
  v.setUint16(p, 0x11, true);
  p += 2;
  v.setUint16(p, 1, true);
  p += 2;
  v.setUint32(p, 22050, true);
  p += 4;
  v.setUint32(p, 11100, true);
  p += 4;
  v.setUint16(p, blockAlign, true);
  p += 2;
  v.setUint16(p, 4, true);
  p += 2;
  v.setUint16(p, 2, true);
  p += 2;
  v.setUint16(p, 505, true);
  p += 2;
  str("LIST");
  v.setInt32(p, list, true);
  p += 4;
  for (let i = 0; i < list; i++) v.setUint8(p++, 65);
  str("data");
  v.setInt32(p, dataLen, true);
  p += 4;
  for (let i = 0; i < dataLen; i++) {
    const off = i % blockAlign;
    if (off === 0) {
      v.setInt16(p, ((rnd() << 8) | rnd()) - 32768, true);
      p += 2;
      i++;
      continue;
    }
    if (off === 2) {
      v.setUint8(p++, rnd() % 100);
      continue;
    }
    if (off === 3) {
      v.setUint8(p++, 0);
      continue;
    }
    v.setUint8(p++, rnd());
  }
  return buf;
}
