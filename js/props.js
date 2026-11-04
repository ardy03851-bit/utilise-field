/* props.js — the 3D prop catalogue.
   Every tree, plant, rock and object from the Sketch3 prop list, rebuilt as
   low-poly 3D. Leaves are SEPARATE meshes so wind can push them around:
   each leaf blob gets its own position / rotation / scale animation
   (not just a simple rotate) driven by the wind field + per-blob noise.

   Trees: oak, cherry, autumn, birch, willow, acacia, baobab, pine, snowpine,
          palm, dead, bamboo, giantshroom, cactus
   Small:  bush, fern, reeds, lavender, flowers, tallgrass, mushroom, pumpkin
   Things: rock, gravestone, pillar, crystal, barrel, crate, lamp, lantern

   Every prop is destructible (hp) and pops into physics debris when it dies. */

import * as THREE from 'three';
import { makeRNG, mix, jitterHex, hex2rgb, clamp } from './core.js';
import { Wind } from './wind.js';

/* shared, cached geometries & materials */
const G = {
  blob: new THREE.IcosahedronGeometry(1, 1),
  blobLo: new THREE.IcosahedronGeometry(1, 0),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 7),
  cone: new THREE.ConeGeometry(1, 1, 7),
  box: new THREE.BoxGeometry(1, 1, 1),
  octa: new THREE.OctahedronGeometry(1, 0),
  sphere: new THREE.SphereGeometry(1, 10, 8),
};
const matCache = new Map();
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({
    color, roughness: opts.rough ?? .9, metalness: opts.metal ?? 0,
    flatShading: opts.flat ?? false, transparent: opts.opacity !== undefined,
    opacity: opts.opacity ?? 1, emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveI ?? 1,
  }));
  return matCache.get(key);
}

export const PROP_DEFS = {
  oak:        { tree: 1, hp: 120, w: 3.4, h: 8 },
  autumn:     { tree: 1, hp: 120, w: 3.4, h: 8 },
  cherry:     { tree: 1, hp: 110, w: 3.6, h: 7.2 },
  birch:      { tree: 1, hp: 90, w: 2.6, h: 9 },
  willow:     { tree: 1, hp: 130, w: 4, h: 7.5 },
  acacia:     { tree: 1, hp: 120, w: 4.4, h: 7 },
  baobab:     { tree: 1, hp: 200, w: 3.2, h: 7.5 },
  pine:       { tree: 1, hp: 110, w: 2.4, h: 9 },
  snowpine:   { tree: 1, hp: 110, w: 2.4, h: 9 },
  palm:       { tree: 1, hp: 100, w: 4, h: 9.5 },
  dead:       { tree: 1, hp: 70, w: 2.8, h: 7 },
  bamboo:     { tree: 1, hp: 80, w: 1.6, h: 10 },
  giantshroom:{ tree: 1, hp: 90, w: 3, h: 6.5 },
  cactus:     { tree: 1, hp: 70, w: 2, h: 5 },
  bush:       { small: 1, hp: 30, w: 2, h: 1.2 },
  fern:       { small: 1, hp: 20, w: 1.8, h: 1.2 },
  reeds:      { small: 1, hp: 15, w: 1.4, h: 1.7 },
  lavender:   { small: 1, hp: 15, w: 1.5, h: 1.1 },
  flowers:    { small: 1, hp: 10, w: 1.2, h: .8 },
  tallgrass:  { small: 1, hp: 10, w: 1.4, h: 1.2 },
  mushroom:   { small: 1, hp: 40, w: 1.2, h: 1 },
  pumpkin:    { small: 1, hp: 35, w: 1.1, h: .9 },
  rock:       { hp: 200, w: 1.7, h: 1 },
  gravestone: { hp: 120, w: 1, h: 1.3 },
  pillar:     { tree: 1, hp: 220, w: 1.2, h: 3.2 },
  crystal:    { hp: 90, w: 1.5, h: 1.9 },
  barrel:     { hp: 1, explode: 1, w: .8, h: 1 },
  crate:      { hp: 40, w: 1, h: .95 },
  lamp:       { hp: 60, w: 1, h: 2.9 },
  lantern:    { hp: 40, w: 1, h: 2.5 },
};

const LEAF_COLORS = {
  cherry: ['#f7b6c8', '#f39bb4', '#fde2ea'],
  autumn: ['#d9573b', '#e9a23b', '#c8742f'],
  lavender: ['#9b7fc7', '#b9a0e0', '#7d9a55'],
  bamboo: ['#8fae4a', '#a8c060'],
  snowpine: ['#e8f2ef', '#cfe3dc', '#b9d4ca'],
};

/* ------------------------------------------------------------------ */
/* Build one prop. theme = biome colours (top, deep, leaf, cap...).     */
export function buildProp(kind, rng, theme) {
  const g = new THREE.Group();
  const leafCols = LEAF_COLORS[kind] || theme.leaf || ['#7fae5a', '#93c46e', '#6a9c4a'];
  const woodCol = kind === 'cherry' ? mix('#5a3b3a', theme.deep || '#33282a', .15)
    : kind === 'birch' ? '#e8e4da' : mix('#6e4c36', theme.deep || '#33282a', .2);
  const leaves = [];   // wind-animated leaf blobs
  const swayers = [];  // palm fronds / willow strands (rotating joints)

  const addBlob = (parent, x, y, z, s, col, sy = .85, det = 1) => {
    const m = new THREE.Mesh(det ? G.blob : G.blobLo, mat(col));
    m.position.set(x, y, z); m.scale.set(s, s * sy, s * .9);
    m.castShadow = true;
    m.userData.base = m.position.clone(); m.userData.s0 = m.scale.clone();
    m.userData.phase = rng() * Math.PI * 2; m.userData.hf = clamp(y / 7, .35, 1.25);
    parent.add(m); leaves.push(m);
    return m;
  };

  const trunkMesh = (h, rBase, rTop, col = woodCol, bend = 0) => {
    const m = new THREE.Mesh(G.cyl, mat(col));
    m.scale.set(rTop, h, rTop); // uniform-ish; taper via two stacked pieces below when needed
    m.scale.set((rBase + rTop) / 2, h, (rBase + rTop) / 2);
    m.position.y = h / 2; m.rotation.z = bend;
    m.castShadow = true;
    return m;
  };

  switch (kind) {
    case 'oak': case 'autumn': case 'cherry': {
      const h = kind === 'cherry' ? 3.4 : 4.2;
      g.add(trunkMesh(h, .42, .3, woodCol, rng.range(-.06, .06)));
      // branch stubs
      for (let i = 0; i < 2; i++) {
        const br = new THREE.Mesh(G.cyl, mat(woodCol));
        br.scale.set(.14, 1.4, .14); br.position.set(rng.range(-.8, .8), h * .8, rng.range(-.4, .4));
        br.rotation.z = rng.range(-.9, .9); br.castShadow = true; g.add(br);
      }
      const n = 5;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rng.range(0, 1);
        const rad = kind === 'cherry' ? rng.range(1.5, 2.3) : rng.range(1.3, 2.1);
        addBlob(g, Math.cos(a) * rad, h + rng.range(.2, 1.6), Math.sin(a) * rad * .55,
          rng.range(1.2, 1.9), leafCols[i % leafCols.length], rng.range(.75, .95));
      }
      addBlob(g, 0, h + 1.6, 0, rng.range(1.6, 2), leafCols[leafCols.length - 1], .7);
      if (kind === 'cherry') { // little white blossoms
        for (let i = 0; i < 6; i++) {
          const p = new THREE.Mesh(G.sphere, mat('#fff3f6'));
          p.scale.setScalar(.12); p.position.set(rng.range(-2, 2), h + rng.range(.5, 2.2), rng.range(-.8, .8));
          p.userData = { base: p.position.clone(), s0: p.scale.clone(), phase: rng() * 9, hf: 1 };
          g.add(p); leaves.push(p);
        }
      }
      break;
    }
    case 'birch': {
      const h = 6.4;
      const t = trunkMesh(h, .26, .2, '#e8e4da', rng.range(-.04, .04));
      g.add(t);
      // dark bands
      for (let i = 0; i < 4; i++) {
        const band = new THREE.Mesh(G.cyl, mat('#3a3a38'));
        band.scale.set(.27, .12, .27); band.position.y = .8 + i * 1.5;
        g.add(band);
      }
      for (let i = 0; i < 4; i++) {
        const a = rng.range(0, Math.PI * 2);
        addBlob(g, Math.cos(a) * rng.range(.8, 1.7), h - rng.range(0, 1.6), Math.sin(a) * .5,
          rng.range(1, 1.5), leafCols[i % leafCols.length], .95);
      }
      break;
    }
    case 'willow': {
      const h = 4.4;
      g.add(trunkMesh(h, .4, .28));
      addBlob(g, 0, h + .8, 0, 2.1, leafCols[0], .55);
      // hanging strands
      const nS = 6;
      for (let i = 0; i < nS; i++) {
        const a = (i / nS) * Math.PI * 2 + rng.range(0, .5);
        const rx = Math.cos(a) * 1.9, rz = Math.sin(a) * .8;
        const joint = new THREE.Group(); joint.position.set(rx, h + .6, rz);
        const nB = 3;
        for (let k = 0; k < nB; k++) {
          const b = new THREE.Mesh(G.blob, mat(leafCols[(i + k) % leafCols.length]));
          const s = .55 - k * .1;
          b.scale.set(s, s * 1.2, s * .8);
          b.position.set(0, -.55 * (k + 1) + .3, 0);
          b.castShadow = true;
          b.userData.base = b.position.clone(); b.userData.s0 = b.scale.clone();
          b.userData.phase = rng() * 9; b.userData.hf = 1.1;
          joint.add(b); leaves.push(b);
        }
        g.add(joint); swayers.push(joint);
      }
      break;
    }
    case 'acacia': {
      const h = 3.6;
      g.add(trunkMesh(h, .38, .26, woodCol, rng.range(-.12, .12)));
      addBlob(g, 0, h + .9, 0, 3.4, leafCols[0], .38); // wide flat canopy
      addBlob(g, .8, h + 1.3, .3, 2.2, leafCols[1 % leafCols.length], .3);
      addBlob(g, -.9, h + 1.1, -.2, 2, leafColors2(leafCols, 2), .32);
      break;
    }
    case 'baobab': {
      const h = 4.8;
      const t = new THREE.Mesh(G.cyl, mat(mix(woodCol, '#c9b8a6', .3)));
      t.scale.set(1.1, h, .95); t.position.y = h / 2; t.castShadow = true; g.add(t);
      // root flare
      for (let i = 0; i < 5; i++) {
        const rt = new THREE.Mesh(G.cone, mat(mix(woodCol, '#c9b8a6', .3)));
        rt.scale.set(.4, 1.4, .4); rt.position.set(rng.range(-1, 1), .6, rng.range(-.5, .5));
        rt.rotation.z = rng.range(-.4, .4); rt.castShadow = true; g.add(rt);
      }
      for (let i = 0; i < 4; i++) {
        const a = rng.range(0, Math.PI * 2);
        addBlob(g, Math.cos(a) * rng.range(.5, 1.6), h + rng.range(0, 1), Math.sin(a) * .4,
          rng.range(1, 1.5), leafCols[i % leafCols.length], .5);
      }
      break;
    }
    case 'pine': case 'snowpine': {
      const h = 7.6;
      g.add(trunkMesh(h * .45, .3, .24, woodCol));
      const cols = kind === 'snowpine' ? ['#3d6758', '#487465'] : [mix(theme.cap || '#86a65a', '#2f5a3e', .5), mix(theme.cap || '#86a65a', '#2f5a3e', .3)];
      const tiers = 4;
      for (let i = 0; i < tiers; i++) {
        const y = 1.8 + i * 1.5, r = 2.1 - i * .42, hh = 1.9;
        const cone = new THREE.Mesh(G.cone, mat(cols[i % cols.length]));
        cone.scale.set(r, hh, r); cone.position.y = y;
        cone.castShadow = true;
        cone.userData.base = cone.position.clone(); cone.userData.s0 = cone.scale.clone();
        cone.userData.phase = rng() * 9; cone.userData.hf = clamp(y / 7, .4, 1.2);
        g.add(cone); leaves.push(cone);
        if (kind === 'snowpine') { // snow cap
          const snow = new THREE.Mesh(G.cone, mat('#eef6f2'));
          snow.scale.set(r * .55, hh * .5, r * .55); snow.position.y = y + hh * .28;
          snow.userData.base = snow.position.clone(); snow.userData.s0 = snow.scale.clone();
          snow.userData.phase = rng() * 9; snow.userData.hf = clamp(y / 7, .4, 1.2);
          g.add(snow); leaves.push(snow);
        }
      }
      break;
    }
    case 'palm': {
      const h = 6.8;
      // curved trunk as one smooth tube
      const bend = rng.range(.05, .16) * (rng() < .5 ? 1 : -1);
      const spine = [];
      let px = 0, py = 0, ang = bend;
      for (let i = 0; i <= 7; i++) {
        spine.push(new THREE.Vector3(px, py, 0));
        px += Math.sin(ang) * (h / 7); py += Math.cos(ang) * (h / 7); ang += .05;
      }
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(spine), 12, .22, 7), mat(mix(woodCol, '#a98d6b', .2)));
      tube.castShadow = true; g.add(tube);
      const top = spine[spine.length - 1];
      const crown = new THREE.Group(); crown.position.set(top.x, top.y + .2, 0);
      const frondMat = mat(leafCols[0]);
      for (let i = 0; i < 7; i++) {
        const frond = new THREE.Group();
        const a = (i / 7) * Math.PI * 2;
        const stem = new THREE.Mesh(G.box, mat(mix(woodCol, '#a98d6b', .2)));
        stem.scale.set(2.4, .07, .1); stem.position.x = 1.2; stem.castShadow = true;
        frond.add(stem);
        for (let k = 0; k < 4; k++) {
          const lf = new THREE.Mesh(G.blobLo, frondMat);
          lf.scale.set(.55, .1, .3);
          lf.position.set(.6 + k * .55, .12 + k * .05, 0);
          lf.rotation.z = -k * .12;
          lf.userData.base = lf.position.clone(); lf.userData.s0 = lf.scale.clone();
          lf.userData.phase = rng() * 9; lf.userData.hf = 1.2;
          frond.add(lf); leaves.push(lf);
        }
        frond.position.y = .1; frond.rotation.z = -rng.range(.25, .55); // droop
        frond.userData.a = a; frond.userData.phase = rng() * 9;
        const holder = new THREE.Group(); holder.rotation.y = a; holder.add(frond);
        crown.add(holder); swayers.push(frond);
      }
      // coconuts
      for (let i = 0; i < 2; i++) {
        const c = new THREE.Mesh(G.sphere, mat('#6b4a2e'));
        c.scale.setScalar(.22); c.position.set(rng.range(-.3, .3), -.15, rng.range(-.3, .3));
        crown.add(c);
      }
      g.add(crown);
      break;
    }
    case 'dead': {
      const h = 5.6;
      g.add(trunkMesh(h, .3, .16, mix(woodCol, '#2a2420', .4)));
      for (let i = 0; i < 4; i++) {
        const br = new THREE.Mesh(G.cyl, mat(mix(woodCol, '#2a2420', .4)));
        br.scale.set(.1, rng.range(1.2, 2.4), .1);
        br.position.set(rng.range(-.9, .9), rng.range(2, h), rng.range(-.4, .4));
        br.rotation.z = rng.range(-1.1, 1.1); br.castShadow = true; g.add(br);
      }
      break;
    }
    case 'bamboo': {
      const n = 3 + Math.floor(rng() * 3);
      for (let i = 0; i < n; i++) {
        const h = rng.range(7, 10.5);
        const x = (i - n / 2) * .55 + rng.range(-.15, .15);
        const col = leafCols[i % leafCols.length];
        const stalk = new THREE.Mesh(G.cyl, mat(mix(col, '#d9cf9a', .35)));
        stalk.scale.set(.11, h, .11); stalk.position.set(x, h / 2, rng.range(-.4, .4));
        stalk.castShadow = true;
        stalk.userData.base = stalk.position.clone(); stalk.userData.s0 = stalk.scale.clone();
        stalk.userData.phase = rng() * 9; stalk.userData.hf = clamp(h / 9, .6, 1.2);
        g.add(stalk); leaves.push(stalk);
        for (let k = 0; k < 3; k++) {
          const lf = new THREE.Mesh(G.blobLo, mat(col));
          lf.scale.set(.5, .1, .22);
          lf.position.set(x + rng.range(-.4, .4), rng.range(h * .5, h - .3), .2);
          lf.rotation.z = rng.range(-.6, .6);
          lf.userData.base = lf.position.clone(); lf.userData.s0 = lf.scale.clone();
          lf.userData.phase = rng() * 9; lf.userData.hf = 1;
          g.add(lf); leaves.push(lf);
        }
      }
      break;
    }
    case 'giantshroom': {
      const h = 3.4;
      const stem = new THREE.Mesh(G.cyl, mat('#e9dfd2'));
      stem.scale.set(.5, h, .5); stem.position.y = h / 2; stem.castShadow = true; g.add(stem);
      const cap = new THREE.Mesh(G.sphere, mat('#d96d6d', { emissive: '#ffb3a0', emissiveI: .12 }));
      cap.scale.set(2, .9, 1.9); cap.position.y = h;
      cap.userData.base = cap.position.clone(); cap.userData.s0 = cap.scale.clone();
      cap.userData.phase = rng() * 9; cap.userData.hf = 1;
      cap.castShadow = true; g.add(cap); leaves.push(cap);
      for (let i = 0; i < 5; i++) { // spots
        const s = new THREE.Mesh(G.sphere, mat('#f7e9dc'));
        s.scale.set(.28, .1, .28);
        s.position.set(rng.range(-1.2, 1.2), h + .8, rng.range(-.9, .9));
        g.add(s);
      }
      break;
    }
    case 'cactus': {
      const h = 3.6;
      const col = mix('#5a9c6e', theme.top || '#7c6656', .15);
      const body = new THREE.Mesh(G.cyl, mat(col)); body.scale.set(.42, h, .42); body.position.y = h / 2;
      body.castShadow = true; g.add(body);
      const top = new THREE.Mesh(G.sphere, mat(col)); top.scale.set(.42, .5, .42); top.position.y = h; g.add(top);
      for (let side = -1; side <= 1; side += 2) {
        if (rng() < .3) continue;
        const armY = rng.range(1.4, 2.4);
        const arm = new THREE.Group();
        const hz = new THREE.Mesh(G.cyl, mat(col)); hz.scale.set(.22, .8, .22); hz.rotation.z = Math.PI / 2; hz.position.x = .4;
        const vt = new THREE.Mesh(G.cyl, mat(col)); vt.scale.set(.22, 1.1, .22); vt.position.set(.8, .55, 0);
        arm.add(hz, vt); arm.position.set(0, armY, side * .25);
        arm.castShadow = true; g.add(arm);
      }
      break;
    }
    case 'bush': {
      const n = 3;
      for (let i = 0; i < n; i++)
        addBlob(g, (i - 1) * .55 + rng.range(-.1, .1), .45 + (i === 1 ? .3 : 0), rng.range(-.3, .3),
          rng.range(.6, .95), leafCols[i % leafCols.length], .8, 0);
      break;
    }
    case 'fern': {
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i - 2) * .5;
        const fr = new THREE.Mesh(G.blobLo, mat(mix(leafCols[0], '#4c7a3d', .3)));
        fr.scale.set(.8, .12, .25); fr.position.set(Math.cos(a) * .5, .45, rng.range(-.2, .2));
        fr.rotation.z = a + Math.PI / 2;
        fr.userData.base = fr.position.clone(); fr.userData.s0 = fr.scale.clone();
        fr.userData.phase = rng() * 9; fr.userData.hf = .8;
        g.add(fr); leaves.push(fr);
      }
      break;
    }
    case 'reeds': {
      for (let i = 0; i < 6; i++) {
        const h = rng.range(.9, 1.7);
        const x = rng.range(-.6, .6);
        const stalk = new THREE.Mesh(G.cyl, mat('#7a9455'));
        stalk.scale.set(.03, h, .03); stalk.position.set(x, h / 2, rng.range(-.2, .2));
        stalk.userData.base = stalk.position.clone(); stalk.userData.s0 = stalk.scale.clone();
        stalk.userData.phase = rng() * 9; stalk.userData.hf = 1.1;
        g.add(stalk); leaves.push(stalk);
        const tip = new THREE.Mesh(G.blobLo, mat('#b9a06b'));
        tip.scale.set(.09, .28, .09); tip.position.set(x, h + .1, stalk.position.z);
        tip.userData = { base: tip.position.clone(), s0: tip.scale.clone(), phase: rng() * 9, hf: 1.1 };
        g.add(tip); leaves.push(tip);
      }
      break;
    }
    case 'lavender': {
      for (let i = 0; i < 4; i++) {
        const h = rng.range(.5, 1);
        const x = rng.range(-.5, .5);
        const stalk = new THREE.Mesh(G.cyl, mat('#7d9a55'));
        stalk.scale.set(.025, h, .025); stalk.position.set(x, h / 2, 0);
        stalk.userData = { base: stalk.position.clone(), s0: stalk.scale.clone(), phase: rng() * 9, hf: .9 };
        g.add(stalk); leaves.push(stalk);
        const bud = new THREE.Mesh(G.blobLo, mat('#9b7fc7'));
        bud.scale.set(.1, .3, .1); bud.position.set(x, h + .12, 0);
        bud.userData = { base: bud.position.clone(), s0: bud.scale.clone(), phase: rng() * 9, hf: .9 };
        g.add(bud); leaves.push(bud);
      }
      break;
    }
    case 'flowers': {
      const cols = ['#f2789f', '#f9c74f', '#90be6d', '#f8961e', '#c77dff'];
      for (let i = 0; i < 5; i++) {
        const x = rng.range(-.5, .5), h = rng.range(.25, .55);
        const st = new THREE.Mesh(G.cyl, mat('#7d9a55'));
        st.scale.set(.02, h, .02); st.position.set(x, h / 2, rng.range(-.15, .15));
        st.userData = { base: st.position.clone(), s0: st.scale.clone(), phase: rng() * 9, hf: .7 };
        g.add(st); leaves.push(st);
        const f = new THREE.Mesh(G.blobLo, mat(cols[i % cols.length]));
        f.scale.set(.11, .11, .06); f.position.set(x, h, st.position.z);
        f.userData = { base: f.position.clone(), s0: f.scale.clone(), phase: rng() * 9, hf: .7 };
        g.add(f); leaves.push(f);
      }
      break;
    }
    case 'tallgrass': {
      for (let i = 0; i < 7; i++) {
        const h = rng.range(.6, 1.2), x = rng.range(-.6, .6);
        const bl = new THREE.Mesh(G.blobLo, mat(mix(leafCols[0], '#c9d96a', .3)));
        bl.scale.set(.06, h, .06); bl.position.set(x, h / 2, rng.range(-.2, .2));
        bl.rotation.z = rng.range(-.15, .15);
        bl.userData = { base: bl.position.clone(), s0: bl.scale.clone(), phase: rng() * 9, hf: .8 };
        g.add(bl); leaves.push(bl);
      }
      break;
    }
    case 'mushroom': {
      const st = new THREE.Mesh(G.cyl, mat('#e9dfd2'));
      st.scale.set(.16, .5, .16); st.position.y = .25; g.add(st);
      const cap = new THREE.Mesh(G.sphere, mat('#d96d6d'));
      cap.scale.set(.42, .3, .4); cap.position.y = .55;
      cap.userData = { base: cap.position.clone(), s0: cap.scale.clone(), phase: rng() * 9, hf: .6 };
      g.add(cap); leaves.push(cap);
      break;
    }
    case 'pumpkin': {
      const body = new THREE.Mesh(G.sphere, mat('#e89b4f'));
      body.scale.set(.5, .4, .5); body.position.y = .4; body.castShadow = true; g.add(body);
      const st2 = new THREE.Mesh(G.cyl, mat('#6b7a45'));
      st2.scale.set(.06, .2, .06); st2.position.y = .85; g.add(st2);
      break;
    }
    case 'rock': {
      const r = new THREE.Mesh(G.blobLo, mat(jitterHex(mix('#9a9186', theme.deep || '#33282a', .25), rng, .08)));
      const s = rng.range(.8, 1.3);
      r.scale.set(s, s * .62, s * .9); r.position.y = s * .3;
      r.rotation.y = rng() * 6; r.castShadow = true; r.receiveShadow = true; g.add(r);
      if (rng() < .4) {
        const r2 = new THREE.Mesh(G.blobLo, r.material);
        r2.scale.setScalar(s * .4); r2.position.set(s * .8, s * .1, .2); r2.castShadow = true; g.add(r2);
      }
      break;
    }
    case 'gravestone': {
      const st = new THREE.Mesh(G.box, mat(mix('#8d8a84', theme.deep || '#33282a', .3)));
      st.scale.set(.8, 1.2, .22); st.position.y = .6; st.rotation.z = rng.range(-.06, .06);
      st.castShadow = true; g.add(st);
      const cap = new THREE.Mesh(G.cylinder, mat(st.material.color));
      cap.scale.set(.4, .22, .4); cap.rotation.x = Math.PI / 2; cap.rotation.z = Math.PI / 2;
      cap.scale.set(.4, .22, .22); cap.position.y = 1.2; g.add(cap);
      break;
    }
    case 'pillar': {
      const st = new THREE.Mesh(G.cyl, mat(mix('#b0a89a', theme.deep || '#33282a', .25)));
      st.scale.set(.35, 3, .35); st.position.y = 1.5; st.castShadow = true; g.add(st);
      const cap = new THREE.Mesh(G.box, mat(st.material.color));
      cap.scale.set(1, .25, 1); cap.position.y = 3.1; cap.castShadow = true; g.add(cap);
      const base = new THREE.Mesh(G.box, mat(st.material.color));
      base.scale.set(1.1, .3, 1.1); base.position.y = .15; g.add(base);
      break;
    }
    case 'crystal': {
      const col = '#b9a0ff';
      const main = new THREE.Mesh(G.octa, mat(col, { emissive: '#8f7ae0', emissiveI: .5, rough: .3, opacity: .92 }));
      main.scale.set(.5, 1.1, .5); main.position.y = 1; main.castShadow = true; g.add(main);
      for (let i = 0; i < 3; i++) {
        const c = new THREE.Mesh(G.octa, main.material);
        c.scale.set(.22, .5, .22);
        c.position.set(rng.range(-.6, .6), rng.range(.3, .8), rng.range(-.4, .4));
        c.rotation.z = rng.range(-.4, .4); c.castShadow = true; g.add(c);
      }
      break;
    }
    case 'barrel': {
      const b = new THREE.Mesh(G.cyl, mat('#8a5a34'));
      b.scale.set(.42, 1, .42); b.position.y = .5; b.castShadow = true; g.add(b);
      for (const yy of [.25, .75]) {
        const ring = new THREE.Mesh(G.cyl, mat('#4a4a4a', { metal: .4, rough: .5 }));
        ring.scale.set(.44, .07, .44); ring.position.y = yy; g.add(ring);
      }
      break;
    }
    case 'crate': {
      const c = new THREE.Mesh(G.box, mat('#b98d5a'));
      c.scale.set(.95, .9, .95); c.position.y = .45; c.rotation.y = rng.range(-.3, .3);
      c.castShadow = true; g.add(c);
      const edge = new THREE.Mesh(G.box, mat('#9a7248'));
      edge.scale.set(1, .12, .22); edge.position.set(0, .88, .38); g.add(edge);
      break;
    }
    case 'lamp': {
      const post = new THREE.Mesh(G.cyl, mat('#4a4f57', { metal: .3, rough: .6 }));
      post.scale.set(.07, 2.6, .07); post.position.y = 1.3; post.castShadow = true; g.add(post);
      const head = new THREE.Mesh(G.sphere, mat('#ffe6b0', { emissive: '#ffd98a', emissiveI: 1.2 }));
      head.scale.set(.3, .3, .3); head.position.y = 2.7; g.add(head);
      const light = new THREE.PointLight('#ffd98a', 8, 12, 2);
      light.position.y = 2.7; g.add(light);
      break;
    }
    case 'lantern': {
      const post = new THREE.Mesh(G.box, mat('#7a5a3a'));
      post.scale.set(.12, 2.2, .12); post.position.y = 1.1; post.castShadow = true; g.add(post);
      const box = new THREE.Mesh(G.box, mat('#ffcf9a', { emissive: '#ffb36b', emissiveI: 1.1 }));
      box.scale.set(.4, .5, .4); box.position.y = 2.35; g.add(box);
      const light = new THREE.PointLight('#ffb36b', 5, 9, 2);
      light.position.y = 2.35; g.add(light);
      break;
    }
  }

  const def = PROP_DEFS[kind];
  g.userData = {
    kind, hp: def.hp, maxHp: def.hp, leaves, swayers, dead: false,
    wob: 0, wobV: 0, radius: def.w * .38, tall: def.h,
    x: 0, y: 0, scale: 1,
  };
  return g;
}
function leafColors2(cols, i) { return cols[i % cols.length]; }

/* ------------------ wind animation for a prop's leaves ------------------ */
const _w = { x: 0, y: 0, z: 0 };
export function animateProp(p, t, camX) {
  const u = p.userData;
  if (u.dead || Math.abs(p.position.x - camX) > 70) return;
  // hit wobble spring
  if (u.wob !== 0 || u.wobV !== 0) {
    u.wobV += -u.wob * 60 * .016 - u.wobV * 6 * .016;
    u.wob += u.wobV;
    p.rotation.z = u.wob * .08;
  }
  for (const l of u.leaves) {
    const d = l.userData;
    Wind.at(p.position.x + d.base.x, p.position.y + d.base.y, _w);
    const g = _w.x, fl = .8 + .5 * Math.sin(t * 2.1 + d.phase) + .3 * Math.sin(t * 3.7 + d.phase * 2);
    const push = g * d.hf * fl;
    // move
    l.position.x = d.base.x + push * .38;
    l.position.y = d.base.y + Math.abs(push) * .1 + Math.sin(t * 1.9 + d.phase) * .04 * d.hf;
    l.position.z = d.base.z + Math.sin(t * 1.3 + d.phase) * .03;
    // rotate
    l.rotation.z = (l.rotation.z * 0 + -push * .16) + Math.sin(t * 2.6 + d.phase) * .05;
    l.rotation.x = Math.sin(t * 1.1 + d.phase) * .04;
    // resize (stretch into the wind, squash sideways)
    const st = clamp(Math.abs(push) * .18, 0, .35);
    l.scale.x = d.s0.x * (1 + st);
    l.scale.y = d.s0.y * (1 - st * .5);
    l.scale.z = d.s0.z * (1 + st * .3);
  }
  for (const s of u.swayers) {
    Wind.at(p.position.x, p.position.y + 4, _w);
    const g = _w.x;
    if (s.userData.a !== undefined) { // palm frond
      s.rotation.z = -.4 - Math.abs(g) * .2 + Math.sin(t * 1.6 + s.userData.phase) * .06 + g * .12;
    } else { // willow strand joint
      s.rotation.z = g * .1 + Math.sin(t * 1.8 + (s.position.x)) * .04;
    }
  }
}

/* --------------------- world population (groves etc) --------------------- */
export function populateWorld(world, theme) {
  const rng = makeRNG(world.seed ^ 0x9e3779b9);
  const list = (world.biome.props || []).slice();
  if (!list.length) list.push(['oak', 1], ['bush', .4], ['rock', .2]);
  const trees = list.filter(k => PROP_DEFS[k[0]]?.tree);
  const smalls = list.filter(k => PROP_DEFS[k[0]]?.small);
  const things = list.filter(k => !PROP_DEFS[k[0]]?.tree && !PROP_DEFS[k[0]]?.small);
  const props = [];
  const ok = (x, kind, extra = .8) => {
    const h = world.h(x);
    if (world.inWater(x, h)) return false;
    for (const p of props) if (Math.abs(p.position.x - x) < (PROP_DEFS[p.userData.kind].w + PROP_DEFS[kind].w) * .5 * extra) return false;
    return true;
  };
  const place = (kind, x, s = 1) => {
    const p = buildProp(kind, rng, theme);
    const h = world.h(x);
    p.position.set(x, h - .15, rng.range(-4, 4) * .6);
    p.scale.setScalar(s);
    p.userData.x = x; p.userData.y = h; p.userData.scale = s;
    world.group.add(p); props.push(p);
    return p;
  };
  // groves: lead tree + companions + plants at their feet
  const nClusters = 10;
  let tries = 0, made = 0;
  while (trees.length && made < nClusters && tries++ < 300) {
    const x = rng.range(-HALF_P + 8, HALF_P - 8);
    const kind = pickW(rng, trees);
    if (!ok(x, kind)) continue;
    place(kind, x, rng.range(.85, 1.15));
    made++;
    const comp = Math.floor(rng() * 3);
    for (let k = 0; k < comp; k++) {
      const dx = (rng() < .5 ? -1 : 1) * (PROP_DEFS[kind].w * (.6 + rng() * .5));
      const xx = x + dx;
      if (xx < -HALF_P + 6 || xx > HALF_P - 6 || !ok(xx, kind)) continue;
      place(rng() < .75 ? kind : pickW(rng, trees), xx, rng.range(.6, .9));
    }
    // feet plants
    for (let k = 0; k < 3; k++) {
      if (!smalls.length) break;
      const xx = x + rng.range(-4, 4);
      if (!ok(xx, 'bush', .3)) continue;
      place(pickW(rng, smalls), xx, rng.range(.8, 1.3));
    }
  }
  // loose things
  for (let i = 0; i < 12; i++) {
    if (!things.length) break;
    const x = rng.range(-HALF_P + 6, HALF_P - 6);
    if (!ok(x, 'rock')) continue;
    place(pickW(rng, things), x, rng.range(.8, 1.2));
  }
  // scattered smalls
  for (let i = 0; i < 16; i++) {
    if (!smalls.length) break;
    const x = rng.range(-HALF_P + 4, HALF_P - 4);
    if (!ok(x, 'bush', .25)) continue;
    place(pickW(rng, smalls), x, rng.range(.8, 1.4));
  }
  return props;
}
const HALF_P = 74;
function pickW(rng, list) {
  let sum = 0; for (const l of list) sum += l[1];
  let r = rng() * sum;
  for (const l of list) { r -= l[1]; if (r <= 0) return l[0]; }
  return list[0][0];
}
