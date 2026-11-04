/* bullets.js — projectiles with the signature "spike trail":
   a jagged additive ribbon whose width & spikiness scale with velocity,
   so fast shots leave comet-like shard trails. Bullets collide with the
   terrain (carving small craters — the ground is destructible), props,
   characters and water (splash + ripple). */

import * as THREE from 'three';
import { clamp } from './core.js';
import { Wind } from './wind.js';

const MAX_TRAIL = 16;
const MAX_BULLETS = 80;

export class Bullet {
  constructor() { this.alive = false; }
}

export class BulletSystem {
  constructor(world, scene) {
    this.world = world; this.scene = scene;
    this.bullets = [];
    for (let i = 0; i < MAX_BULLETS; i++) this.bullets.push(new Bullet());
    // shared trail geometry: one BufferGeometry with dynamic draw range per bullet is
    // complex; instead each bullet owns a small ribbon mesh (cheap, pooled)
    this.pool = [];
    this.geo = new THREE.BufferGeometry();
    this.mesh = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: .9, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this._rebuild();
  }
  _rebuild() {
    const vCount = MAX_BULLETS * MAX_TRAIL * 2;
    const iCount = MAX_BULLETS * (MAX_TRAIL - 1) * 6;
    this.pos = new Float32Array(vCount * 3);
    this.col = new Float32Array(vCount * 3);
    const idx = new Uint32Array(iCount);
    let k = 0;
    for (let b = 0; b < MAX_BULLETS; b++)
      for (let i = 0; i < MAX_TRAIL - 1; i++) {
        const a = (b * MAX_TRAIL + i) * 2, c = a + 2;
        idx[k++] = a; idx[k++] = c; idx[k++] = a + 1;
        idx[k++] = a + 1; idx[k++] = c; idx[k++] = c + 1;
      }
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.geo.setDrawRange(0, 0);
  }

  spawn(spec) {
    const b = this.bullets.find(b => !b.alive);
    if (!b) return null;
    b.alive = true;
    b.x = spec.x; b.y = spec.y; b.vx = spec.vx; b.vy = spec.vy;
    b.dmg = spec.dmg; b.color = new THREE.Color(spec.color); b.id = spec.id;
    b.blast = spec.radius ?? 0;
    b.life = 2.2; b.owner = spec.owner ?? 'player';
    b.trail = []; b.spike = Math.random() * 9;
    return b;
  }

  update(dt, hitTerrain, hitProp, hitChar, splash) {
    const w = this.world;
    let draw = 0;
    const pos = this.pos, col = this.col;
    for (const b of this.bullets) {
      if (!b.alive) continue;
      b.life -= dt;
      // physics: slight gravity + wind
      b.vy -= 4 * dt;
      const wind = Wind.at(b.x, b.y, _w);
      b.vx += wind.x * .6 * dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      // trail record
      b.trail.unshift(b.x, b.y);
      if (b.trail.length > MAX_TRAIL * 2) b.trail.length = MAX_TRAIL * 2;
      // collisions
      const h = w.h(b.x);
      let dead = b.life <= 0 || Math.abs(b.x) > 95;
      if (!dead && b.y <= h) { hitTerrain(b, h); dead = true; }
      if (!dead && w.inWater(b.x, b.y) && w.h(b.x) < -.3) { splash(b); dead = true; }
      if (!dead && hitProp && hitProp(b)) dead = true;
      if (!dead && hitChar && hitChar(b)) dead = true;
      if (dead) { b.alive = false; continue; }
      // write ribbon
      const speed = Math.hypot(b.vx, b.vy);
      const n = b.trail.length / 2;
      const c = b.color;
      for (let i = 0; i < n; i++) {
        const tx = b.trail[i * 2], ty = b.trail[i * 2 + 1];
        const t = i / (n - 1 || 1);
        // width: wider near the bullet, spiky zig-zag along the trail
        const width = (speed * .028 + .05) * (1 - t * .6);
        const zig = (i % 2 === 0 ? 1 : .45) * width;      // alternating spikes!
        const spik = Math.sin(t * 28 + b.spike) * width * .5;
        let k = draw * 6;
        pos[k] = tx; pos[k + 1] = ty + zig + spik; pos[k + 2] = .12;
        pos[k + 3] = tx; pos[k + 4] = ty - zig - spik; pos[k + 5] = .12;
        const fade = 1 - t;
        col[k] = c.r * fade; col[k + 1] = c.g * fade; col[k + 2] = c.b * fade;
        col[k + 3] = c.r * fade; col[k + 4] = c.g * fade; col[k + 5] = c.b * fade;
        draw += 2;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.setDrawRange(0, draw);
    this.mesh.visible = draw > 0;
  }
}
const _w = { x: 0, y: 0, z: 0 };
