/* menu.js — the main menu.
   The title "utilise-field" is built from actual 3D rounded letter strokes
   floating over a pastel diorama. Pressing PLAY flies the camera forward,
   through the gap in the letter "d", out the other side into the settings
   diorama (biome / bots / quality), where START builds the arena.
   WARDROBE repositions the camera to the customisation island (wardrobe.js). */

import * as THREE from 'three';
import { makeRNG } from './core.js';
import { makeSky, makeIsland, makeTitle } from './diorama.js';
import { UI3D } from './ui.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { SAVES } from './saves.js';
import { BIOMES } from './core.js';
import { Wind } from './wind.js';

export class Menu {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, .1, 500);
    this.ui = new UI3D();
    this.state = 'title';
    this.t = 0;
    this._rng = makeRNG((Math.random() * 1e9) | 0);

    this._lights();
    this._buildTitleScene();
    this._buildTitleUI();
    addEventListener('resize', () => this.camera.aspect = innerWidth / innerHeight);
  }

  _lights() {
    const hemi = new THREE.HemisphereLight('#fff5e6', '#c8b8a0', 1.1);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight('#ffedd0', 2.1);
    sun.position.set(-14, 24, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -40; sun.shadow.camera.right = 40;
    sun.shadow.camera.top = 40; sun.shadow.camera.bottom = -40;
    this.scene.add(sun);
    this.sun = sun;
  }

  _buildTitleScene() {
    this.biome = BIOMES[(Math.random() * BIOMES.length) | 0] ?? {};
    Wind.set(this.biome);
    this.sky = makeSky(this.scene, this.biome, this._rng);
    this.island = makeIsland(this.scene, this.biome, this._rng, { propCount: 8 });
    this.title = makeTitle('utilise-field');
    this.title.group.position.set(0, 15, 0);
    // gentle float
    this.scene.add(this.title.group);
    this.titleBaseY = 15;
    this.camAngle = 0;
    this.fly = null;
  }

  _buildTitleUI() {
    const H = innerHeight;
    this.ui.clear();
    const ui = this.ui;
    ui.on('play', () => this.startFly());
    ui.on('wardrobe', () => window.dispatchEvent(new CustomEvent('uf-wardrobe')));
    ui.on('sound', () => this.toggleSound());
    ui.on('settings', () => this.showSettings());
    ui.on('back', () => { this.state = 'title'; this._buildTitleUI(); });
    ui.on('start', () => window.dispatchEvent(new CustomEvent('uf-start', { detail: this.collectSettings() })));
    ui.on('biomeL', () => this.cycleBiome(-1));
    ui.on('biomeR', () => this.cycleBiome(1));
    ui.on('bots-', () => this.stepBots(-1));
    ui.on('bots+', () => this.stepBots(1));
    ui.on('quality', () => this.cycleQuality());
    ui.on('menu-wardrobe', () => window.dispatchEvent(new CustomEvent('uf-wardrobe')));

    if (this.state === 'title') {
      ui.button({ x: 0, y: -H / 2 + 150, w: 280, h: 92, label: 'PLAY', icon: 'play', emit: 'play' });
      ui.button({ x: 0, y: -H / 2 + 48, w: 280, h: 70, label: 'Wardrobe', icon: 'shirt', emit: 'wardrobe' });
      const s = SAVES.settings();
      ui.button({ x: innerWidth / 2 - 70, y: innerHeight / 2 - 70, w: 64, h: 64, icon: s.sound ? 'sound' : 'mute', emit: 'sound', id: 'sndBtn' });
      ui.text(`best wave ${SAVES.stats().bestWave}`, { x: 0, y: -H / 2 + 220, size: 24, color: '#8a7460' });
    } else if (this.state === 'settings') {
      this._buildSettingsUI();
    }
  }

  _buildSettingsUI() {
    const ui = this.ui, W = innerWidth, H = innerHeight;
    ui.panel({ x: 0, y: H / 2 - 88, w: 400, h: 104 });
    ui.text('Settings', { x: 0, y: H / 2 - 90, size: 58 });
    // biome card
    ui.button({ x: -W / 2 + 70, y: H / 2 - 210, w: 64, h: 64, icon: 'back', emit: 'back' });
    const bx = 0, by = H / 2 - 200;
    ui.button({ x: bx - 210, y: by, w: 64, h: 64, icon: 'left', emit: 'biomeL' });
    ui.button({ x: bx + 210, y: by, w: 64, h: 64, icon: 'right', emit: 'biomeR' });
    ui.text(this.biome?.name ?? 'Biome', { x: bx, y: by + 46, size: 40 });
    ui.text('biome', { x: bx, y: by - 8, size: 22, color: '#8a7460' });
    // palette swatches
    const pal = [this.biome?.skyT ?? '#bfe3ff', this.biome?.top ?? '#7c6656', this.biome?.cap ?? '#86a65a', this.biome?.water ?? '#7fa9c0', this.biome?.leaf?.[0] ?? '#7fae5a'];
    pal.forEach((col, i) => {
      const sw = new THREE.Mesh(new THREE.BoxGeometry(26, 26, 8), new THREE.MeshStandardMaterial({ color: col, roughness: .6 }));
      sw.position.set(bx - 64 + i * 32, by - 52, 0);
      ui.scene.add(sw);
    });
    // bots
    const botsY = by - 150;
    ui.text('Bots', { x: bx, y: botsY + 30, size: 30 });
    ui.button({ x: bx - 90, y: botsY - 16, w: 64, h: 64, label: '–', emit: 'bots-' });
    ui.button({ x: bx + 90, y: botsY - 16, w: 64, h: 64, label: '+', emit: 'bots+' });
    this.botsText = ui.text(String(this.bots ?? SAVES.settings().bots), { x: bx, y: botsY - 16, size: 44 });
    // quality + sound
    const qY = botsY - 110;
    this.qualityBtn = ui.button({ x: bx - 110, y: qY, w: 200, h: 64, label: `Quality: ${SAVES.settings().quality}`, emit: 'quality' });
    ui.button({ x: bx + 110, y: qY, w: 200, h: 64, label: SAVES.settings().sound ? 'Sound on' : 'Sound off', emit: 'sound', id: 'sndBtn2' });
    // start
    ui.button({ x: 0, y: -H / 2 + 120, w: 320, h: 92, label: 'START', icon: 'play', emit: 'start' });
    ui.button({ x: 0, y: -H / 2 + 34, w: 320, h: 66, label: 'Wardrobe', icon: 'shirt', emit: 'menu-wardrobe' });
  }

  collectSettings() {
    const s = SAVES.settings();
    return {
      biome: this.biome,
      botCount: this.bots ?? s.bots,
      quality: s.quality,
    };
  }

  cycleBiome(dir) {
    const i = BIOMES.indexOf(this.biome);
    this.biome = BIOMES[(i + dir + BIOMES.length) % BIOMES.length] ?? this.biome;
    this._buildSettingsUI();
  }
  stepBots(d) {
    const s = SAVES.settings();
    this.bots = Math.min(12, Math.max(1, (this.bots ?? s.bots) + d));
    const s2 = { ...s, bots: this.bots };
    SAVES.setSettings(s2);
    this._buildSettingsUI();
  }
  cycleQuality() {
    const order = ['low', 'medium', 'high'];
    const s = SAVES.settings();
    const q = order[(order.indexOf(s.quality) + 1) % order.length];
    SAVES.setSettings({ ...s, quality: q });
    this._buildSettingsUI();
  }
  toggleSound() {
    const s = SAVES.settings();
    SAVES.setSettings({ ...s, sound: !s.sound });
    Audio.setMuted(!s.sound);
    this._buildTitleUI();
  }

  /* The PLAY fly-through: camera accelerates through the "d" counter. */
  startFly() {
    const t = this.title;
    const hole = new THREE.Vector3(t.hole.x, this.titleBaseY + t.hole.y, 0);
    this.fly = {
      t: 0, dur: 2.6,
      from: this.camera.position.clone(),
      fromLook: new THREE.Vector3(0, 8, 0),
      hole, done: false,
    };
    this.state = 'flying';
    this.ui.clear();
  }

  update(dt, input) {
    this.t += dt;
    Wind.update(dt);
    this.sky.update(dt, this.t, this.camera.position.x);
    this.island.update(this.t, this.camera.position.x);
    // title gentle bob + sway
    this.title.group.position.y = this.titleBaseY + Math.sin(this.t * .9) * .4;
    this.title.group.rotation.y = Math.sin(this.t * .4) * .06;
    this.title.scarf.rotation.z = .3 + Math.sin(this.t * 2.2) * .25 + Wind.base * Wind.dir * .6;
    this.title.cube.rotation.y = Math.sin(this.t * .7) * .3;

    if (this.state === 'title') {
      // slow drift
      this.camAngle += dt * .05;
      const r = 30;
      this.camera.position.set(Math.sin(this.camAngle) * r * .4, 14 + Math.sin(this.t * .3) * 1.2, 30 + Math.cos(this.camAngle) * 4);
      this.camera.lookAt(0, 10, 0);
    } else if (this.state === 'flying' && this.fly) {
      const f = this.fly;
      f.t += dt;
      const k = Math.min(f.t / f.dur, 1);
      // ease in (accelerate through the letter)
      const e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const p = new THREE.Vector3().lerpVectors(f.from, f.hole, Math.min(e * 1.15, 1));
      // pass through and beyond
      if (e > .85) p.z = f.hole.z - (e - .85) * 90;
      this.camera.position.copy(p);
      this.camera.lookAt(f.hole.x, f.hole.y + (1 - e) * 2, f.hole.z - 40 * e);
      if (k >= 1) {
        this.state = 'settings';
        this._buildSettingsScene();
        this._buildTitleUI();
      }
    } else if (this.state === 'settings') {
      const r = 34;
      this.camera.position.set(Math.sin(this.t * .04) * 6, 16 + Math.sin(this.t * .25) * .8, r);
      this.camera.lookAt(0, 6, 0);
    }
    this.ui.update(dt);
  }

  _buildSettingsScene() {
    // fresh diorama for the settings screen (different biome for variety)
    this._clearScene();
    this._rng = makeRNG((Math.random() * 1e9) | 0);
    const i = (Math.random() * BIOMES.length) | 0;
    this.biome = this.biome && this.biome.id !== 'random' ? this.biome : BIOMES[i] ?? this.biome;
    this.sky = makeSky(this.scene, this.biome, this._rng);
    this.island = makeIsland(this.scene, this.biome, this._rng, { propCount: 9 });
    this.camera.position.set(0, 16, 34);
  }

  _clearScene() {
    while (this.scene.children.length) {
      const c = this.scene.children.pop();
      this.scene.remove(c);
    }
    this._lights();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
    this.ui.render(this.renderer);
  }
}
