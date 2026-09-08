type Bus = GainNode;

export class AudioSynth {
  private ctx: AudioContext | null = null;
  private master: Bus | null = null;
  private sfx: Bus | null = null;
  private muted = false;
  private lastShot = 0;

  unlock() {
    this.ensure();
    void this.ctx?.resume();
  }

  resume() {
    if (this.ctx?.state === "suspended") void this.ctx.resume();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.master) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.7, this.now(), 0.02);
    }
  }

  shoot() {
    const t = this.now();
    if (t - this.lastShot < 0.04) return;
    this.lastShot = t;
    this.tone(880 + Math.random() * 80, 0.06, "square", 0.05, 1400);
  }

  hit() {
    this.noise(0.08, 0.12, 900);
    this.tone(180, 0.1, "triangle", 0.08);
  }

  explode() {
    this.noise(0.22, 0.2, 600);
    this.tone(90, 0.28, "sine", 0.16);
  }

  pickup() {
    this.tone(520, 0.07, "sine", 0.08);
    this.tone(780, 0.1, "sine", 0.07, undefined, 0.06);
    this.tone(1040, 0.12, "sine", 0.06, undefined, 0.12);
  }

  wave() {
    this.tone(260, 0.18, "triangle", 0.08);
    this.tone(390, 0.22, "triangle", 0.07, undefined, 0.1);
  }

  death() {
    this.tone(220, 0.4, "sawtooth", 0.12, 80);
    this.noise(0.3, 0.12, 400);
  }

  shieldBreak() {
    this.tone(640, 0.12, "square", 0.07, 180);
  }

  private ensure() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx({ latencyHint: "interactive" });
    const master = ctx.createGain();
    const sfx = ctx.createGain();
    master.gain.value = this.muted ? 0 : 0.7;
    sfx.gain.value = 0.9;
    sfx.connect(master);
    master.connect(ctx.destination);
    this.ctx = ctx;
    this.master = master;
    this.sfx = sfx;
  }

  private now() {
    return this.ctx?.currentTime ?? 0;
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    endFreq?: number,
    delay = 0,
  ) {
    this.ensure();
    if (!this.ctx || !this.sfx) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq * (0.97 + Math.random() * 0.06), t);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.sfx);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  }

  private noise(dur: number, gain: number, cutoff: number) {
    this.ensure();
    if (!this.ctx || !this.sfx) return;
    const t = this.ctx.currentTime;
    const n = 2 * this.ctx.sampleRate * dur;
    const buffer = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.sfx);
    src.start(t);
    src.stop(t + dur + 0.02);
    src.onended = () => {
      src.disconnect();
      filter.disconnect();
      g.disconnect();
    };
  }
}
