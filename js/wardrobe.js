/* wardrobe.js — the customisation island.
   From the menu, the camera smoothly repositions here: a tiny randomly
   generated island (a tree, a few bushes) with your cube standing on it,
   scarf blowing in the wind — a live preview. The UI lets you recolour the
   body and the scarf (solid or multi-stop gradients), adjust scarf length,
   and randomise the whole look. Saved to localStorage. */

import * as THREE from 'three';
import { makeRNG } from './core.js';
import { makeSky, makeIsland } from './diorama.js';
import { UI3D } from './ui.js';
import { Character } from './character.js';
import { Audio } from './audio.js';
import { SAVES } from './saves.js';
import { Wind } from './wind.js';

const BODY_COLORS = ['#f7e9d7', '#f7d9c4', '#f7e3b5', '#e3f0d9', '#d9e8f0', '#e8def5', '#f5d9e8', '#d9f0e8', '#f0e8d9', '#f5c9c2'];
const SCARF_COLORS = ['#e86a6a', '#f2a65a', '#f9c74f', '#90be6d', '#5bc0eb', '#7c9cf0', '#c77dff', '#f2789f', '#f4978e', '#7fd6b5', '#f8961e', '#b56576'];

export class Wardrobe {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, .1, 500);
    this.ui = new UI3D();
    this.t = 0;
    this._rng = makeRNG((Math.random() * 1e9) | 0);
    this._entering = 0;
    this._build();
    addEventListener('resize', () => this.camera.aspect = innerWidth / innerHeight);
  }

  _build() {
    // lights
    const hemi = new THREE.HemisphereLight('#fff5e6', '#c8b8a0', 1.1);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight('#ffedd0', 2);
    sun.position.set(-12, 22, 16);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    this.scene.add(sun);
    // sky + island (random every time)
    const biome = pickWardrobeBiome();
    Wind.set(biome);
    this.sky = makeSky(this.scene, biome, this._rng);
    this.island = makeIsland(this.scene, biome, this._rng, { propCount: 6, propRadius: 12, avoid: { x: 0, z: 4, r: 7 } });
    // preview character
    const look = SAVES.look();
    this.char = new Character({ h: x => .4, inWater: () => false, slope: () => 0, ripple: () => { } }, {
      x: 0, body: look.body, scarf: look.scarf, hp: 1,
    });
    this.char.pos.set(0, .4, 0);
    this.scene.add(this.char);
    // camera flies in
    this.camFrom = new THREE.Vector3(0, 26, 52);
    this.camTo = new THREE.Vector3(0, 5.5, 13.5);
    this._entering = 0;
    this._buildUI();
  }

  _buildUI() {
    const ui = this.ui;
    ui.clear();
    const H = innerHeight, W = innerWidth;
    const look = SAVES.look();
    ui.on('back', () => window.dispatchEvent(new CustomEvent('uf-menu')));
    ui.on('random', () => this.randomise());
    ui.on('reRoll', () => this.regenerate());
    ui.panel({ x: 0, y: H / 2 - 62, w: 380, h: 100 });
    ui.text('Wardrobe', { x: 0, y: H / 2 - 60, size: 52 });

    // soft panel behind the swatch column so it reads over the island
    ui.panel({ x: -W / 2 + 215, y: H / 2 - 350, w: 400, h: 500, color: '#f0e4cc' });
    ui.text('Body', { x: -W / 2 + 130, y: H / 2 - 135, size: 30 });
    BODY_COLORS.forEach((col, i) => {
      const b = ui.button({
        x: -W / 2 + 60 + (i % 5) * 64, y: H / 2 - 210 - Math.floor(i / 5) * 64,
        w: 50, h: 50, color: col, id: 'body' + i, z: 12,
      });
      b.slab.material.color.set(col);
      b.group.userData.col = col;
      b.onTap = () => this.setBody(col);
    });
    // scarf gradient stops: two stacked rows of swatches (start / end)
    ui.text('Scarf', { x: -W / 2 + 130, y: H / 2 - 370, size: 30 });
    SCARF_COLORS.forEach((col, i) => {
      for (const [row, stop, label] of [[0, 0, 'start'], [1, 1, 'end']]) {
        if (i === 0) ui.text(label, { x: -W / 2 + 130, y: H / 2 - 428 - row * 66, size: 20, color: '#8a7460' });
        const b = ui.button({
          x: -W / 2 + 60 + (i % 6) * 64, y: H / 2 - 462 - row * 66,
          w: 50, h: 50, color: col, id: `scarf${row}_${i}`, z: 12,
        });
        b.slab.material.color.set(col);
        b.onTap = () => this.setScarfStop(stop, col);
      }
    });
    // actions
    ui.button({ x: 0, y: -H / 2 + 218, w: 240, h: 80, label: 'Random', icon: 'random', emit: 'random' });
    ui.button({ x: 0, y: -H / 2 + 132, w: 240, h: 70, label: 'New island', icon: 'cube', emit: 'reRoll' });
    ui.button({ x: 0, y: -H / 2 + 50, w: 240, h: 70, label: 'Done', icon: 'back', emit: 'back' });
  }

  setBody(col) {
    const look = SAVES.look();
    look.body = col;
    SAVES.setLook(look);
    this.char.setBodyColor(col);
    Audio.click();
  }
  setScarfStop(stop, col) {
    const look = SAVES.look();
    look.scarf = [look.scarf[0], look.scarf[1] ?? look.scarf[0]];
    look.scarf[stop] = col;
    SAVES.setLook(look);
    this.char.setScarfGradient(look.scarf);
    Audio.click();
  }
  randomise() {
    const body = BODY_COLORS[(Math.random() * BODY_COLORS.length) | 0];
    const s1 = SCARF_COLORS[(Math.random() * SCARF_COLORS.length) | 0];
    let s2 = SCARF_COLORS[(Math.random() * SCARF_COLORS.length) | 0];
    if (Math.random() < .3) s2 = s1;
    const look = { body, scarf: [s1, s2], scarfLen: 13 };
    SAVES.setLook(look);
    this.char.setBodyColor(body);
    this.char.setScarfGradient(look.scarf);
    Audio.click();
  }
  regenerate() {
    // rebuild island with a new seed
    this._clearScene();
    this._build();
  }
  _clearScene() {
    while (this.scene.children.length) this.scene.remove(this.scene.children.pop());
  }

  update(dt, input) {
    this.t += dt;
    Wind.update(dt);
    this.sky.update(dt, this.t, this.camera.position.x);
    this.island.update(this.t, this.camera.position.x);
    // character idle: breathing jelly + scarf physics
    this.char.jellyV += Math.sin(this.t * 2.4) * .5;
    this.char.update(dt, { moveX: 0 }, this.t);
    // smooth camera entrance
    if (this._entering < 1) {
      this._entering = Math.min(1, this._entering + dt / 1.6);
      const e = 1 - Math.pow(1 - this._entering, 3);
      this.camera.position.lerpVectors(this.camFrom, this.camTo, e);
    } else {
      this.camera.position.x = Math.sin(this.t * .3) * .8;
      this.camera.position.y = this.camTo.y + Math.sin(this.t * .5) * .3;
      this.camera.position.z = this.camTo.z;
    }
    this.camera.lookAt(0, 1.8, 0);
    this.ui.update(dt);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
    this.ui.render(this.renderer);
  }
}

function pickWardrobeBiome() {
  const list = [
    { skyT: '#bfe3ff', skyB: '#fdf3e3', sun: '#fffaf2', cloud: '#ffffff', top: '#7fae6a', cap: '#9dc47e', mid: '#5c4a41', deep: '#33282a', water: '#7fa9c0', leaf: ['#7fae5a', '#93c46e', '#6a9c4a'], props: [['oak', 1], ['bush', .8], ['flowers', .6], ['rock', .3]], wind: .45 },
    { skyT: '#f5d6dc', skyB: '#fbf0e3', sun: '#fffaf2', cloud: '#ffffff', top: '#8fae6a', cap: '#a8c47e', mid: '#5c4a41', deep: '#33282a', water: '#f2c9d4', leaf: ['#f7b6c8', '#f39bb4', '#fde2ea'], props: [['cherry', 1], ['bush', .6], ['flowers', .8]], wind: .4 },
    { skyT: '#cfe8ff', skyB: '#eef7f0', sun: '#fffaf2', cloud: '#ffffff', top: '#86a65a', cap: '#9dc47e', mid: '#5c4a41', deep: '#33282a', water: '#8fc0d8', leaf: ['#86a65a', '#9dc47e', '#6a9c4a'], props: [['pine', 1], ['bush', .5], ['rock', .4]], wind: .5 },
  ];
  return list[(Math.random() * list.length) | 0];
}
