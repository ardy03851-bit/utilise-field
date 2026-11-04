/* audio.js — a tiny procedural sound kit (WebAudio, no files).
   Soft, game-y blips tuned to the pastel vibe: gentle shots, muffled thuds,
   sparkly UI clicks, whooshy jumps. Everything is synthesised — no downloads. */

export const Audio = {
  ctx: null, master: null, muted: false, _noiseBuf: null,

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = .5;
    this.master.connect(this.ctx.destination);
    // noise buffer for thuds/explosions
    const len = this.ctx.sampleRate * 1;
    this._noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this._noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  },
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : .5; },

  _tone(freq, dur, type = 'sine', vol = .2, slide = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + .02);
  },
  _noise(dur, vol = .2, freq = 800, q = 1) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource(); s.buffer = this._noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t); s.stop(t + dur);
  },

  click() { this._tone(720, .07, 'triangle', .12, 180); },
  shoot(def) {
    const f = def?.pitch ?? 500;
    this._tone(f, .1, 'square', .05, -f * .5);
    this._noise(.08, .1, 2200);
  },
  dig() { this._noise(.16, .22, 500); this._tone(160, .1, 'triangle', .12, -60); },
  thud() { this._noise(.09, .16, 700); },
  boom() {
    this._noise(.5, .4, 300);
    this._tone(90, .4, 'sine', .3, -55);
  },
  hit(kill = false) {
    this._tone(kill ? 300 : 420, .12, 'triangle', .18, kill ? -160 : -80);
    if (kill) this._tone(520, .18, 'sine', .1, 200);
  },
  hurt() { this._tone(220, .18, 'sawtooth', .12, -90); },
  jump() { this._tone(300, .16, 'sine', .1, 220); },
  splash() { this._noise(.3, .15, 1400, 2); },
  win() { [523, 659, 784].forEach((f, i) => setTimeout(() => this._tone(f, .22, 'triangle', .16), i * 110)); },
  gameover() { [392, 330, 262].forEach((f, i) => setTimeout(() => this._tone(f, .3, 'sine', .16), i * 160)); },
};
