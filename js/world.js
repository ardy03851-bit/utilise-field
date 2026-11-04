/* world.js — the arena world.
   - Terrain: a smooth heightfield slab rendered in 3D (grass top, dirt front,
     strata bands). Fully destructible: craters are carved straight into the
     heightfield and the mesh rebuilds in place.
   - Water: a real-time reflective plane (low-res planar reflection) + animated
     wave/foam shader overlay. Ripples expand where things splash.
   - Sky: gradient dome, sun, drifting low-poly clouds, far hill layers,
     foreground silhouette layer. Fog ties it together. */

import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { clamp, lerp, smooth, makeRNG, mix, jitterHex } from './core.js';
import { Wind } from './wind.js';

export const HALF = 90;          // map half-length in units
export const STEP = .5;          // heightfield column spacing
export const COLS = Math.round(HALF * 2 / STEP) + 1;
export const DEPTH = 26;         // terrain slab depth (z extent)
export const WATER_Y = 0;

export class World {
  constructor(scene, biome, seed = Math.floor(Math.random() * 1e9)) {
    this.scene = scene; this.biome = biome; this.rng = makeRNG(seed); this.seed = seed;
    this.heights = new Float32Array(COLS);      // current surface heights
    this.base = new Float32Array(COLS);         // original (for reference)
    this.waterRipples = [];
    this.group = new THREE.Group();
    scene.add(this.group);
    this._buildTerrain();
    this._buildWater();
    this._buildSky();
    this._buildLayers();
  }

  /* ------------------------------ terrain ------------------------------ */
  _genHeights() {
    const b = this.biome, r = this.rng, flat = b.flat ?? .55;
    // low-frequency rolling base + occasional plateaus (flatter, nicer than pure noise)
    // phases are fixed per harmonic — calling r() per column would make the
    // heightfield pure random noise (sawtooth spikes)
    const ph = [0, 0, 0, 0, 0].map(() => r() * 9);
    const n1 = k => { let v = 0; for (let i = 0; i < 5; i++) v += Math.sin(k * (.02 + i * .013) + ph[i]) / (i + 1.5); return v; };
    for (let i = 0; i < COLS; i++) {
      const x = -HALF + i * STEP;
      let h = 3.2 + n1(x) * 1.6;
      // plateaus: quantize softly
      h = lerp(h, Math.round(h / 2.2) * 2.2, flat);
      // raise the map edges into gentle hills so you can't walk off
      const edge = smooth(clamp((Math.abs(x) - (HALF - 26)) / 26, 0, 1));
      h += edge * 9;
      h += Math.sin(x * .008 + this.seed) * 1.2;
      this.heights[i] = h; this.base[i] = h;
    }
    // optional pond dip in the middle
    if (b.pond) {
      const c = this.rng.range(-30, 30), w = this.rng.range(16, 26), d = this.rng.range(3, 4.5);
      for (let i = 0; i < COLS; i++) {
        const x = -HALF + i * STEP, t = clamp(1 - Math.abs(x - c) / w, 0, 1);
        this.heights[i] -= smooth(t) * d; this.base[i] = this.heights[i];
      }
    }
  }

  _buildTerrain() {
    this._genHeights();
    const b = this.biome;
    // top surface: grid COLS x (Z+1)
    const zSteps = 8, zHalf = DEPTH / 2;
    const verts = (COLS) * (zSteps + 1);
    const pos = new Float32Array(verts * 3), col = new Float32Array(verts * 3);
    const idx = [];
    // top + front skirt + back skirt + caps, all in one geometry
    // layout: [top grid][front skirt: 2 rows][back skirt: 2 rows]
    const frontTop = new Float32Array(COLS), frontBot = new Float32Array(COLS);
    this._topColors = new Float32Array(verts * 3);
    let p = 0, c = 0;
    const top = jitterHex(b.top ?? '#7c6656', this.rng, .04);
    const mid = b.mid ?? '#5c4a41', deep = b.deep ?? '#33282a', cap = b.cap ?? '#86a65a';
    for (let zi = 0; zi <= zSteps; zi++) {
      const z = -zHalf + (zi / zSteps) * DEPTH;
      for (let i = 0; i < COLS; i++) {
        const x = -HALF + i * STEP, y = this.heights[i];
        pos[p++] = x; pos[p++] = y; pos[p++] = z;
        // grass on top, slightly richer at front (z+), rim highlight on front edge
        const front = smooth(clamp((z + zHalf) / DEPTH, 0, 1));
        const cx = clamp(front, 0, 1);
        let cc = [0, 0, 0];
        if (zi === zSteps) cc = hex3(mix(top, cap, .35));                       // front rim = lit grass edge
        else if (zi === 0) cc = hex3(mix(top, deep, .25));                      // back rim = darker
        else cc = hex3(jitterHex(mix(top, cap, .08 * front), this.rng, .05));
        col[c++] = cc[0]; col[c++] = cc[1]; col[c++] = cc[2];
      }
    }
    this._topPos = pos; this._topCol = col;
    for (let zi = 0; zi < zSteps; zi++)
      for (let i = 0; i < COLS - 1; i++) {
        const a = zi * COLS + i, b2 = a + 1, c2 = a + COLS, d2 = c2 + 1;
        idx.push(a, c2, b2, b2, c2, d2);
      }
    // front skirt: top edge (zi=zSteps) down to y=-8
    const skirtBase = verts;
    const botY = -8;
    // 2 rows: top edge (reuse) + bottom
    const sPos = new Float32Array(COLS * 2 * 3), sCol = new Float32Array(COLS * 2 * 3);
    let sp = 0, sc = 0;
    for (let i = 0; i < COLS; i++) {
      const x = -HALF + i * STEP;
      sPos[sp++] = x; sPos[sp++] = this.heights[i]; sPos[sp++] = zHalf;
      const t = clamp((this.heights[i] - botY) / 9, 0, 1);
      const cc = hex3(mix(deep, mid, t)); sCol[sc++] = cc[0]; sCol[sc++] = cc[1]; sCol[sc++] = cc[2];
      sPos[sp++] = x; sPos[sp++] = botY; sPos[sp++] = zHalf;
      const cc2 = hex3(deep); sCol[sc++] = cc2[0]; sCol[sc++] = cc2[1]; sCol[sc++] = cc2[2];
    }
    this._skirtPos = sPos; this._skirtCol = sCol;
    const sIdx = [];
    for (let i = 0; i < COLS - 1; i++) {
      const a = skirtBase + i * 2, b2 = a + 1, c2 = a + 2, d2 = a + 3;
      sIdx.push(a, b2, c2, c2, b2, d2);
    }
    // back skirt
    const backBase = skirtBase + COLS * 2;
    const bPos = new Float32Array(COLS * 2 * 3), bCol = new Float32Array(COLS * 2 * 3);
    let bp = 0, bc = 0;
    for (let i = 0; i < COLS; i++) {
      const x = -HALF + i * STEP;
      bPos[bp++] = x; bPos[bp++] = botY; bPos[bp++] = -zHalf;
      bPos[bp++] = x; bPos[bp++] = this.heights[i]; bPos[bp++] = -zHalf;
      const cc = hex3(deep); bCol[bc++] = cc[0]; bCol[bc++] = cc[1]; bCol[bc++] = cc[2]; bCol[bc++] = cc[0]; bCol[bc++] = cc[1]; bCol[bc++] = cc[2];
    }
    const bIdx = [];
    for (let i = 0; i < COLS - 1; i++) {
      const a = backBase + i * 2, b2 = a + 1, c2 = a + 2, d2 = a + 3;
      bIdx.push(a, c2, b2, b2, c2, d2);
    }
    // side caps (x = ±HALF)
    const capBase = backBase + COLS * 2;
    const cPos = new Float32Array(8 * 3), cCol = new Float32Array(8 * 3);
    let cp = 0;
    const xs = [-HALF, HALF];
    xs.forEach(x => {
      cPos[cp++] = x; cPos[cp++] = this.heights[x < 0 ? 0 : COLS - 1]; cPos[cp++] = zHalf;
      cPos[cp++] = x; cPos[cp++] = botY; cPos[cp++] = zHalf;
      cPos[cp++] = x; cPos[cp++] = botY; cPos[cp++] = -zHalf;
      cPos[cp++] = x; cPos[cp++] = this.heights[x < 0 ? 0 : COLS - 1]; cPos[cp++] = -zHalf;
    });
    for (let i = 0; i < 8; i++) { const cc = hex3(deep); cCol[i * 3] = cc[0]; cCol[i * 3 + 1] = cc[1]; cCol[i * 3 + 2] = cc[2]; }
    const cIdx = [];
    for (let k = 0; k < 2; k++) {
      const a = capBase + k * 4;
      if (k === 0) cIdx.push(a, a + 2, a + 1, a, a + 3, a + 2);        // left cap faces -X
      else cIdx.push(a, a + 1, a + 2, a, a + 2, a + 3);                // right cap faces +X
    }

    // merge — sIdx/bIdx/cIdx already carry their vertex-base offsets
    const allPos = concatF32([pos, sPos, bPos, cPos]), allCol = concatF32([col, sCol, bCol, cCol]);
    const allIdx = concatU32([idx, sIdx, bIdx, cIdx]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(allPos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(allCol, 3));
    geo.setIndex(new THREE.BufferAttribute(allIdx, 1));
    geo.computeVertexNormals();
    this.terrainGeo = geo;
    this._skirtOffset = pos.length;                            // element offsets into merged array
    this._backOffset = this._skirtOffset + sPos.length;
    this._capOffset = this._backOffset + bPos.length;
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95, metalness: 0 });
    this.terrain = new THREE.Mesh(geo, mat);
    this.terrain.receiveShadow = true;
    this.terrain.frustumCulled = false;
    this.group.add(this.terrain);
  }

  /* Re-upload terrain vertex positions after heights change (destruction). */
  refreshTerrain() {
    const pos = this.terrainGeo.attributes.position.array;
    const zSteps = 8;
    let p = 0;
    for (let zi = 0; zi <= zSteps; zi++)
      for (let i = 0; i < COLS; i++) { pos[p + 1] = this.heights[i]; p += 3; }
    // front skirt (top vertex of each column pair)
    const sk = this._skirtOffset;
    for (let i = 0; i < COLS; i++) pos[sk + i * 6 + 1] = this.heights[i];
    // back skirt (second vertex of each column pair is the top one)
    const bk = this._backOffset;
    for (let i = 0; i < COLS; i++) pos[bk + i * 6 + 4] = this.heights[i];
    // side caps: [topFront, bottomFront, bottomBack, topBack] × 2 caps
    const c0 = this._capOffset;
    pos[c0 + 1] = this.heights[0];      // left cap top front
    pos[c0 + 10] = this.heights[0];     // left cap top back
    pos[c0 + 13] = this.heights[COLS - 1]; // right cap top front
    pos[c0 + 22] = this.heights[COLS - 1]; // right cap top back
    this.terrainGeo.attributes.position.needsUpdate = true;
    this.terrainGeo.computeVertexNormals();
  }

  /* ------------------------------ queries ------------------------------ */
  h(x) { // surface height at world x
    const t = (x + HALF) / STEP, i = clamp(Math.floor(t), 0, COLS - 2), f = t - i;
    return lerp(this.heights[i], this.heights[i + 1], f);
  }
  slope(x) { return (this.h(x + 1) - this.h(x - 1)) / 2; }
  waterAt(x, y) { return this.biome.pond !== false && y <= WATER_Y + .05 && this.h(x) < WATER_Y - .2; }
  inWater(x, y) { return y < WATER_Y && this.h(x) < WATER_Y - .3; }

  /* ---------------------------- destruction ---------------------------- */
  /* Carve a smooth crater: depth fades from centre to edge. */
  crater(x, radius, depth) {
    const i0 = clamp(Math.floor((x - radius + HALF) / STEP), 0, COLS - 1);
    const i1 = clamp(Math.ceil((x + radius + HALF) / STEP), 0, COLS - 1);
    for (let i = i0; i <= i1; i++) {
      const d = Math.abs(-HALF + i * STEP - x) / radius;
      if (d >= 1) continue;
      const f = smooth(1 - d);
      this.heights[i] = Math.max(-6, this.heights[i] - depth * f);
    }
    this.refreshTerrain();
  }
  raise(x, radius, amount) { // for fun interactions (dirt piles) — softens craters
    const i0 = clamp(Math.floor((x - radius + HALF) / STEP), 0, COLS - 1);
    const i1 = clamp(Math.ceil((x + radius + HALF) / STEP), 0, COLS - 1);
    for (let i = i0; i <= i1; i++) {
      const d = Math.abs(-HALF + i * STEP - x) / radius;
      if (d >= 1) continue;
      const cap = this.base[i] + 1.5;
      this.heights[i] = Math.min(cap, this.heights[i] + amount * smooth(1 - d));
    }
    this.refreshTerrain();
  }

  /* ------------------------------ water ------------------------------ */
  _buildWater() {
    if (this.biome.pond === false) return;
    this.water = new Reflector(new THREE.PlaneGeometry(HALF * 2 + 60, 30), {
      textureWidth: 256, textureHeight: 128, color: this.biome.water ?? '#7fa9c0',
      clipBias: .05,
    });
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = WATER_Y - .05;
    this.water.material.transparent = true;
    this.water.material.opacity = .82;
    this.group.add(this.water);
    // wave overlay
    const w = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2 + 60, 30, 48, 8), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uT: { value: 0 }, uWind: { value: .3 }, uCol: { value: new THREE.Color(this.biome.water ?? '#7fa9c0') } },
      vertexShader: `
        uniform float uT; uniform float uWind;
        varying vec2 vUv; varying float vW;
        void main(){
          vUv = uv;
          vec3 p = position;
          p.z += sin(p.x*.5 + uT*1.2)*.06 + sin(p.x*1.3 - uT*.8)*.04;
          p.z += sin(p.y*.35 + uT*.9)*.05;
          vW = p.z;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.);
        }`,
      fragmentShader: `
        uniform vec3 uCol; uniform float uT; uniform float uWind;
        varying vec2 vUv; varying float vW;
        void main(){
          float shimmer = sin(vUv.x*160. + uT*2. + sin(vUv.y*40.+uT))*0.5+0.5;
          float band = smoothstep(.0,.25,fract(vUv.y*10. - uT*.05 + sin(vUv.x*8.)*.1));
          vec3 c = uCol*1.12 + shimmer*.08 + vW*.5;
          float edge = smoothstep(0.,.06,vUv.y)*smoothstep(1.,.94,vUv.y);
          gl_FragColor = vec4(c, .16 + band*.1);
        }`
    }));
    w.rotation.x = -Math.PI / 2; w.position.y = WATER_Y + .02;
    this.waterOverlay = w; this.group.add(w);
  }

  ripple(x, strength = 1) {
    if (!this.water) return;
    const r = new THREE.Mesh(new THREE.RingGeometry(.3, .42, 40), new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: .5, depthWrite: false, side: THREE.DoubleSide,
    }));
    r.rotation.x = -Math.PI / 2; r.position.set(x, WATER_Y + .06, 0);
    this.group.add(r);
    this.waterRipples.push({ mesh: r, t: 0, s: strength });
  }

  /* ------------------------------ sky ------------------------------ */
  _buildSky() {
    const b = this.biome;
    // gradient dome
    const skyGeo = new THREE.SphereGeometry(400, 24, 12);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(b.skyT ?? '#bfe3ff') }, bot: { value: new THREE.Color(b.skyB ?? '#fdf3e3') } },
      vertexShader: `varying float vY; void main(){ vY = normalize(position).y; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 bot; varying float vY;
        void main(){ float t = smoothstep(-.08,.45,vY); gl_FragColor = vec4(mix(bot,top,t),1.); }`
    });
    this.sky = new THREE.Mesh(skyGeo, skyMat);
    this.group.add(this.sky);
    // sun
    const sun = new THREE.Mesh(new THREE.CircleGeometry(14, 40), new THREE.MeshBasicMaterial({ color: b.sun ?? '#fffaf2', fog: false }));
    sun.position.set(-120, 130, -320); sun.lookAt(0, 0, 0);
    this.group.add(sun);
    // sun glow sprite
    const glow = new THREE.Mesh(new THREE.CircleGeometry(30, 40), new THREE.MeshBasicMaterial({ color: b.sun ?? '#fffaf2', transparent: true, opacity: .18, fog: false }));
    glow.position.set(-120, 130, -321); this.group.add(glow);
    // clouds: clusters of squashed spheres
    this.clouds = [];
    const cloudMat = new THREE.MeshStandardMaterial({ color: b.cloud ?? '#ffffff', roughness: 1, transparent: true, opacity: .92 });
    const rng = this.rng;
    for (let i = 0; i < 9; i++) {
      const g = new THREE.Group();
      const n = 3 + Math.floor(rng() * 4);
      for (let k = 0; k < n; k++) {
        const s = rng.range(4, 9);
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), cloudMat);
        m.position.set((k - n / 2) * rng.range(4, 7), rng.range(-1, 1.5), rng.range(-2, 2));
        m.scale.set(s, s * .55, s * .7);
        g.add(m);
      }
      g.position.set(rng.range(-HALF * 1.4, HALF * 1.4), rng.range(36, 56), -rng.range(85, 170));
      const sc = rng.range(.8, 1.9); g.scale.setScalar(sc);
      this.clouds.push(g); this.group.add(g);
    }
  }

  /* --------------------------- parallax layers --------------------------- */
  _buildLayers() {
    const b = this.biome, rng = this.rng;
    // far hills: 3 layers of curved silhouette ribbons
    this.hillLayers = [];
    const far = b.far ?? ['#d9c9b8', '#cdb9a5'];
    const layers = [...far, mix(far[far.length - 1], b.skyB ?? '#fdf3e3', .4)];
    layers.forEach((col, li) => {
      const pts = [], z = -55 - li * 22, yBase = -2 + li * 2.5;
      for (let x = -220; x <= 220; x += 8) {
        const h = yBase + Math.sin(x * .008 + li * 3 + this.seed * .1) * 9 + Math.sin(x * .03 + li) * 4 + 8;
        pts.push([x, h]);
      }
      const shape = new THREE.Shape(); shape.moveTo(-220, -30);
      pts.forEach(p => shape.lineTo(p[0], p[1]));
      shape.lineTo(220, -30); shape.closePath();
      const geo = new THREE.ShapeGeometry(shape, 4);
      const mat = new THREE.MeshBasicMaterial({ color: col, fog: false });
      const m = new THREE.Mesh(geo, mat); m.position.z = z;
      this.group.add(m); this.hillLayers.push(m);
    });
    // background silhouette trees layer (behind gameplay, in front of far hills)
    this.bgTrees = new THREE.Group();
    if (b.bgTrees !== false) {
      const kinds = (b.props || []).filter(p => TREEY.has(p[0]));
      const kind = b.bgTrees && kinds.find(k => k[0] === b.bgTrees) ? b.bgTrees : (kinds[0]?.[0] || 'oak');
      const silMat = new THREE.MeshBasicMaterial({ color: mix(b.far?.[far.length - 1] ?? '#cdb9a5', b.deep ?? '#33282a', .25), fog: false });
      const n = 14;
      for (let i = 0; i < n; i++) {
        const x = -HALF + (i + rng()) * (HALF * 2 / n);
        const s = .8 + rng() * .7;
        const t = makeSilTree(kind, rng, silMat);
        t.position.set(x, this.h(x) - 2, -DEPTH / 2 - 3 - rng() * 6);
        t.scale.setScalar(s);
        this.bgTrees.add(t);
      }
    }
    this.group.add(this.bgTrees);
    // foreground layer: dark grass tufts / bush silhouettes, slightly blurred feel via low detail
    this.fgLayer = new THREE.Group();
    const fgMat = new THREE.MeshBasicMaterial({ color: mix(b.deep ?? '#33282a', b.mid ?? '#5c4a41', .4), fog: false, transparent: true, opacity: .55 });
    for (let i = 0; i < 12; i++) {
      const x = -HALF - 20 + rng() * (HALF * 2 + 40);
      const g = new THREE.Group();
      const n = 2 + Math.floor(rng() * 3);
      for (let k = 0; k < n; k++) {
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), fgMat);
        const s = rng.range(.8, 1.6);
        m.scale.set(s, s * .7, s);
        m.position.set((k - n / 2) * 1.2, rng.range(-.4, .3), 0);
        g.add(m);
      }
      g.position.set(x, this.h(clamp(x, -HALF, HALF)) - 2.4, DEPTH / 2 + 3 + rng() * 4);
      this.fgLayer.add(g);
    }
    this.group.add(this.fgLayer);
  }

  /* ------------------------------ update ------------------------------ */
  update(dt, t, quality) {
    // clouds drift with wind
    for (const c of this.clouds) {
      c.position.x += Wind.base * Wind.dir * dt * 1.2;
      if (Wind.dir > 0 && c.position.x > HALF * 1.6) c.position.x = -HALF * 1.6;
      if (Wind.dir < 0 && c.position.x < -HALF * 1.6) c.position.x = HALF * 1.6;
    }
    if (this.waterOverlay) {
      this.waterOverlay.material.uniforms.uT.value = t;
      this.waterOverlay.material.uniforms.uWind.value = Wind.base * (Wind.dir > 0 ? 1 : -1);
    }
    // ripples
    for (let i = this.waterRipples.length - 1; i >= 0; i--) {
      const r = this.waterRipples[i];
      r.t += dt * 2.2;
      const s = (0.4 + r.t * 5 * r.s);
      r.mesh.scale.setScalar(s);
      r.mesh.material.opacity = .5 * (1 - r.t);
      if (r.t >= 1) { this.group.remove(r.mesh); r.mesh.geometry.dispose(); r.mesh.material.dispose(); this.waterRipples.splice(i, 1); }
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose()); });
  }
}

const TREEY = new Set(['oak', 'cherry', 'autumn', 'birch', 'willow', 'acacia', 'baobab', 'pine', 'snowpine', 'palm', 'bamboo', 'cactus', 'giantshroom']);
function hex3(h) { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }
function concatF32(arrs) { let n = 0; arrs.forEach(a => n += a.length); const out = new Float32Array(n); let o = 0; arrs.forEach(a => { out.set(a, o); o += a.length; }); return out; }
function concatU32(arrs) { let n = 0; arrs.forEach(a => n += a.length); const out = new Uint32Array(n); let o = 0; arrs.forEach(a => { out.set(a, o); o += a.length; }); return out; }

/* A cheap silhouette tree for the background layer (basic blob on a stick). */
function makeSilTree(kind, rng, mat) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.35, .5, 5, 5), mat);
  trunk.position.y = 2.5; g.add(trunk);
  const n = kind === 'pine' || kind === 'snowpine' ? 4 : 3;
  for (let i = 0; i < n; i++) {
    const b2 = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), mat);
    const s = rng.range(1.6, 2.4);
    b2.scale.set(s, s * .8, s);
    b2.position.set(rng.range(-1.5, 1.5), 5 + rng.range(0, 2.5), rng.range(-1, 1));
    g.add(b2);
  }
  return g;
}
