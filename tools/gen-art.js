/* tools/gen-art.js — draws the weapon PNGs with code (not AI).
   A coherent hand-crafted style: chunky rounded silhouettes, warm cream
   bodies, charcoal grips, copper accents, thick outline, simple two-tone
   shading + a highlight slash. Every weapon has a distinct silhouette. */

const { createCanvas, Path2D } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');

const W = 256, H = 128;
const OUT = 'C';

/* palette */
const C = {
  outline: '#3a3128',
  body: '#efe3cf', bodyDark: '#d9c8ab', bodyLight: '#fbf4e6',
  grip: '#4c4238', gripLight: '#6a5c4e',
  copper: '#c47b4a', copperDark: '#96552f', copperLight: '#e0a06b',
  steel: '#aeb8bd', steelDark: '#84919a', steelLight: '#d5dde0',
  accentA: '#e86a6a', accentB: '#5bc0eb', accentC: '#f2c14e', accentD: '#90be6d',
};

function canvas() { const c = createCanvas(W, H); return [c, c.getContext('2d')]; }

function rr(x, y, w, h, r, target) {
  target.moveTo(x + r, y);
  target.arcTo(x + w, y, x + w, y + h, r);
  target.arcTo(x + w, y + h, x, y + h, r);
  target.arcTo(x, y + h, x, y, r);
  target.arcTo(x, y, x + w, y, r);
  target.closePath();
}

/* draw a part: shape(ctx) path in [0..1] coords scaled into bbox, filled + outlined */
function part(ctx, x, y, w, h, r, fill, draw) {
  ctx.save();
  ctx.translate(x, y);
  const path = new Path2D();
  const p = (px, py, pw, ph) => { rr(px * w, py * h, pw * w, ph * h, Math.min(r, pw * w / 2, ph * h / 2), path); };
  draw(p);
  ctx.fillStyle = fill;
  ctx.fill(path);
  ctx.lineWidth = 7;
  ctx.strokeStyle = C.outline;
  ctx.stroke(path);
  ctx.restore();
}
function shape(ctx, x, y, w, h, fill, draw) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  draw(ctx, (px, py) => ctx.lineTo(x + px * w, y + py * h));
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 7; ctx.strokeStyle = C.outline; ctx.stroke();
  ctx.restore();
}

/* highlight slash */
function slash(ctx, x, y, len, color = 'rgba(255,255,255,.5)') {
  ctx.strokeStyle = color; ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y - len * .18); ctx.stroke();
}

const weapons = {

  /* ---------- pea-shooter: humble starter pistol ---------- */
  'pea-shooter': (ctx) => {
    part(ctx, 92, 52, 120, 30, 10, C.body, (p) => { p(0, 0, 1, 1); });                    // slide
    part(ctx, 92, 82, 46, 30, 10, C.grip, (p) => { p(0, 0, 1, 1); });                     // grip
    part(ctx, 196, 58, 26, 16, 6, C.steel, (p) => { p(0, 0, 1, 1); });                    // barrel tip
    part(ctx, 130, 78, 20, 14, 4, C.copper, (p) => { p(0, 0, 1, 1); });                   // trigger guard
    slash(ctx, 104, 60, 70);
    // sight
    part(ctx, 140, 42, 10, 14, 3, C.copperDark, (p) => p(0, 0, 1, 1));
  },

  /* ---------- cork-blaster: SMG with a big cork ---------- */
  'cork-blaster': (ctx) => {
    part(ctx, 70, 56, 130, 34, 12, C.body, (p) => p(0, 0, 1, 1));                        // body
    part(ctx, 60, 62, 30, 22, 8, C.steel, (p) => p(0, 0, 1, 1));                         // cork brake
    part(ctx, 198, 66, 22, 12, 5, C.steelDark, (p) => p(0, 0, 1, 1));                    // muzzle
    part(ctx, 96, 88, 34, 32, 10, C.grip, (p) => p(0, 0, 1, 1));                        // grip
    part(ctx, 150, 86, 26, 26, 8, C.gripLight, (p) => p(0, 0, 1, 1));                   // mag
    part(ctx, 88, 42, 56, 16, 6, C.copper, (p) => p(0, 0, 1, 1));                       // rail top
    // cork visible
    ctx.beginPath(); ctx.arc(56, 72, 15, 0, 7); ctx.fillStyle = '#d9a06b'; ctx.fill();
    ctx.lineWidth = 7; ctx.strokeStyle = C.outline; ctx.stroke();
    slash(ctx, 84, 62, 80);
  },

  /* ---------- boomstick: chunky shotgun ---------- */
  'boomstick': (ctx) => {
    part(ctx, 60, 46, 120, 44, 14, C.body, (p) => p(0, 0, 1, 1));                        // receiver
    part(ctx, 172, 50, 74, 16, 7, C.steel, (p) => p(0, 0, 1, 1));                       // barrel
    part(ctx, 172, 70, 74, 14, 6, C.steelDark, (p) => p(0, 0, 1, 1));                   // barrel 2
    part(ctx, 84, 88, 40, 36, 12, C.grip, (p) => p(0, 0, 1, 1));                        // stock grip
    shape(ctx, 56, 78, 34, 40, C.gripLight, (c2, l) => {                                 // shoulder stock
      c2.moveTo(56, 120); l(0.2, 0.1); l(1, 0.35); l(1, 1); c2.closePath();
    });
    part(ctx, 120, 90, 22, 16, 5, C.copper, (p) => p(0, 0, 1, 1));                     // pump
    slash(ctx, 76, 54, 60);
  },

  /* ---------- thunder-mug: heavy revolver ---------- */
  'thunder-mug': (ctx) => {
    part(ctx, 78, 44, 66, 56, 16, C.steel, (p) => p(0, 0, 1, 1));                       // cylinder
    ctx.save(); ctx.fillStyle = C.steelDark; ctx.lineWidth = 7; ctx.strokeStyle = C.outline;
    for (const cx of [96, 112, 128]) { ctx.beginPath(); ctx.arc(cx, 72, 6, 0, 7); ctx.fill(); ctx.stroke(); }
    ctx.restore();
    part(ctx, 142, 54, 78, 22, 8, C.body, (p) => p(0, 0, 1, 1));                        // barrel
    part(ctx, 210, 58, 16, 12, 5, C.copperDark, (p) => p(0, 0, 1, 1));                 // muzzle
    part(ctx, 96, 96, 40, 28, 10, C.grip, (p) => p(0, 0, 1, 1));                       // grip
    part(ctx, 108, 36, 10, 16, 3, C.copper, (p) => p(0, 0, 1, 1));                    // sight
    slash(ctx, 148, 60, 44);
  },

  /* ---------- spud-cannon: potato grenade launcher ---------- */
  'spud-cannon': (ctx) => {
    part(ctx, 76, 46, 90, 46, 18, C.copper, (p) => p(0, 0, 1, 1));                     // drum
    part(ctx, 160, 52, 76, 26, 10, C.gripLight, (p) => p(0, 0, 1, 1));                // wide barrel
    part(ctx, 224, 56, 14, 18, 6, C.copperDark, (p) => p(0, 0, 1, 1));                // muzzle ring
    part(ctx, 100, 90, 36, 34, 10, C.grip, (p) => p(0, 0, 1, 1));                     // grip
    // potato in the drum
    ctx.beginPath(); ctx.ellipse(96, 70, 22, 17, -.3, 0, 7);
    ctx.fillStyle = '#d9b98a'; ctx.fill(); ctx.lineWidth = 7; ctx.strokeStyle = C.outline; ctx.stroke();
    ctx.fillStyle = '#b98d5c'; ctx.beginPath(); ctx.arc(92, 66, 3, 0, 7); ctx.fill();
    slash(ctx, 168, 58, 40);
  },

  /* ---------- wasp-nest: minigun with stripes ---------- */
  'wasp-nest': (ctx) => {
    part(ctx, 66, 48, 150, 40, 16, C.body, (p) => p(0, 0, 1, 1));                      // housing
    // stripes
    ctx.save(); ctx.fillStyle = C.accentA;
    for (const x of [88, 128, 168, 208]) { rr(x, 48, 16, 40, 8, ctx); ctx.fill(); }
    ctx.restore();
    part(ctx, 210, 54, 34, 26, 8, C.steelDark, (p) => p(0, 0, 1, 1));                  // muzzle cluster
    part(ctx, 108, 86, 34, 34, 10, C.grip, (p) => p(0, 0, 1, 1));                     // grip
    part(ctx, 150, 90, 22, 26, 7, C.gripLight, (p) => p(0, 0, 1, 1));                 // ammo box
    part(ctx, 74, 38, 60, 14, 5, C.copper, (p) => p(0, 0, 1, 1));                     // top handle
    slash(ctx, 80, 56, 50, 'rgba(255,255,255,.35)');
  },

  /* ---------- honey-sting: long bolt sniper ---------- */
  'honey-sting': (ctx) => {
    part(ctx, 60, 58, 120, 24, 9, C.body, (p) => p(0, 0, 1, 1));                      // long body
    part(ctx, 176, 62, 74, 14, 6, C.steel, (p) => p(0, 0, 1, 1));                     // thin barrel
    part(ctx, 240, 58, 12, 20, 4, C.copperDark, (p) => p(0, 0, 1, 1));               // brake
    shape(ctx, 52, 44, 60, 46, C.gripLight, (c2, l) => {                              // shoulder stock
      c2.moveTo(52, 44); l(0.35, 0.4); l(1, 0.55); l(0.8, 1); l(0, 1); c2.closePath();
    });
    part(ctx, 120, 86, 32, 34, 10, C.grip, (p) => p(0, 0, 1, 1));                     // grip
    part(ctx, 132, 36, 26, 18, 6, C.accentC, (p) => p(0, 0, 1, 1));                  // scope
    ctx.save(); ctx.strokeStyle = C.outline; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(140, 54); ctx.lineTo(140, 86); ctx.stroke(); ctx.restore();
    slash(ctx, 72, 64, 50);
  },

  /* ---------- lily-launcher: rocket flower launcher ---------- */
  'lily-launcher': (ctx) => {
    part(ctx, 64, 50, 110, 34, 14, C.accentD, (p) => p(0, 0, 1, 1));                  // green body
    part(ctx, 168, 42, 56, 50, 12, C.accentD, (p) => p(0, 0, 1, 1));                 // big cone
    part(ctx, 216, 52, 20, 30, 8, C.copperDark, (p) => p(0, 0, 1, 1));              // muzzle
    part(ctx, 104, 82, 36, 36, 10, C.grip, (p) => p(0, 0, 1, 1));                    // grip
    part(ctx, 140, 40, 14, 16, 5, C.accentA, (p) => p(0, 0, 1, 1));                // flower sight
    // petals on the cone
    ctx.save(); ctx.fillStyle = C.accentA;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(196, 42 + i * 6, 7, 4, .4, 0, 7); ctx.fill(); }
    ctx.restore();
    slash(ctx, 80, 56, 50, 'rgba(255,255,255,.4)');
  },

  /* ---------- daisy-pop: bubble pistol ---------- */
  'daisy-pop': (ctx) => {
    part(ctx, 90, 50, 110, 32, 16, C.accentB, (p) => p(0, 0, 1, 1));                 // round body
    part(ctx, 194, 56, 30, 18, 8, C.steel, (p) => p(0, 0, 1, 1));                    // short barrel
    part(ctx, 96, 80, 40, 34, 12, C.grip, (p) => p(0, 0, 1, 1));                     // grip
    // daisy on the side
    ctx.save(); ctx.translate(140, 66);
    for (let i = 0; i < 8; i++) {
      ctx.rotate(Math.PI / 4);
      ctx.beginPath(); ctx.ellipse(14, 0, 8, 4, 0, 0, 7);
      ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = C.outline; ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(0, 0, 7, 0, 7); ctx.fillStyle = C.accentC; ctx.fill(); ctx.stroke();
    ctx.restore();
    slash(ctx, 100, 56, 40);
  },

  /* ---------- ember-wand: fire wand ---------- */
  'ember-wand': (ctx) => {
    shape(ctx, 74, 40, 150, 56, C.body, (c2, l) => {                                // tapered wand
      c2.moveTo(74, 52); l(0, .25); l(1, .35); l(1, .65); l(0, .75); c2.closePath();
    });
    ctx.beginPath(); ctx.arc(216, 68, 20, 0, 7); ctx.fillStyle = C.accentA; ctx.fill();
    ctx.lineWidth = 7; ctx.strokeStyle = C.outline; ctx.stroke();
    ctx.beginPath(); ctx.arc(216, 68, 10, 0, 7); ctx.fillStyle = C.accentC; ctx.fill();
    part(ctx, 100, 78, 34, 32, 10, C.grip, (p) => p(0, 0, 1, 1));                   // grip
    part(ctx, 120, 36, 12, 18, 4, C.copper, (p) => p(0, 0, 1, 1));                 // sight
    slash(ctx, 92, 58, 60);
  },

  /* ---------- frost-bell: ice bell gun ---------- */
  'frost-bell': (ctx) => {
    part(ctx, 84, 48, 100, 34, 14, C.accentB, (p) => p(0, 0, 1, 1));                // body
    shape(ctx, 178, 40, 52, 56, C.steelLight, (c2, l) => {                          // bell
      c2.moveTo(178, 44); l(1, 0); l(.85, 1); l(.15, 1); c2.closePath();
    });
    ctx.save(); ctx.strokeStyle = '#e8f6ff'; ctx.lineWidth = 4;
    for (const [x1, y1, x2, y2] of [[188, 56, 200, 72], [204, 50, 214, 68]]) {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    ctx.restore();
    part(ctx, 100, 80, 36, 34, 10, C.grip, (p) => p(0, 0, 1, 1));                  // grip
    slash(ctx, 96, 56, 44);
  },
};

/* write them out */
const outDir = path.join(__dirname, '..', 'weapons');
for (const [id, draw] of Object.entries(weapons)) {
  const [c, ctx] = canvas();
  draw(ctx);
  const dir = path.join(outDir, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'weapon.png'), c.toBuffer('image/png'));
  console.log('drew', id);
}
console.log('done');
