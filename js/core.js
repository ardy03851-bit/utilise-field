/* core.js — tiny toolbox shared by everything: math, colour, RNG, easing. */

export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = t => t * t * (3 - 2 * t);
export const easeOutBack = t => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
export const easeInOutCubic = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/* Seeded RNG (mulberry32) so worlds are reproducible per seed. */
export function makeRNG(seed = 1337) {
  let a = seed >>> 0;
  const f = function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  f.pick = arr => arr[Math.floor(f() * arr.length)];
  f.range = (a, b) => a + f() * (b - a);
  return f;
}

/* 1-D smooth value noise (used by wind gusts, cloud drift, tree sway). */
export function makeNoise1D(seed = 7) {
  const rng = makeRNG(seed), g = new Float32Array(256);
  for (let i = 0; i < 256; i++) g[i] = rng() * 2 - 1;
  return t => {
    const x = t * .7, i = Math.floor(x) & 255, f = x - Math.floor(x);
    const u = smooth(f);
    return g[i] * (1 - u) + g[(i + 1) & 255] * u;
  };
}

/* ---------- colour helpers (hex strings in, THREE-friendly out) ---------- */
export function hex2rgb(h) { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
export function rgb2hex([r, g, b]) { return '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join(''); }
export function mix(a, b, t) { const A = hex2rgb(a), B = hex2rgb(b); return rgb2hex([0, 1, 2].map(i => A[i] + (B[i] - A[i]) * t)); }
export function lit(hex, k) { const [r, g, b] = hex2rgb(hex); const f = v => clamp(v + 255 * k, 0, 255); return rgb2hex([f(r), f(g), f(b)]); }
export function shade(hex, k) { const [r, g, b] = hex2rgb(hex); return rgb2hex([r * k, g * k, b * k]); }
export function jitterHex(hex, rng, k = .06) { const [r, g, b] = hex2rgb(hex); return rgb2hex([r + (rng() - .5) * 255 * k, g + (rng() - .5) * 255 * k, b + (rng() - .5) * 255 * k]); }
/* CSS-style linear gradient string from an array of hex stops. */
export function cssGradient(stops, vertical = true) {
  return `linear-gradient(${vertical ? 'to bottom' : 'to right'}, ${stops.join(',')})`;
}

/* ---------- misc ---------- */
export const TAU = Math.PI * 2;
export function damp(cur, target, lambda, dt) { return lerp(cur, target, 1 - Math.exp(-lambda * dt)); }
export function randSign(rng) { return rng() < .5 ? -1 : 1; }
export function fmtTime(s) { const m = Math.floor(s / 60); return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`; }

/* Global content registries (filled by biomes/, weapons/ folders at boot). */
export const BIOMES = [];            // biome definitions
export const WEAPONS = [];           // weapon definitions
export const biomeById = id => BIOMES.find(b => b.id === id);
export const weaponById = id => WEAPONS.find(w => w.id === id);
