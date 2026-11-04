/* character.js — the player & bots.
   A rounded 3D cube (no eyes, no face) with a scarf that has real physics:
   a verlet rope of points with gravity, wind, drag and terrain collision,
   rendered as a tapered ribbon facing the camera.
   The cube has subtle jelly physics: squash on landing, stretch on jumping,
   volume-preserving spring back to rest.
   Colours are fully customisable (solid or gradient) via the wardrobe. */

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { clamp, lerp, damp } from './core.js';
import { Wind } from './wind.js';

const CUBE_SIZE = 1.25;
const SCARF_SEGS = 13;
const SCARF_LEN = .3;

export class Character extends THREE.Group {
  constructor(world, opts = {}) {
    super();
    this.world = world;
    this.opts = opts;
    // ---------- body ----------
    const bodyCol = opts.body ?? '#f7e9d7';
    this.bodyMat = new THREE.MeshStandardMaterial({ color: bodyCol, roughness: .6 });
    this.body = new THREE.Mesh(new RoundedBoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE, 5, .22), this.bodyMat);
    this.body.castShadow = true; this.body.receiveShadow = true;
    this.add(this.body);
    // little feet? no — pure cube. a soft contact shadow blob handled by real shadows.
    // ---------- scarf (verlet) ----------
    const scarfStops = opts.scarf ?? ['#e86a6a', '#e86a6a'];
    this.scarfPts = [];
    for (let i = 0; i < SCARF_SEGS; i++)
      this.scarfPts.push({ x: 0, y: 0, z: 0, px: 0, py: 0, pz: 0 });
    this.scarfGeo = new THREE.BufferGeometry();
    const nVerts = SCARF_SEGS * 2;
    this.scarfGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nVerts * 3), 3));
    this.scarfGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(nVerts * 3), 3));
    this.scarfGeo.setIndex(indicesFor(SCARF_SEGS));
    this.scarfMat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: .8 });
    this.scarf = new THREE.Mesh(this.scarfGeo, this.scarfMat);
    this.scarf.castShadow = true;
    this.scarf.frustumCulled = false;
    this.add(this.scarf);
    this.setScarfGradient(scarfStops);
    // ---------- physics state ----------
    this.pos = new THREE.Vector3(opts.x ?? 0, opts.y ?? 6, 0);
    this.vel = new THREE.Vector3();
    this.onGround = false;
    this.coyote = 0;
    this.facing = 1;
    this.jellyY = 1; this.jellyV = 0;   // squash spring
    this.hp = opts.hp ?? 100; this.maxHp = 100;
    this.dead = false;
    this.deadT = 0;
    this.walkPhase = 0;
    this.invuln = 0;
  }

  setBodyColor(hex) { this.bodyMat.color.set(hex); }
  setScarfGradient(stops) {
    // bake gradient into scarf vertex colours (2 stops or more)
    const cols = stops.map(s => new THREE.Color(s));
    const colArr = this.scarfGeo.attributes.color.array;
    for (let i = 0; i < SCARF_SEGS; i++) {
      const t = i / (SCARF_SEGS - 1);
      const c = sampleGradient(cols, t);
      const w = scarfWidth(t) / 2;
      for (const side of [0, 1]) {
        const k = (i * 2 + side) * 3;
        colArr[k] = c.r; colArr[k + 1] = c.g; colArr[k + 2] = c.b;
      }
    }
    this.scarfGeo.attributes.color.needsUpdate = true;
  }

  /* scarf attach point in world space */
  scarfAnchor(out) {
    out.set(this.pos.x - this.facing * CUBE_SIZE * .42, this.pos.y + CUBE_SIZE * .34, 0);
    return out;
  }

  jump(power = 13) {
    if (this.onGround || this.coyote > 0) {
      this.vel.y = power;
      this.onGround = false; this.coyote = 0;
      this.jellyV = 6; // stretch
      return true;
    }
    return false;
  }

  hurt(dmg, kx = 0) {
    if (this.invuln > 0 || this.dead) return;
    this.hp -= dmg;
    this.invuln = .35;
    this.vel.x += kx;
    if (this.hp <= 0) this.die();
  }
  die() { this.dead = true; this.deadT = 0; }

  /* ------------------------------ update ------------------------------ */
  update(dt, input, t) {
    if (this.dead) { this.deadT += dt; return; }
    const w = this.world;
    this.invuln = Math.max(0, this.invuln - dt);

    // ----- horizontal control -----
    const accel = 60, maxSpd = 8.2, fric = 10;
    const mv = input.moveX;
    if (Math.abs(mv) > .05) {
      this.vel.x += mv * accel * dt;
      this.vel.x = clamp(this.vel.x, -maxSpd, maxSpd);
      this.facing = mv > 0 ? 1 : -1;
      this.walkPhase += dt * Math.abs(this.vel.x) * 1.6;
    } else {
      this.vel.x = damp(this.vel.x, 0, fric, dt);
    }

    // ----- gravity & water -----
    const inWater = w.inWater(this.pos.x, this.pos.y);
    const g = inWater ? 6 : 34;
    this.vel.y -= g * dt;
    if (inWater) { this.vel.y = clamp(this.vel.y, -3, 6); this.vel.x *= (1 - 2.2 * dt); }

    // ----- integrate -----
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    this.pos.x = clamp(this.pos.x, -84, 84);

    // ----- terrain collision -----
    const h = w.h(this.pos.x);
    const feet = this.pos.y - CUBE_SIZE / 2;
    if (feet <= h && this.vel.y <= 0.01) {
      if (!this.onGround && this.vel.y < -4) { this.jellyV = -Math.min(10, -this.vel.y) * 1.1; if (this.vel.y < -9) w.ripple && w.ripple(this.pos.x, .6); }
      this.pos.y = h + CUBE_SIZE / 2;
      const slope = w.slope(this.pos.x);
      this.vel.y = 0;
      this.onGround = true; this.coyote = .12;
      // slide down steep slopes a little
      if (Math.abs(slope) > .55) this.vel.x += Math.sign(slope) * 30 * dt;
    } else {
      this.onGround = false;
      this.coyote = Math.max(0, this.coyote - dt);
    }
    // ceiling-ish clamp when inside a crater wall (steep front): push out
    if (this.pos.y - CUBE_SIZE / 2 < h - .6) this.pos.y = h - .6 + CUBE_SIZE / 2;

    // ----- water interaction -----
    if (inWater) {
      if (this.vel.y < -2 && this.pos.y > w.h(this.pos.x) - 1) w.ripple(this.pos.x, 1);
    }

    // ----- jelly squash spring (volume preserving) -----
    this.jellyV += (1 - this.jellyY) * 130 * dt;
    this.jellyV *= Math.exp(-7 * dt);
    this.jellyY += this.jellyV * dt;
    const jy = clamp(this.jellyY, .55, 1.5);
    const jx = 1 / Math.sqrt(jy);

    // ----- apply visual transform -----
    this.position.copy(this.pos);
    const lean = clamp(this.vel.x * .03, -.22, .22);
    const bob = this.onGround ? Math.abs(Math.sin(this.walkPhase)) * .05 * clamp(Math.abs(this.vel.x) / 4, 0, 1) : 0;
    this.body.scale.set(jx, jy, jx);
    this.body.rotation.z = lean + Math.sin(this.walkPhase * 2) * .02;
    this.body.position.y = bob + (jy - 1) * CUBE_SIZE * .5;

    // ----- scarf physics -----
    this.updateScarf(dt, t);
  }

  updateScarf(dt, t) {
    const pts = this.scarfPts, w = this.world;
    const anchor = _anchor; this.scarfAnchor(anchor);
    // first two points pin to the anchor
    pts[0].x = anchor.x; pts[0].y = anchor.y; pts[0].z = 0;
    pts[1].x = lerp(pts[1].x, anchor.x - this.facing * .25, .5);
    pts[1].y = lerp(pts[1].y, anchor.y + .1, .5); pts[1].z = 0;
    const wind = Wind.at(this.pos.x, this.pos.y + 1, _wind);
    // verlet integrate the rest
    for (let i = 2; i < pts.length; i++) {
      const p = pts[i];
      const vx = (p.x - p.px) * .985, vy = (p.y - p.py) * .985, vz = (p.z - p.pz) * .985;
      p.px = p.x; p.py = p.y; p.pz = p.z;
      // gravity dominates so the scarf drapes; wind + movement add gentle sway
      p.x += vx + (wind.x * 12 + this.vel.x * .9) * dt * dt * 60 * .016;
      p.y += vy + (-34 + wind.y * 14) * dt * dt * 60 * .016;
      p.z += vz * .9;
    }
    // constraints (a few iterations)
    for (let it = 0; it < 4; it++) {
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        let dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        const d = Math.hypot(dx, dy, dz) || .0001;
        const diff = (d - SCARF_LEN) / d * .9;
        dx *= diff; dy *= diff; dz *= diff;
        if (i > 1) { a.x += dx * .5; a.y += dy * .5; a.z += dz * .5; }
        b.x -= dx * .5; b.y -= dy * .5; b.z -= dz * .5;
      }
      // pin
      pts[0].x = anchor.x; pts[0].y = anchor.y; pts[0].z = 0;
    }
    // terrain collision for scarf points
    for (let i = 2; i < pts.length; i++) {
      const p = pts[i], h = w.h(p.x) + .05;
      if (p.y < h) { p.y = h; p.px = p.x; p.py = h; }
    }
    // write ribbon — width perpendicular to the local segment direction so the
    // ribbon is seen face-on from the camera (looking down -Z), not edge-on
    const pos = this.scarfGeo.attributes.position.array;
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1;
      dx /= d; dy /= d;
      const wd = scarfWidth(i / (n - 1)) / 2;
      const k = i * 6;
      pos[k] = p.x - this.pos.x - dy * wd; pos[k + 1] = p.y - this.pos.y + dx * wd; pos[k + 2] = p.z;
      pos[k + 3] = p.x - this.pos.x + dy * wd; pos[k + 4] = p.y - this.pos.y - dx * wd; pos[k + 5] = p.z;
    }
    this.scarfGeo.attributes.position.needsUpdate = true;
    this.scarfGeo.computeVertexNormals();
  }
}

function scarfWidth(t) { return lerp(.4, .16, t); }
function sampleGradient(cols, t) {
  if (cols.length === 1) return cols[0];
  const f = t * (cols.length - 1), i = Math.min(Math.floor(f), cols.length - 2);
  return cols[i].clone().lerp(cols[i + 1], f - i);
}
function indicesFor(n) {
  const idx = [];
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, c, b, b, c, d);
  }
  return idx;
}
const _anchor = new THREE.Vector3();
const _wind = { x: 0, y: 0, z: 0 };
