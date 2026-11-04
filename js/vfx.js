/* vfx.js — 3D visual effects.
   - GPU particle system (THREE.Points, custom shader: size, colour, fade).
   - Sparks physically collide with the terrain and bounce.
   - Debris: instanced 3D chunks that tumble and bounce (physics destruction).
   - Rings: expanding shockwave / ripple meshes. Pooled point-light flashes.
   - Confetti for wave clears, leaf flutter, dirt puffs, splash droplets. */

import * as THREE from 'three';
import { clamp, makeRNG } from './core.js';
import { Wind } from './wind.js';

const MAX_P = 900;
const MAX_DEBRIS = 140;

export class VFX {
  constructor(scene, world) {
    this.scene = scene; this.world = world;
    this.shakeAmt = 0;
    this._rng = makeRNG(4242);

    // ---------- particles ----------
    this.p = [];
    this.pGeo = new THREE.BufferGeometry();
    this.pPos = new Float32Array(MAX_P * 3);
    this.pCol = new Float32Array(MAX_P * 3);
    this.pSize = new Float32Array(MAX_P);
    this.pAlpha = new Float32Array(MAX_P);
    this.pGeo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    this.pGeo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    this.pGeo.setAttribute('aSize', new THREE.BufferAttribute(this.pSize, 1));
    this.pGeo.setAttribute('aAlpha', new THREE.BufferAttribute(this.pAlpha, 1));
    const idx = new Uint16Array(MAX_P);
    this.pGeo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.pGeo.setDrawRange(0, 0);
    const pMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float aSize; attribute float aAlpha; varying vec3 vC; varying float vA;
        void main(){
          vC = color; vA = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.);
          gl_PointSize = aSize * (240. / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vC; varying float vA;
        void main(){
          vec2 d = gl_PointCoord - .5;
          float r = length(d);
          if (r > .5) discard;
          float a = smoothstep(.5, .18, r) * vA;
          gl_FragColor = vec4(vC, a);
        }`,
      vertexColors: true,
    });
    this.points = new THREE.Points(this.pGeo, pMat);
    this.points.frustumCulled = false;
    scene.add(this.points);

    // ---------- debris (instanced tumbling chunks) ----------
    this.dGeo = new THREE.BoxGeometry(1, 1, 1);
    this.dMat = new THREE.MeshStandardMaterial({ roughness: .9 });
    this.debris = new THREE.InstancedMesh(this.dGeo, this.dMat, MAX_DEBRIS);
    this.debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.debris.castShadow = true;
    this.debris.frustumCulled = false;
    this.dState = [];
    for (let i = 0; i < MAX_DEBRIS; i++) this.dState.push({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, s: 1, life: 0, col: new THREE.Color() });
    this._dummy = new THREE.Object3D();
    scene.add(this.debris);

    // ---------- rings ----------
    this.rings = [];
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(new THREE.RingGeometry(.7, .85, 36), new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
      }));
      m.visible = false; scene.add(m);
      this.rings.push({ mesh: m, t: 1, dur: 1, grow: 6, y0: 0 });
    }

    // ---------- light flashes (pooled) ----------
    this.lights = [];
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 22, 2);
      l.visible = false; scene.add(l);
      this.lights.push({ l, t: 1, dur: 1, power: 10 });
    }
  }

  /* ------------------------------ emitters ------------------------------ */
  emit(opts) {
    // opts: x,y,count,spread,speed,vy,grav,size,ttl,col(collect),collide,bounce,fade,sway
    for (let i = 0; i < (opts.count ?? 1); i++) {
      if (this.p.length >= MAX_P) return;
      const a = (opts.angle ?? 0) + (opts.spread ?? 0) * (this._rng() - .5) * 2;
      const sp = (opts.speed ?? 1) * (.6 + this._rng() * .8);
      const col = Array.isArray(opts.col) ? opts.col[Math.floor(this._rng() * opts.col.length)] : opts.col;
      const c = new THREE.Color(col);
      this.p.push({
        x: (opts.x ?? 0) + (this._rng() - .5) * (opts.jitterX ?? 0),
        y: (opts.y ?? 0) + (this._rng() - .5) * (opts.jitterY ?? 0),
        z: .1 + this._rng() * .2,
        vx: Math.cos(a) * sp + (opts.vx ?? 0),
        vy: Math.sin(a) * sp + (opts.vy ?? 0),
        grav: opts.grav ?? -20,
        drag: opts.drag ?? .5,
        bounce: opts.bounce ?? 0,
        size: (opts.size ?? .3) * (.7 + this._rng() * .6),
        life: 0, ttl: (opts.ttl ?? .8) * (.8 + this._rng() * .4),
        c, fadePow: opts.fadePow ?? 1.5, sway: opts.sway ?? 0, phase: this._rng() * 9,
      });
    }
  }

  debrisBurst(x, y, n, cols, power = 1) {
    for (let i = 0; i < n; i++) {
      const d = this.dState.find(d => !d.alive);
      if (!d) return;
      d.alive = true;
      d.x = x + (this._rng() - .5); d.y = y + this._rng() * .5; d.z = (this._rng() - .5) * 1.5;
      const a = this._rng() * Math.PI * 2, sp = (3 + this._rng() * 6) * power;
      d.vx = Math.cos(a) * sp; d.vy = 5 + this._rng() * 7 * power; d.vz = (this._rng() - .5) * 4;
      d.rx = this._rng() * 9; d.ry = this._rng() * 9; d.rz = this._rng() * 9;
      d.s = .14 + this._rng() * .22; d.life = 0; d.ttl = 2.4 + this._rng() * 1.2;
      d.col.set(Array.isArray(cols) ? cols[Math.floor(this._rng() * cols.length)] : cols);
    }
  }

  ring(x, y, color = '#ffffff', grow = 9, dur = .55, vertical = true) {
    const r = this.rings.find(r => r.t >= 1);
    if (!r) return;
    r.mesh.visible = true;
    r.mesh.material.color.set(color);
    r.mesh.position.set(x, y, .1);
    r.mesh.rotation.set(vertical ? Math.PI / 2 : 0, 0, 0);
    if (!vertical) r.mesh.rotation.x = 0;
    r.t = 0; r.dur = dur; r.grow = grow;
  }

  flash(x, y, color = '#ffb36b', power = 9, dur = .22) {
    const f = this.lights.find(f => f.t >= 1);
    if (!f) return;
    f.l.visible = true; f.l.color.set(color); f.l.position.set(x, y, 1.5);
    f.t = 0; f.dur = dur; f.power = power;
  }

  shake(a) { this.shakeAmt = Math.min(1.4, this.shakeAmt + a); }

  /* ------------------------------ explosions ------------------------------ */
  explosion(x, y, color = '#ffb36b') {
    this.ring(x, y, color, 12, .5);
    this.ring(x, y, '#ffffff', 7, .35);
    this.flash(x, y + 1, color, 14, .3);
    this.emit({ x, y, count: 22, angle: Math.PI / 2, spread: Math.PI, speed: 6, grav: -14, size: .5, ttl: .9, col: [color, '#fff3d6', '#e86a5a'], fadePow: 2 });
    this.emit({ x, y, count: 10, angle: Math.PI / 2, spread: Math.PI * .8, speed: 2, grav: -3, drag: 2, size: 1.1, ttl: 1.4, col: ['#5a4a42', '#4a3d36'], fadePow: 1 });
    this.debrisBurst(x, y, 7, ['#5a4a42', '#3d332c', color], .9);
    this.shake(.5);
  }

  muzzle(x, y, dir, color = '#ffd98a') {
    this.emit({ x, y, count: 6, angle: dir > 0 ? 0 : Math.PI, spread: .5, speed: 7, grav: -4, size: .22, ttl: .3, col: [color, '#fff6e0'], fadePow: 2 });
    this.flash(x + dir * .4, y, color, 5, .09);
  }

  dirt(x, y, dir, n = 12, power = 1) {
    this.emit({ x, y, count: n, angle: dir > 0 ? .9 : Math.PI - .9, spread: 1.1, speed: 6 * power, vy: 4, grav: -22, size: .3, ttl: 1, col: ['#6b563f', '#57452f', '#7d6449'], bounce: .3, fadePow: 1 });
    this.debrisBurst(x, y, 3, ['#57452f', '#6b563f'], .5);
  }

  sparks(x, y, dir, color = '#ffd98a', n = 8) {
    // sparks physically collide with the ground
    this.emit({ x, y, count: n, angle: dir > 0 ? Math.PI * .75 : Math.PI * .25, spread: Math.PI * .8, speed: 8, grav: -30, size: .16, ttl: .7, col: [color, '#ffffff', '#ff9d5c'], bounce: .55, fadePow: 2 });
  }

  splash(x, y, n = 14) {
    this.emit({ x, y: Math.max(y, 0), count: n, angle: Math.PI / 2, spread: Math.PI * .7, speed: 4.5, grav: -26, size: .24, ttl: .8, col: ['#bfe3f2', '#d4eef8', '#9fd0e6'], bounce: .1, fadePow: 2 });
    this.world.ripple && this.world.ripple(x, 1.2);
  }

  leafBurst(x, y, cols) {
    this.emit({ x, y, count: 8, angle: Math.PI / 2, spread: Math.PI, speed: 2, grav: -3.5, drag: 1.4, size: .3, ttl: 2.2, col: cols, sway: 2, fadePow: 1 });
  }

  confetti(x, y) {
    const cols = ['#f2789f', '#f9c74f', '#90be6d', '#5bc0eb', '#c77dff', '#f8961e'];
    this.emit({ x, y, count: 40, angle: Math.PI / 2, spread: Math.PI, speed: 6, grav: -6, drag: 1.2, size: .28, ttl: 2.6, col: cols, sway: 3, fadePow: 1 });
  }

  /* ------------------------------ update ------------------------------ */
  update(dt) {
    const w = this.world;
    // particles
    const pos = this.pPos, col = this.pCol, size = this.pSize, alpha = this.pAlpha;
    let n = 0;
    for (let i = this.p.length - 1; i >= 0; i--) {
      const p = this.p[i];
      p.life += dt;
      if (p.life >= p.ttl) { this.p.splice(i, 1); continue; }
      p.vy += p.grav * dt;
      const drag = Math.exp(-p.drag * dt);
      p.vx *= drag; p.vy *= drag;
      if (p.sway) p.vx += Math.sin(p.life * 3 + p.phase) * p.sway * dt * 6;
      const wind = Wind.at(p.x, p.y, _w);
      p.vx += wind.x * .3 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      // collide with terrain
      const h = w.h(p.x);
      if (p.y < h + .04) {
        if (p.bounce > 0 && Math.abs(p.vy) > 1) { p.y = h + .04; p.vy = -p.vy * p.bounce; p.vx *= .8; }
        else { p.y = h + .04; p.vy = 0; p.vx *= .85; p.grav = Math.min(p.grav, -2); }
      }
      const t = p.life / p.ttl, fade = Math.pow(1 - t, p.fadePow);
      pos[n * 3] = p.x; pos[n * 3 + 1] = p.y; pos[n * 3 + 2] = p.z;
      col[n * 3] = p.c.r; col[n * 3 + 1] = p.c.g; col[n * 3 + 2] = p.c.b;
      size[n] = p.size * (0.7 + .3 * fade) * 100;
      alpha[n] = fade;
      n++;
    }
    this.pGeo.setDrawRange(0, n);
    if (n) { this.pGeo.attributes.position.needsUpdate = true; this.pGeo.attributes.color.needsUpdate = true; this.pGeo.attributes.aSize.needsUpdate = true; this.pGeo.attributes.aAlpha.needsUpdate = true; }
    this.points.visible = n > 0;

    // debris
    let anyD = false;
    this.dState.forEach((d, i) => {
      if (!d.alive) { this._dummy.position.set(0, -999, 0); this._dummy.scale.setScalar(.001); this._dummy.updateMatrix(); this.debris.setMatrixAt(i, this._dummy.matrix); return; }
      anyD = true;
      d.life += dt;
      if (d.life >= d.ttl) { d.alive = false; return; }
      d.vy -= 26 * dt;
      d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      const h = w.h(d.x);
      if (d.y < h + d.s * .5) {
        d.y = h + d.s * .5;
        if (Math.abs(d.vy) > 2) { d.vy = -d.vy * .4; d.vx *= .6; d.vz *= .6; }
        else { d.vy = 0; d.vx *= .8; }
      }
      d.rx += d.vx * dt * 2; d.ry += d.vy * dt * 2; d.rz += d.vz * dt * 2;
      const s = d.s * (1 - Math.pow(d.life / d.ttl, 3) * .8);
      this._dummy.position.set(d.x, d.y, d.z);
      this._dummy.rotation.set(d.rx, d.ry, d.rz);
      this._dummy.scale.setScalar(Math.max(s, .001));
      this._dummy.updateMatrix();
      this.debris.setMatrixAt(i, this._dummy.matrix);
      this.debris.setColorAt(i, d.col);
    });
    this.debris.instanceMatrix.needsUpdate = true;
    if (this.debris.instanceColor) this.debris.instanceColor.needsUpdate = true;
    this.debris.visible = anyD;

    // rings
    for (const r of this.rings) {
      if (r.t >= 1) { r.mesh.visible = false; continue; }
      r.t += dt / r.dur;
      const s = .3 + r.t * r.grow;
      r.mesh.scale.setScalar(s);
      r.mesh.material.opacity = .8 * (1 - r.t);
      if (r.t >= 1) r.mesh.visible = false;
    }
    // flashes
    for (const f of this.lights) {
      if (f.t >= 1) { f.l.visible = false; continue; }
      f.t += dt / f.dur;
      f.l.intensity = f.power * (1 - f.t);
      if (f.t >= 1) f.l.visible = false;
    }
    // camera shake decay
    this.shakeAmt *= Math.exp(-5 * dt);
    return this.shakeAmt;
  }
}
const _w = { x: 0, y: 0, z: 0 };
