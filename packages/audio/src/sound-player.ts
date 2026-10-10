/**
 * Pemutar satu sound yang berhenti tanpa klik (fade 25 ms). Port dari scratch-audio 1.0.325
 * src/SoundPlayer.js (BSD-3-Clause, (c) 2016 MIT), termasuk perilaku `take()` (player lama
 * memudar sementara player ini bisa langsung dipakai lagi) dan jendela "isStarting".
 */
import { type AudioCore, type InputProvider, VolumeEffect } from "./effects";

type PlayerEvent = "play" | "stop";

export class SoundPlayer {
  outputNode: AudioBufferSourceNode | null = null;
  /** VolumeEffect untuk fade-out saat dihentikan. */
  volumeEffect: VolumeEffect | null = null;
  target: InputProvider | null = null;
  initialized = false;
  isPlaying = false;
  /** Sampai waktu ini (detik AudioContext) sound dianggap masih "mulai". */
  startingUntil = 0;
  playbackRate = 1;
  private readonly listeners: Record<PlayerEvent, Set<() => void>> = { play: new Set(), stop: new Set() };

  constructor(
    readonly audioEngine: AudioCore,
    readonly id: string,
    readonly buffer: AudioBuffer,
  ) {}

  get isStarting(): boolean {
    return this.isPlaying && this.startingUntil > this.audioEngine.currentTime;
  }

  // --- event mini ---
  once(event: PlayerEvent, fn: () => void): void {
    const wrapped = (): void => {
      this.listeners[event].delete(wrapped);
      fn();
    };
    this.listeners[event].add(wrapped);
  }
  emit(event: PlayerEvent): void {
    for (const fn of [...this.listeners[event]]) fn();
  }

  private readonly handleEnded = (): void => {
    this.onEnded();
  };

  onEnded(): void {
    this.emit("stop");
    this.isPlaying = false;
  }

  private createSource(): void {
    if (this.outputNode !== null) {
      this.outputNode.removeEventListener("ended", this.handleEnded);
      this.outputNode.disconnect();
    }
    const node = this.audioEngine.audioContext.createBufferSource();
    node.playbackRate.value = this.playbackRate;
    node.buffer = this.buffer;
    node.addEventListener("ended", this.handleEnded);
    this.outputNode = node;
    if (this.target !== null) this.connect(this.target);
  }

  initialize(): void {
    this.initialized = true;
    this.createSource();
  }

  connect(target: InputProvider): this | undefined {
    if (target === this.volumeEffect) {
      if (this.outputNode) {
        this.outputNode.disconnect();
        this.outputNode.connect(this.volumeEffect.getInputNode());
      }
      return undefined;
    }
    this.target = target;
    if (!this.initialized || !this.outputNode) return undefined;
    if (this.volumeEffect === null) {
      this.outputNode.disconnect();
      this.outputNode.connect(target.getInputNode());
    } else {
      this.volumeEffect.connect(target);
    }
    return this;
  }

  dispose(): void {
    if (!this.initialized) return;
    this.stopImmediately();
    if (this.volumeEffect !== null) {
      this.volumeEffect.dispose();
      this.volumeEffect = null;
    }
    if (this.outputNode) {
      this.outputNode.removeEventListener("ended", this.handleEnded);
      this.outputNode.disconnect();
    }
    this.outputNode = null;
    this.target = null;
    this.initialized = false;
  }

  /**
   * Pindahkan pemutaran yang sedang berjalan ke player baru; player ini kembali ke keadaan awal.
   */
  take(): SoundPlayer {
    if (this.outputNode) this.outputNode.removeEventListener("ended", this.handleEnded);
    const taken = new SoundPlayer(this.audioEngine, this.id, this.buffer);
    taken.playbackRate = this.playbackRate;
    if (this.isPlaying) {
      taken.startingUntil = this.startingUntil;
      taken.isPlaying = this.isPlaying;
      taken.initialized = this.initialized;
      taken.outputNode = this.outputNode;
      taken.outputNode?.addEventListener("ended", taken.handleEnded);
      taken.volumeEffect = this.volumeEffect;
      if (taken.volumeEffect) taken.volumeEffect.audioPlayer = taken;
      if (this.target !== null) taken.connect(this.target);
      this.emit("stop");
      taken.emit("play");
    }
    this.outputNode = null;
    this.volumeEffect = null;
    this.initialized = false;
    this.startingUntil = 0;
    this.isPlaying = false;
    return taken;
  }

  play(): void {
    if (this.isStarting) {
      this.emit("stop");
      this.emit("play");
      return;
    }
    if (this.isPlaying) this.stop();
    if (this.initialized) this.createSource();
    else this.initialize();
    this.outputNode?.start();
    this.isPlaying = true;
    this.startingUntil = this.audioEngine.currentTime + this.audioEngine.DECAY_DURATION;
    this.emit("play");
  }

  /** Berhenti dengan fade cepat. */
  stop(): void {
    if (!this.isPlaying) return;
    const taken = this.take();
    taken.volumeEffect = new VolumeEffect(taken.audioEngine, taken, null);
    if (taken.target) taken.volumeEffect.connect(taken.target);
    void taken.finished().then(() => taken.dispose());
    taken.volumeEffect.set(0);
    const { currentTime, DECAY_DURATION: decay } = this.audioEngine;
    taken.outputNode?.stop(currentTime + decay);
  }

  stopImmediately(): void {
    if (!this.isPlaying) return;
    this.outputNode?.stop();
    this.isPlaying = false;
    this.startingUntil = 0;
    this.emit("stop");
  }

  /** Resolve saat sound berikutnya selesai atau dihentikan. */
  finished(): Promise<void> {
    return new Promise<void>((resolve) => this.once("stop", resolve));
  }

  setPlaybackRate(value: number): void {
    this.playbackRate = value;
    if (this.initialized && this.outputNode) this.outputNode.playbackRate.value = value;
  }
}
