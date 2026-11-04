/* main.js — boot & state flow:
   boot → menu (title) → [fly-through] → settings → arena
                     ↘ wardrobe ↗
   Handles the render loop, quality settings, and transitions. */

import * as THREE from 'three';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { Content } from './registry.js';
import { SAVES } from './saves.js';
import { Menu } from './menu.js';
import { Wardrobe } from './wardrobe.js';
import { Arena } from './arena.js';
import { Wind } from './wind.js';

const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, .1, 600);
Input.init(renderer.domElement);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerHeight ? innerWidth / innerHeight : 1;
  camera.updateProjectionMatrix();
});

const state = {
  mode: 'boot',   // boot | menu | wardrobe | game
  menu: null, wardrobe: null, arena: null,
  scene: null,
};
window.__state = state;

const clock = new THREE.Clock();
let last = 0;

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(.05, clock.getDelta());
  const t = clock.elapsedTime;
  Input.update(dt, state.mode === 'game' ? state.arena.camera : (state.menu?.camera ?? camera), renderer);
  if (state.mode === 'boot') return;

  if (state.mode === 'menu') {
    state.menu.update(dt, Input);
    state.menu.render();
  } else if (state.mode === 'wardrobe') {
    state.wardrobe.update(dt, Input);
    state.wardrobe.render();
  } else if (state.mode === 'game') {
    const a = state.arena;
    if (Input.pausePressed && a.state === 'playing') a.togglePause();
    else if (Input.pausePressed && a.state === 'paused') a.togglePause();
    a.update(dt, Input);
    renderer.render(a.scene, a.camera);
    a.ui.render(renderer);
    // fps guard: if we drop badly, reduce pixel ratio once
    guardPerf(dt);
  }
}
let perfT = 0, perfFrames = 0, perfAdjusted = false;
function guardPerf(dt) {
  perfT += dt; perfFrames++;
  if (perfT > 3) {
    const fps = perfFrames / perfT;
    if (fps < 40 && !perfAdjusted && renderer.getPixelRatio() > 1) {
      renderer.setPixelRatio(1);
      perfAdjusted = true;
    }
    perfT = 0; perfFrames = 0;
  }
}

/* ------------------------------ transitions ------------------------------ */
addEventListener('uf-start', e => {
  const { biome, botCount, quality } = e.detail;
  startGame(biome, { botCount, quality });
});
addEventListener('uf-wardrobe', () => {
  Audio.init();
  state.wardrobe = new Wardrobe(renderer);
  state.mode = 'wardrobe';
});
addEventListener('uf-menu', () => {
  if (state.arena) { state.arena.dispose(); state.arena = null; }
  state.menu.state = 'settings';
  state.menu._buildSettingsScene();
  state.menu._buildTitleUI();
  state.mode = 'menu';
  state.wardrobe = null;
});
addEventListener('uf-restart', () => {
  if (state.arena) {
    const opts = state.arena.opts, biome = state.arena.biome;
    state.arena.dispose();
    startGame(biome, opts);
  }
});

async function startGame(biome, opts) {
  Audio.init();
  applyQuality(opts.quality);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(biome.skyB ?? '#fdf3e3', 60, 170);
  const cam = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, .1, 600);
  const arena = new Arena(renderer, scene, cam, biome, opts);
  state.scene = scene;
  state.arena = arena;
  state.mode = 'game';
  await arena.init();
}

function applyQuality(q) {
  renderer.shadowMap.enabled = q !== 'low';
  renderer.setPixelRatio(q === 'low' ? 1 : q === 'medium' ? 1.35 : Math.min(devicePixelRatio, 1.75));
}

/* ------------------------------ boot ------------------------------ */
(async function boot() {
  const msg = document.getElementById('bootmsg');
  try {
    msg.textContent = 'growing trees…';
    await Content.load();
    msg.textContent = 'folding scarves…';
    SAVES.load();
    Audio.setMuted(!SAVES.settings().sound);
    state.menu = new Menu(renderer);
    state.mode = 'menu';
    document.getElementById('boot').classList.add('hide');
  } catch (e) {
    console.error(e);
    msg.textContent = 'something went wrong — ' + e.message;
  }
})();

requestAnimationFrame(loop);
