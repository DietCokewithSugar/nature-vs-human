/**
 * Tiny synthesised sound effects. No audio files, so nothing to license or download.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;
  private lastClick = 0;

  private ensure(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.32;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0, slideTo?: number): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, gain: number, freq = 1200): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(filter).connect(g).connect(this.master);
    src.start();
  }

  click(): void {
    const now = performance.now();
    if (now - this.lastClick < 35) return;
    this.lastClick = now;
    this.noise(0.07, 0.5, 900 + Math.random() * 500);
    this.tone(180 + Math.random() * 40, 0.08, 'triangle', 0.25, 0, 90);
  }

  buy(): void {
    this.tone(660, 0.07, 'square', 0.06);
    this.tone(990, 0.12, 'square', 0.05, 0.05);
  }

  upgrade(): void {
    [523, 659, 784].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.16, i * 0.05));
  }

  surge(): void {
    this.noise(0.9, 0.35, 420);
    this.tone(110, 0.8, 'sine', 0.25, 0, 220);
  }

  era(): void {
    [392, 523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.28, 'triangle', 0.16, i * 0.09));
  }

  evolve(): void {
    [262, 330, 392, 523, 659, 784].forEach((f, i) => this.tone(f, 0.5, 'sine', 0.14, i * 0.07));
  }

  deny(): void {
    this.tone(160, 0.12, 'square', 0.06, 0, 120);
  }
}
