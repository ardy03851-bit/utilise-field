/* ui.js — a real 3D user interface (no DOM, no fake CSS "3d").
   Buttons & panels are actual rounded-box models floating over the game,
   with very thin outlines that dash around the border (thin segments that
   get cut off and start again — the classic toon outline look).
   Everything animates with springs: press squash, hover tilt, slide-ins.

   UI3D   — the reusable 3D overlay (scene + ortho camera + widget kit)
   GameUI — gameplay HUD built from it (health, wave, weapon card, banner,
            touch buttons, pause & game-over panels) */

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Input } from './input.js';
import { clamp, damp } from './core.js';
import { Audio } from './audio.js';
import { WEAPONS } from './core.js';
import { loadTex } from './weapons.js';

const INK = '#4a3f36';
const CREAM = '#f7efe3';

/* ---------------------------------------------------------------- UI3D ---- */
export class UI3D {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -200, 200);
    // lights so the 3D slabs shade nicely
    this.scene.add(new THREE.AmbientLight('#ffffff', 1.15));
    const dir = new THREE.DirectionalLight('#fff5e6', 1.6);
    dir.position.set(.4, 1, 1);
    this.scene.add(dir);
    const dir2 = new THREE.DirectionalLight('#d9e8f0', .5);
    dir2.position.set(-.6, -.3, .6);
    this.scene.add(dir2);
    this.resize();
    this.widgets = [];
    this._listeners = new Map();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.camera.left = -w / 2; this.camera.right = w / 2;
    this.camera.top = h / 2; this.camera.bottom = -h / 2;
    this.camera.updateProjectionMatrix();
  }

  render(renderer) {
    renderer.autoClear = false;
    renderer.render(this.scene, this.camera);
    renderer.autoClear = true;
  }

  clear() {
    for (const wd of [...this.widgets]) this.remove(wd);
    this.widgets.length = 0;
  }
  remove(wd) {
    wd.group.parent?.remove(wd.group);
    if (wd.inputBtn) {
      const i = Input.buttons.indexOf(wd.inputBtn);
      if (i >= 0) Input.buttons.splice(i, 1);
    }
    const k = this.widgets.indexOf(wd);
    if (k >= 0) this.widgets.splice(k, 1);
  }
  on(evt, fn) { this._listeners.set(evt, fn); }
  emit(evt) { const f = this._listeners.get(evt); f && f(); }

  /* ------------------------------ widget kit ------------------------------ */
  button(opts) {
    // opts: x,y,w,h, label, icon, color, id, round, small, onHold
    const { x, y, w, h } = opts;
    const g = new THREE.Group();
    const color = opts.color ?? CREAM;
    const slab = new THREE.Mesh(new RoundedBoxGeometry(w, h, 14, 3, 6), new THREE.MeshStandardMaterial({
      color, roughness: .55,
    }));
    slab.castShadow = true;
    g.add(slab);
    const outline = dashedFrame(w, h, opts.dashCol ?? '#4a3f36');
    outline.position.z = 7.6;
    g.add(outline);
    if (opts.icon) {
      const icon = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w, h) * .52, Math.min(w, h) * .52), new THREE.MeshBasicMaterial({
        map: iconTexture(opts.icon), transparent: true,
      }));
      icon.position.z = 9.2;
      if (opts.label) { // icon left, label right of it
        icon.scale.multiplyScalar(.72);
        icon.position.x = -w / 2 + Math.min(w, h) * .52 * .36 + 14;
      }
      g.add(icon);
    }
    if (opts.label) {
      const map = textTexture(opts.label, { size: opts.small ? 30 : 44, color: INK });
      const txt = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
        map, transparent: true,
      }));
      // match the plane to the canvas aspect (avoid stretched text)
      const scale = Math.min((w * .86) / (map.image.width / 2), (h * .52) / (map.image.height / 2));
      txt.scale.set(map.image.width / 2 * scale, map.image.height / 2 * scale, 1);
      if (opts.icon) { // shift right of the icon, shrink if needed
        const iconW = Math.min(w, h) * .52 * .72;
        const maxLw = w - iconW - 44;
        if (txt.scale.x > maxLw) txt.scale.multiplyScalar(maxLw / txt.scale.x);
        txt.position.x = -w / 2 + iconW + 28 + txt.scale.x / 2;
      }
      txt.position.z = 9.2;
      g.add(txt);
    }
    g.position.set(x, y, opts.z ?? 0);
    this.scene.add(g);
    const wd = {
      group: g, slab, type: 'button', x, y, w, h,
      baseScale: 1, tScale: 1, hover: 0, pressT: 0, appear: 0,
    };
    {
      const sx = innerWidth / 2 + x, sy = innerHeight / 2 - y;
      wd.inputBtn = {
        id: opts.id ?? opts.emit ?? null, x: sx, y: sy, hw: w / 2 + 8, hh: h / 2 + 8,
        press: (cx, cy) => {
          wd.pressT = 1; Audio.click(); (wd.onTap ?? opts.onTap)?.();
          if (opts.onHold) wd.inputBtn.held = true;
          if (opts.id === 'jump') Input._jumpBuf = .12;      // buffered jump
          if (opts.onHold) return;               // hold buttons don't fire on tap
          this.emit(opts.emit ?? opts.id);
        },
        release: () => { if (wd.inputBtn) wd.inputBtn.held = false; },
        held: false,
      };
      Input.buttons.push(wd.inputBtn);
    }
    this.widgets.push(wd);
    return wd;
  }

  panel(opts) {
    const { x, y, w, h } = opts;
    const g = new THREE.Group();
    const slab = new THREE.Mesh(new RoundedBoxGeometry(w, h, 18, 4, 12), new THREE.MeshStandardMaterial({
      color: opts.color ?? CREAM, roughness: .6, transparent: true, opacity: .96,
    }));
    g.add(slab);
    const outline = dashedFrame(w, h, opts.dashCol ?? '#4a3f36');
    outline.position.z = 10;
    g.add(outline);
    g.position.set(x, y, 0);
    this.scene.add(g);
    const wd = { group: g, slab, type: 'panel', appear: 0, y };
    this.widgets.push(wd);
    return wd;
  }

  text(str, opts) {
    const g = new THREE.Group();
    const t = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
      map: textTexture(str, opts), transparent: true,
    }));
    const scale = opts.scale ?? 1;
    const img = t.material.map.image;
    t.scale.set(img.width / 2 * scale, img.height / 2 * scale, 1);
    g.add(t);
    g.position.set(opts.x ?? 0, opts.y ?? 0, opts.z ?? 14);
    this.scene.add(g);
    const wd = { group: g, type: 'text', appear: 1 };
    this.widgets.push(wd);
    return wd;
  }

  image(url, opts) {
    const g = new THREE.Group();
    const wd = { group: g, type: 'image', appear: 0, y: opts.y ?? 0 };
    loadTex(url).then(tex => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
      const scale = opts.scale ?? 1;
      m.scale.set(tex.image.width / 2 * scale, tex.image.height / 2 * scale, 1);
      g.add(m);
      wd.map = m;
    });
    g.position.set(opts.x ?? 0, opts.y ?? 0, 5);
    this.scene.add(g);
    this.widgets.push(wd);
    return wd;
  }

  update(dt) {
    for (const wd of this.widgets) {
      if (wd.type === 'button') {
        wd.pressT = damp(wd.pressT, 0, 10, dt);
        const s = wd.baseScale * (1 - wd.pressT * .12);
        wd.group.scale.set(s, s, 1);
        wd.slab.position.z = -wd.pressT * 6;
      }
      if (wd.appear < 1) {
        wd.appear = clamp(wd.appear + dt * 2.4, 0, 1);
        const e = 1 - Math.pow(1 - wd.appear, 3);
        wd.group.position.y = (wd.y ?? wd.group.position.y) - (1 - e) * 60;
        wd.group.scale.setScalar(.7 + .3 * e);
        wd.group.visible = wd.appear > 0;
      }
    }
  }
}

/* dashed outline frame: thin segments around the border with gaps */
/* NOTE: the dig/jump hold-buttons are wired through Input.buttons (see button()) */
function dashedFrame(w, h, color = '#4a3f36') {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color });
  const t = 2.2;                       // very thin
  const segLen = 11, gap = 7;
  const per = (len) => Math.max(1, Math.floor(len / (segLen + gap)));
  const dash = (x, y, ww, hh) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(ww, hh, t), mat);
    m.position.set(x, y, 0);
    g.add(m);
  };
  for (const sy of [-1, 1]) {
    const n = per(w);
    for (let i = 0; i < n; i++) {
      const x0 = -w / 2 + (i + .5) * (w / n);
      if ((i % 2) === 0) dash(x0, sy * (h / 2 - t / 2), segLen, t);
    }
  }
  for (const sx of [-1, 1]) {
    const n = per(h);
    for (let i = 0; i < n; i++) {
      const y0 = -h / 2 + (i + .5) * (h / n);
      if ((i % 2) === 0) dash(sx * (w / 2 - t / 2), y0, t, segLen);
    }
  }
  return g;
}

/* --------------------------- canvas textures --------------------------- */
/* each texture gets its own canvas (sharing one canvas would corrupt
   earlier textures when redrawn) */
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.min(w, 1024));
  c.height = Math.max(2, Math.min(h, 512));
  return c;
}

export function textTexture(str, opts = {}) {
  const size = opts.size ?? 44;
  const font = `${opts.weight ?? 800} ${size}px ui-rounded, "SF Pro Rounded", "Segoe UI", system-ui, sans-serif`;
  const probe = makeCanvas(4, 4).getContext('2d');
  probe.font = font;
  const pad = size * .4;
  const lines = String(str).split('\n');
  const wMax = Math.max(...lines.map(l => probe.measureText(l).width));
  const canvas = makeCanvas(Math.ceil(wMax + pad * 2), Math.ceil(lines.length * size * 1.25 + pad));
  const tctx = canvas.getContext('2d');
  tctx.font = font;
  tctx.textAlign = 'center'; tctx.textBaseline = 'middle';
  if (opts.stroke) {
    tctx.strokeStyle = opts.stroke; tctx.lineWidth = size * .16; tctx.lineJoin = 'round';
    lines.forEach((l, i) => tctx.strokeText(l, canvas.width / 2, pad / 2 + size * .6 + i * size * 1.25));
  }
  tctx.fillStyle = opts.color ?? INK;
  lines.forEach((l, i) => tctx.fillText(l, canvas.width / 2, pad / 2 + size * .6 + i * size * 1.25));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function iconTexture(kind, opts = {}) {
  const s = 128;
  const canvas = makeCanvas(s, s);
  const tctx = canvas.getContext('2d');
  tctx.fillStyle = opts.color ?? INK;
  tctx.strokeStyle = opts.color ?? INK;
  tctx.lineWidth = 10; tctx.lineCap = 'round'; tctx.lineJoin = 'round';
  const c = s / 2;
  switch (kind) {
    case 'play': tctx.beginPath(); tctx.moveTo(c - 18, c - 28); tctx.lineTo(c + 30, c); tctx.lineTo(c - 18, c + 28); tctx.closePath(); tctx.fill(); break;
    case 'pause': tctx.fillRect(c - 22, c - 28, 14, 56); tctx.fillRect(c + 8, c - 28, 14, 56); break;
    case 'gear':
      tctx.save(); tctx.translate(c, c);
      for (let i = 0; i < 8; i++) { tctx.rotate(Math.PI / 4); tctx.fillRect(-7, -52, 14, 20); }
      tctx.restore();
      tctx.beginPath(); tctx.arc(c, c, 26, 0, 7); tctx.lineWidth = 12; tctx.stroke(); break;
    case 'jump': tctx.beginPath(); tctx.moveTo(c - 26, c + 16); tctx.lineTo(c, c - 22); tctx.lineTo(c + 26, c + 16); tctx.stroke(); break;
    case 'swap': tctx.beginPath(); tctx.moveTo(c - 24, c - 10); tctx.lineTo(c + 14, c - 10); tctx.moveTo(c + 8, c - 20); tctx.lineTo(c + 20, c - 10); tctx.lineTo(c + 8, c); tctx.moveTo(c + 24, c + 10); tctx.lineTo(c - 14, c + 10); tctx.moveTo(c - 8, c); tctx.lineTo(c - 20, c + 10); tctx.lineTo(c - 8, c + 20); tctx.stroke(); break;
    case 'shovel':
      tctx.save(); tctx.translate(c, c); tctx.rotate(-.7);
      tctx.lineWidth = 12; tctx.beginPath(); tctx.moveTo(0, -34); tctx.lineTo(0, 18); tctx.stroke();
      tctx.beginPath(); tctx.moveTo(-20, 18); tctx.lineTo(20, 18); tctx.lineTo(14, 44); tctx.quadraticCurveTo(0, 52, -14, 44); tctx.closePath(); tctx.fill();
      tctx.lineWidth = 9; tctx.beginPath(); tctx.moveTo(-12, -44); tctx.lineTo(12, -44); tctx.stroke();
      tctx.restore(); break;
    case 'close': tctx.beginPath(); tctx.moveTo(c - 18, c - 18); tctx.lineTo(c + 18, c + 18); tctx.moveTo(c + 18, c - 18); tctx.lineTo(c - 18, c + 18); tctx.stroke(); break;
    case 'back': tctx.beginPath(); tctx.moveTo(c + 16, c - 22); tctx.lineTo(c - 16, c); tctx.lineTo(c + 16, c + 22); tctx.closePath(); tctx.fill(); break;
    case 'left': tctx.beginPath(); tctx.moveTo(c + 16, c - 24); tctx.lineTo(c - 16, c); tctx.lineTo(c + 16, c + 24); tctx.closePath(); tctx.fill(); break;
    case 'right': tctx.beginPath(); tctx.moveTo(c - 16, c - 24); tctx.lineTo(c + 16, c); tctx.lineTo(c - 16, c + 24); tctx.closePath(); tctx.fill(); break;
    case 'sound': tctx.beginPath(); tctx.moveTo(c - 24, c - 8); tctx.lineTo(c - 10, c - 8); tctx.lineTo(c + 2, c - 22); tctx.lineTo(c + 2, c + 22); tctx.lineTo(c - 10, c + 8); tctx.lineTo(c - 24, c + 8); tctx.closePath(); tctx.fill(); tctx.beginPath(); tctx.arc(c + 10, c, 14, -.9, .9); tctx.stroke(); break;
    case 'mute': tctx.beginPath(); tctx.moveTo(c - 24, c - 8); tctx.lineTo(c - 10, c - 8); tctx.lineTo(c + 2, c - 22); tctx.lineTo(c + 2, c + 22); tctx.lineTo(c - 10, c + 8); tctx.lineTo(c - 24, c + 8); tctx.closePath(); tctx.fill(); tctx.lineWidth = 8; tctx.beginPath(); tctx.moveTo(c + 12, c - 14); tctx.lineTo(c + 30, c + 14); tctx.moveTo(c + 30, c - 14); tctx.lineTo(c + 12, c + 14); tctx.stroke(); break;
    case 'cube':
      tctx.save(); tctx.translate(c, c);
      tctx.fillStyle = '#f7b98b'; roundRect(tctx, -34, -34, 68, 68, 16); tctx.fill();
      tctx.fillStyle = '#e86a6a'; tctx.beginPath(); tctx.moveTo(-36, -36); tctx.quadraticCurveTo(0, -30, 10, -6); tctx.quadraticCurveTo(2, 14, -36, 20); tctx.closePath(); tctx.fill();
      tctx.restore(); break;
    case 'skullc':
      tctx.fillStyle = '#8a7460'; roundRect(tctx, -30, -30, 60, 60, 14); tctx.fill(); tctx.fillStyle = '#f7efe3'; tctx.beginPath(); tctx.arc(-10, -6, 7, 0, 7); tctx.fill(); tctx.beginPath(); tctx.arc(12, -6, 7, 0, 7); tctx.fill(); tctx.fillRect(-6, 10, 12, 4); break;
    case 'heart':
      tctx.fillStyle = '#e86a6a'; tctx.beginPath();
      tctx.moveTo(c, c + 26); tctx.bezierCurveTo(c - 42, c - 4, c - 18, c - 40, c, c - 14);
      tctx.bezierCurveTo(c + 18, c - 40, c + 42, c - 4, c, c + 26); tctx.fill(); break;
    case 'shirt':
      tctx.beginPath(); tctx.moveTo(c - 26, c - 18); tctx.lineTo(c - 8, c - 26); tctx.lineTo(c + 8, c - 26); tctx.lineTo(c + 26, c - 18); tctx.lineTo(c + 18, c + 2); tctx.lineTo(c + 10, c - 2); tctx.lineTo(c + 10, c + 30); tctx.lineTo(c - 10, c + 30); tctx.lineTo(c - 10, c - 2); tctx.lineTo(c - 18, c + 2); tctx.closePath(); tctx.fill(); break;
    case 'random':
      tctx.beginPath(); tctx.moveTo(c - 24, c - 16); tctx.lineTo(c - 4, c - 16); tctx.lineTo(c - 10, c - 24); tctx.moveTo(c - 4, c - 16); tctx.lineTo(c - 10, c - 8); tctx.moveTo(c - 24, c - 16); tctx.lineTo(c - 24, c + 16); tctx.lineTo(c + 4, c + 16); tctx.moveTo(c + 24, c + 16); tctx.lineTo(c + 4, c + 16); tctx.moveTo(c + 18, c + 8); tctx.lineTo(c + 26, c + 16); tctx.lineTo(c + 18, c + 24); tctx.moveTo(c + 24, c - 14); tctx.lineTo(c + 2, c + 14); tctx.moveTo(c + 16, c - 20); tctx.lineTo(c + 26, c - 14); tctx.lineTo(c + 18, c - 6); tctx.stroke(); break;
    case 'trophy':
      tctx.beginPath(); tctx.moveTo(c - 22, c - 26); tctx.lineTo(c + 22, c - 26); tctx.lineTo(c + 16, c + 4); tctx.quadraticCurveTo(c, c + 16, c - 16, c + 4); tctx.closePath(); tctx.fill();
      tctx.fillRect(c - 4, c + 14, 8, 10); tctx.fillRect(c - 14, c + 24, 28, 6); break;
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

/* ---------------------------------------------------------------- GameUI ---- */
export class UI extends UI3D {
  constructor(game, camera, renderer) {
    super();
    this.game = game;
    this.weapons = WEAPONS;
    this._weaponDefs = new Map();
    this._touch = Input.isTouch;
    this._buildHUD();
  }

  get weapons2() { return WEAPONS; }
  async weaponDef(id) {
    if (id === 'shovel') return SHOVEL_DEF;
    if (!this._weaponDefs.has(id)) this._weaponDefs.set(id, WEAPONS.find(w => w.id === id));
    return this._weaponDefs.get(id);
  }

  _buildHUD() {
    const W = innerWidth, H = innerHeight;
    const m = 26;
    // health bar (top-left)
    this.hpPanel = this.panel({ x: -W / 2 + 150, y: H / 2 - 60, w: 240, h: 58 });
    this.hpBarBg = new THREE.Mesh(new THREE.BoxGeometry(200, 22, 6), new THREE.MeshBasicMaterial({ color: 0x5a4a3f }));
    this.hpBarBg.position.set(-26, 0, 12); this.hpPanel.group.add(this.hpBarBg);
    this.hpBar = new THREE.Mesh(new THREE.BoxGeometry(200, 22, 8), new THREE.MeshBasicMaterial({ color: 0xf2789f }));
    this.hpBar.position.set(-26, 0, 14); this.hpPanel.group.add(this.hpBar);
    const heart = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ map: iconTexture('heart'), transparent: true }));
    heart.position.set(-108, 0, 12); this.hpPanel.group.add(heart);
    // wave / bots (top-right)
    this.waveText = this.text('Wave 1', { x: W / 2 - 150, y: H / 2 - 46, size: 40 });
    this.botsText = this.text('4 bots left', { x: W / 2 - 150, y: H / 2 - 90, size: 30, color: '#8a7460' });
    // kills
    this.killText = this.text('0', { x: -W / 2 + 70, y: H / 2 - 130, size: 30, color: '#8a7460' });
    // weapon card (bottom-left)
    this.weaponCard = this.panel({ x: -W / 2 + 170, y: -H / 2 + 90, w: 260, h: 120 });
    this.weaponIcon = new THREE.Mesh(new THREE.PlaneGeometry(190, 76), new THREE.MeshBasicMaterial({ transparent: true }));
    this.weaponIcon.position.set(-10, 16, 12); this.weaponCard.group.add(this.weaponIcon);
    this.weaponName = this.text('—', { x: -W / 2 + 170, y: -H / 2 + 52, size: 26, color: '#8a7460' });
    this.slotHint = this.text('Q / tap to swap · E to dig', { x: -W / 2 + 175, y: -H / 2 + 200, size: 22, color: '#8a7460', stroke: '#f7efe3' });
    // pause button (top-center-right)
    this.pauseBtn = this.button({ x: W / 2 - 60, y: H / 2 - 60, w: 64, h: 64, icon: 'pause', id: 'pauseBtn', emit: 'pause' });
    if (this._touch) {
      // touch controls
      const bx = W / 2 - 120, by = -H / 2 + 170;
      this.jumpBtn = this.button({ x: bx, y: by, w: 110, h: 110, icon: 'jump', color: '#fbd9a0', id: 'jump', onHold: true });
      this.swapBtn = this.button({ x: bx - 130, y: by - 30, w: 84, h: 84, icon: 'swap', color: '#cfe3f2', id: 'switch' });
      this.digBtn = this.button({ x: bx - 120, y: by + 110, w: 84, h: 84, icon: 'shovel', color: '#d9ecc9', id: 'dig', onHold: true });
    }
    this.refreshHUD();
  }

  refreshHUD() {
    const g = this.game;
    const p = g.player;
    if (!p) return;
    const f = clamp(p.hp / p.maxHp, 0, 1);
    this.hpBar.scale.x = Math.max(f, .001);
    this.hpBar.position.x = -26 - (1 - f) * 100;
    this.waveText.group.visible = true;
    // rebuild text textures only when values change
    const wl = `Wave ${g.wave}`;
    const bl = `${g.bots.filter(b => !b.dead).length + g.spawnQueue} bots left`;
    const kl = `${g.kills} kills`;
    if (this._wl !== wl) { this._wl = wl; this._setText(this.waveText, wl, 40); }
    if (this._bl !== bl) { this._bl = bl; this._setText(this.botsText, bl, 30, '#8a7460'); }
    if (this._kl !== kl) { this._kl = kl; this._setText(this.killText, kl, 30, '#8a7460'); }
    const def = g.playerRig?.current;
    if (def && this._wpn !== def.id) {
      this._wpn = def.id;
      this._setText(this.weaponName, def.name ?? def.id, 26, '#8a7460');
      if (def.kind === 'shovel') {
        this.weaponIcon.material.map = iconTexture('shovel', { color: '#6b5642' });
        this.weaponIcon.material.needsUpdate = true;
      } else if (def.png) {
        loadTex(def.png).then(tex => { this.weaponIcon.material.map = tex; this.weaponIcon.material.needsUpdate = true; });
      }
    }
  }
  _setText(wd, str, size, color) {
    wd.group.children[0].material.map = textTexture(str, { size, color });
    const img = wd.group.children[0].material.map.image;
    wd.group.children[0].scale.set(img.width / 2, img.height / 2, 1);
    wd.group.children[0].material.needsUpdate = true;
  }

  banner(title, sub) {
    if (this._banner) { this.remove(this._banner.panel); this.remove(this._banner.title); if (this._banner.sub) this.remove(this._banner.sub); }
    const H = innerHeight;
    const panel = this.panel({ x: 0, y: H * .22, w: Math.min(560, innerWidth - 80), h: 130 });
    const t = this.text(title, { x: 0, y: H * .22 + 18, size: 64, z: 16 });
    const s = this.text(sub, { x: 0, y: H * .22 - 32, size: 30, color: '#8a7460', z: 16 });
    this._banner = { panel, title: t, sub: s, t: 0 };
  }

  showPause(show) {
    if (show && !this._pausePanel) {
      const items = [];
      const p = this.panel({ x: 0, y: 40, w: 420, h: 380 });
      items.push(p);
      items.push(this.text('Paused', { x: 0, y: 160, size: 58 }));
      items.push(this.button({ x: 0, y: 60, w: 280, h: 76, label: 'Resume', emit: 'pause' }));
      items.push(this.button({ x: 0, y: -30, w: 280, h: 76, label: 'Restart', emit: 'restart' }));
      items.push(this.button({ x: 0, y: -120, w: 280, h: 76, label: 'Main menu', emit: 'menu' }));
      this._pausePanel = items;
    } else if (!show && this._pausePanel) {
      this._pausePanel.forEach(w => this.remove(w));
      this._pausePanel = null;
    }
  }

  gameOver(kills, wave) {
    if (this._goPanel) return;
    const items = [];
    const p = this.panel({ x: 0, y: 30, w: 460, h: 460 });
    items.push(p);
    items.push(this.text('Game over', { x: 0, y: 190, size: 60 }));
    items.push(this.text(`${kills} kills · wave ${wave}`, { x: 0, y: 130, size: 32, color: '#8a7460' }));
    items.push(this.button({ x: 0, y: 20, w: 300, h: 80, label: 'Play again', emit: 'restart' }));
    items.push(this.button({ x: 0, y: -80, w: 300, h: 80, label: 'Main menu', emit: 'menu' }));
    this._goPanel = items;
  }

  update(dt) {
    super.update(dt);
    if (this._banner) {
      this._banner.t += dt;
      if (this._banner.t > 2.6) {
        this.remove(this._banner.panel); this.remove(this._banner.title); this.remove(this._banner.sub);
        this._banner = null;
      }
    }
  }

  /* touch dig button held state (arena reads this) */
  digHeld() { return !!(this.digBtn?.inputBtn?.held); }
}

export const SHOVEL_DEF = {
  id: 'shovel', name: 'Shovel', kind: 'shovel', dmg: 20, rate: 1.8, speed: 10,
  color: '#cfd6dc', order: 999,
};
