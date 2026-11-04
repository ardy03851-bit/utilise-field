/* wind.js — a global living wind field.
   Wind = base direction/strength + layered noise gusts. Everything reads from here:
   scarves, leaves, particles, bullets (a touch), clouds, water waves. */

import { makeNoise1D, clamp, lerp, damp } from './core.js';

export const Wind = {
  base: 0.35,                 // average strength (set per biome)
  dir: 1,                     // +1 or -1
  t: 0,
  gust: 0,                    // 0..1 slow global gust
  _n1: makeNoise1D(11),       // fast gust
  _n2: makeNoise1D(29),       // slow gust
  _n3: makeNoise1D(53),       // spatial variation
  set(biome) { this.base = biome.wind ?? .35; this.dir = Math.random() < .5 ? 1 : -1; },
  update(dt) {
    this.t += dt;
    const g1 = (this._n1(this.t * .55) + 1) * .5;
    const g2 = (this._n2(this.t * .13) + 1) * .5;
    this.gust = damp(this.gust, clamp(g1 * .65 + g2 * .35, 0, 1), 2, dt);
  },
  /* Wind vector at world position. Stronger higher up, softer in "sheltered" dips. */
  at(x, y, out) {
    const spatial = (this._n3(x * .04 + this.t * .1) + 1) * .5;   // varies along the map
    const h = clamp((y + 2) / 14, .25, 1);                        // wind is stronger higher
    const s = this.base * (0.55 + this.gust * .9) * (0.6 + spatial * .5) * h;
    out.x = s * this.dir; out.y = s * .12 * this._n1(this.t * .8 + x * .05); out.z = 0;
    return out;
  },
  /* Convenience scalar for shaders / leaf sway (0..~1.5). */
  sway(x, y) { const v = this.at(x, y, _tmp); return Math.abs(v.x) + this.gust * .3; }
};
const _tmp = { x: 0, y: 0, z: 0 };
