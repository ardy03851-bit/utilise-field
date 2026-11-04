/* diorama.js — little scene-kit used by the menu & wardrobe:
   - makeSky: gradient dome + sun + clouds
   - makeIsland: a floating pastel island (terrain top, dirt underside) with
     props scattered on it; randomly generated every call
   - makeTitle: the "utilise-field" logo built from actual rounded 3D letter
     strokes with an inverted-hull thin outline, plus the position of the
     letter gap the camera flies through */

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeRNG, mix, jitterHex } from './core.js';
import { buildProp } from './props.js';
import { Wind } from './wind.js';

export function makeSky(scene, biome, rng) {
  const skyGeo = new THREE.SphereGeometry(300, 20, 10);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(biome.skyT ?? '#bfe3ff') }, bot: { value: new THREE.Color(biome.skyB ?? '#fdf3e3') } },
    vertexShader: `varying float vY; void main(){ vY = normalize(position).y; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 bot; varying float vY;
      void main(){ float t = smoothstep(-.05,.4,vY); gl_FragColor = vec4(mix(bot,top,t),1.); }`
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.userData.update = (t, camX) => { sky.position.x = camX; };
  scene.add(sky);
  const sun = new THREE.Mesh(new THREE.CircleGeometry(10, 32), new THREE.MeshBasicMaterial({ color: biome.sun ?? '#fffaf2', fog: false }));
  sun.position.set(-70, 70, -220); sun.lookAt(0, 0, 0);
  scene.add(sun);
  // clouds
  const clouds = [];
  const cloudMat = new THREE.MeshStandardMaterial({ color: biome.cloud ?? '#ffffff', roughness: 1, transparent: true, opacity: .95 });
  for (let i = 0; i < 7; i++) {
    const g = new THREE.Group();
    const n = 3 + Math.floor(rng() * 3);
    for (let k = 0; k < n; k++) {
      const s = rng.range(2.5, 6);
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), cloudMat);
      m.position.set((k - n / 2) * rng.range(3, 5), rng.range(-.6, .9), rng.range(-1, 1));
      m.scale.set(s, s * .55, s * .7);
      g.add(m);
    }
    g.position.set(rng.range(-80, 80), rng.range(16, 30), -rng.range(30, 80));
    g.scale.setScalar(rng.range(.7, 1.5));
    clouds.push(g); scene.add(g);
  }
  return {
    sky, sun, clouds,
    update(dt, t, camX) {
      for (const c of clouds) {
        c.position.x += Wind.base * Wind.dir * dt * 1.4;
        if (Wind.dir > 0 && c.position.x > 100) c.position.x = -100;
        if (Wind.dir < 0 && c.position.x < -100) c.position.x = 100;
      }
    }
  };
}

export function makeIsland(scene, biome, rng, opts = {}) {
  const group = new THREE.Group();
  const top = biome.top ?? '#7c6656', mid = biome.mid ?? '#5c4a41', deep = biome.deep ?? '#33282a';
  // island top: squashed cylinder with wobbly edge
  const topGeo = new THREE.CylinderGeometry(14, 15.5, 3.5, 28, 1);
  const posAttr = topGeo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i), z = posAttr.getZ(i);
    const a = Math.atan2(z, x);
    const wob = 1 + Math.sin(a * 5 + rng() * 0) * .12 + Math.sin(a * 3) * .08;
    posAttr.setX(i, x * wob); posAttr.setZ(i, z * wob);
  }
  topGeo.computeVertexNormals();
  const island = new THREE.Mesh(topGeo, new THREE.MeshStandardMaterial({ color: top, roughness: .95 }));
  island.position.y = -1.75;
  island.receiveShadow = true; island.castShadow = true;
  group.add(island);
  // grass rim: slightly bigger thin disc
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(14.3, 14.6, .8, 28), new THREE.MeshStandardMaterial({ color: biome.cap ?? '#86a65a', roughness: .9 }));
  rim.position.y = .1; rim.receiveShadow = true;
  group.add(rim);
  // dirt underside: cone
  const under = new THREE.Mesh(new THREE.ConeGeometry(14.6, 13, 22), new THREE.MeshStandardMaterial({ color: deep, roughness: 1 }));
  under.rotation.x = Math.PI; under.position.y = -8.5;
  group.add(under);
  const under2 = new THREE.Mesh(new THREE.ConeGeometry(9, 7, 18), new THREE.MeshStandardMaterial({ color: mix(deep, mid, .4), roughness: 1 }));
  under2.rotation.x = Math.PI; under2.position.y = -16.5;
  group.add(under2);
  // water disc around
  if (opts.water !== false) {
    const water = new THREE.Mesh(new THREE.CircleGeometry(60, 40), new THREE.MeshStandardMaterial({
      color: biome.water ?? '#7fa9c0', roughness: .15, metalness: .1, transparent: true, opacity: .9,
    }));
    water.rotation.x = -Math.PI / 2; water.position.y = -4.5;
    group.add(water);
  }
  // props on the island
  const theme = { top, mid, deep, cap: biome.cap, leaf: biome.leaf, far: biome.far };
  const propKinds = opts.props ?? (biome.props || []).map(p => p[0]);
  const placed = [];
  const n = opts.propCount ?? 7;
  const av = opts.avoid;   // {x, z, r} keep-clear zone (e.g. in front of the camera)
  for (let i = 0; i < n; i++) {
    const kind = propKinds.length ? propKinds[Math.floor(rng() * propKinds.length)] : 'bush';
    let x, z, tries = 0;
    do {
      const a = rng() * Math.PI * 2, r = rng() * (opts.propRadius ?? 10.5);
      x = Math.cos(a) * r; z = Math.sin(a) * r;
    } while (++tries < 8 && (placed.some(p2 => Math.hypot(p2.position.x - x, p2.position.z - z) < 2.6)
      || (av && Math.hypot(x - av.x, z - av.z) < av.r)));
    if (tries >= 8) continue;
    const p = buildProp(kind, rng, theme);
    p.position.set(x, .35, z);
    const s = rng.range(.55, .95);
    p.scale.setScalar(s);
    p.userData.hf = 1;
    placed.push(p);
    group.add(p);
  }
  scene.add(group);
  return {
    group, props: placed,
    update(t, camX) {
      for (const p of this.props) animateDioramaProp(p, t);
    }
  };
}

function animateDioramaProp(p, t) {
  const u = p.userData;
  if (!u.leaves) return;
  const wind = Wind.at(p.position.x, p.position.y + 2, _w);
  for (const l of u.leaves) {
    const d = l.userData;
    const g = wind.x * (d.hf ?? 1);
    const fl = .8 + .4 * Math.sin(t * 2 + d.phase);
    l.position.x = d.base.x + g * fl * .35;
    l.position.y = d.base.y + Math.sin(t * 1.8 + d.phase) * .04;
    l.rotation.z = -g * fl * .14 + Math.sin(t * 2.4 + d.phase) * .05;
    const st = Math.min(Math.abs(g) * .15, .3);
    const s0 = d.s0 ?? { x: 1, y: 1 };
    l.scale.x = s0.x * (1 + st); l.scale.y = s0.y * (1 - st * .4);
  }
}
const _w = { x: 0, y: 0, z: 0 };

/* ------------------------------------------------------------------ */
/* The 3D title: "utilise-field" built from rounded stroke boxes.      */
const STROKE = 1.5;
const LW = 5.4, LH = 8.4;   // letter cell size (in strokes)

/* glyph strokes: [x, y, w, h] in stroke units, origin = letter bottom-left */
const GLYPHS = {
  u: [[0, 0, 1, 8], [4.4, 0, 1, 8], [0, 0, 5.4, 1]],
  t: [[2.2, 0, 1, 8], [0, 7.4, 5.4, 1], [.6, 4.4, 4.2, .9]],
  i: [[2.2, 0, 1, 7.4], [2.2, 8.2, 1, 1]],
  l: [[2.2, 0, 1, 8], [1, 0, 3, .9]],
  s: [[0, 7.4, 5.4, 1], [0, 4.4, 1, 3], [0, 3.8, 5.4, .9], [4.4, 1.4, 1, 2.4], [0, 0, 5.4, 1]],
  e: [[0, 7.4, 5.4, 1], [0, 0, 1, 8.4], [0, 3.9, 4.4, .9], [0, 0, 5.4, 1]],
  '-': [[.7, 4.2, 3.6, 1]],
  f: [[3.2, 0, 1, 8], [0, 7.4, 4.6, 1], [.8, 4.8, 4.2, .9]],
  d: [[4.4, 0, 1, 8.4], [0, 7.4, 4.4, 1], [0, 0, 4.4, 1], [0, 1, 1, 6.4]],
};

export function makeTitle(text = 'utilise-field', color = '#f7efe3', outline = '#4a3f36') {
  const g = new THREE.Group();
  const letters = [];
  let cx = 0;
  const gapHole = { x: 0, y: 0 };   // world-space centre of the "d" counter
  for (const ch of text) {
    const glyph = GLYPHS[ch];
    if (ch === '-') cx += 1.2;   // hyphen takes less room
    if (!glyph) { cx += LW + 1.2; continue; }
    const letter = new THREE.Group();
    for (const [gx, gy, gw, gh] of glyph) {
      const w = gw * STROKE, h = gh * STROKE;
      const box = new THREE.Mesh(
        new RoundedBoxGeometry(w, h, STROKE * 1.6, 3, STROKE * .45),
        new THREE.MeshStandardMaterial({ color, roughness: .5 })
      );
      box.position.set(gx * STROKE + w / 2 - (LW * STROKE) / 2, gy * STROKE + h / 2 - (LH * STROKE) / 2, 0);
      box.castShadow = true;
      letter.add(box);
    }
    letter.position.x = cx;
    if (ch === 'd') gapHole.x = cx;   // bowl counter centre
    g.add(letter);
    letters.push(letter);
    cx += LW + 1.2;
  }
  // centre the whole word
  const totalW = cx;
  g.children.forEach(l => { l.position.x -= totalW / 2; });
  gapHole.x -= totalW / 2;
  gapHole.y = 0;
  // scale the wordmark down to fit a ~30-unit view width
  const scale = Math.min(1, 30 / totalW);
  g.scale.setScalar(scale);
  gapHole.x *= scale; gapHole.y *= scale;
  // add a little cube mascot sitting on top of the "d"
  const cube = new THREE.Mesh(new RoundedBoxGeometry(1.6, 1.6, 1.6, 4, .32), new THREE.MeshStandardMaterial({ color: '#f7b98b', roughness: .5 }));
  cube.position.set(gapHole.x, LH * STROKE * scale / 2 + 1.1, 0);
  cube.castShadow = true;
  g.add(cube);
  const scarfMat = new THREE.MeshStandardMaterial({ color: '#e86a6a', roughness: .8 });
  const scarf = new THREE.Mesh(new THREE.BoxGeometry(2.2, .4, .24), scarfMat);
  scarf.position.set(cube.position.x - .3, cube.position.y + .75, .16);
  scarf.rotation.z = .3;
  g.add(scarf);
  return { group: g, width: totalW, hole: gapHole, letters, cube, scarf };
}
