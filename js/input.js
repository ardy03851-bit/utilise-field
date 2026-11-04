/* input.js — unified keyboard / mouse / touch controls.
   Touch layout (iPad):
     left half  → floating move stick
     right half → floating aim stick (hold to auto-fire)
     buttons    → jump / switch / dig (rendered by ui.js, hit-tested here)
   Keyboard: A/D or ←→ move, W/↑/Space jump, mouse aim, click / hold fire,
             Q or 1/2 switch weapon, E or S dig, Esc pause. */

import { clamp } from './core.js';
import * as THREE from 'three';

export const Input = {
  keys: {}, mouse: { x: 0, y: 0, down: false },
  isTouch: false,
  move: { x: 0, y: 0 },          // -1..1
  aim: { x: 1, y: 0 },           // unit vector, screen space
  aimActive: false,
  fire: false, jump: false, jumpPressed: false, switchPressed: false, dig: false, pausePressed: false,
  _jumpBuf: 0, _switchBuf: 0, _pauseBuf: 0,
  sticks: { move: null, aim: null }, // active touch sticks
  buttons: [],                     // ui.js registers 3D buttons here: {x,y,r,press()}
  _touches: new Map(),
  _el: null,

  init(el) {
    this._el = el;
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    addEventListener('keydown', e => {
      if (e.repeat) return;
      this.keys[e.code] = true;
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') { this._jumpBuf = .12; e.preventDefault(); }
      if (e.code === 'KeyQ' || e.code === 'Digit1' || e.code === 'Digit2') this._switchBuf = .12;
      if (e.code === 'Escape') this._pauseBuf = .12;
    });
    addEventListener('keyup', e => this.keys[e.code] = false);
    el.addEventListener('pointerdown', e => this._down(e));
    el.addEventListener('pointermove', e => this._move(e));
    addEventListener('pointerup', e => this._up(e));
    addEventListener('pointercancel', e => this._up(e));
    // mouse aim
    el.addEventListener('pointermove', e => {
      if (e.pointerType === 'mouse') { this.mouse.x = e.clientX; this.mouse.y = e.clientY; }
    });
    el.addEventListener('contextmenu', e => e.preventDefault());
  },

  _down(e) {
    // 3D buttons get first chance (mouse and touch)
    for (const b of this.buttons) {
      const hw = b.hw ?? b.r ?? 0, hh = b.hh ?? b.r ?? 0;
      if (Math.abs(e.clientX - b.x) < hw && Math.abs(e.clientY - b.y) < hh) { b.press(e.clientX, e.clientY); this._mouseBtn = { btn: b, id: e.pointerId }; return; }
    }
    if (e.pointerType === 'mouse') { this.mouse.down = true; this.mouse.x = e.clientX; this.mouse.y = e.clientY; return; }
    this._touches.set(e.pointerId, { x: e.clientX, y: e.clientY, ox: e.clientX, oy: e.clientY });
    const W = innerWidth;
    if (e.clientX < W * .45 && !this.sticks.move) this.sticks.move = e.pointerId;
    else if (!this.sticks.aim) { this.sticks.aim = e.pointerId; this.aimActive = true; }
  },
  _move(e) {
    const t = this._touches.get(e.pointerId); if (!t) return;
    t.x = e.clientX; t.y = e.clientY;
  },
  _up(e) {
    if (this._mouseBtn && (e.pointerType === 'mouse' || e.pointerId === this._mouseBtn.id)) {
      this._mouseBtn.btn.release && this._mouseBtn.btn.release();
      this._mouseBtn = null;
    }
    if (e.pointerType === 'mouse') { this.mouse.down = false; return; }
    const t = this._touches.get(e.pointerId);
    this._touches.delete(e.pointerId);
    if (t && t.btn) { t.btn.release && t.btn.release(); return; }
    if (this.sticks.move === e.pointerId) this.sticks.move = null;
    if (this.sticks.aim === e.pointerId) { this.sticks.aim = null; this.aimActive = false; }
  },

  /* Called every frame before gameplay logic. */
  update(dt, camera, renderer) {
    // keyboard move
    let mx = 0;
    if (this.keys.KeyA || this.keys.ArrowLeft) mx -= 1;
    if (this.keys.KeyD || this.keys.ArrowRight) mx += 1;
    // touch move stick
    let jx = 0, jy = 0;
    if (this.sticks.move != null) {
      const t = this._touches.get(this.sticks.move);
      if (t) { jx = clamp((t.x - t.ox) / 56, -1, 1); jy = clamp((t.y - t.oy) / 56, -1, 1); }
    }
    this.move.x = Math.abs(mx) > .01 ? mx : jx;
    this.move.y = jy;
    // aim
    if (this.sticks.aim != null) {
      const t = this._touches.get(this.sticks.aim);
      if (t) {
        const dx = t.x - t.ox, dy = t.y - t.oy, l = Math.hypot(dx, dy);
        if (l > 8) { this.aim.x = dx / l; this.aim.y = dy / l; }
        this.fire = true;
      }
    } else if (!this.isTouch) {
      // mouse aim → world direction (unprojected to z=0 plane)
      const ndc = new THREE.Vector3((this.mouse.x / innerWidth) * 2 - 1, -(this.mouse.y / innerHeight) * 2 + 1, .5);
      ndc.unproject(camera);
      const dir = ndc.sub(camera.position).normalize();
      if (Math.abs(dir.x) > .02) { const l = Math.hypot(dir.x, dir.y); this.aim.x = dir.x / l; this.aim.y = dir.y / l; }
      this.fire = this.mouse.down;
    }
    if (!this.isTouch && this.sticks.aim == null && !this.mouse.down) this.fire = false;
    this.dig = !!(this.keys.KeyE || this.keys.KeyS || this.keys.ArrowDown);
    // buffered presses
    this.jumpPressed = this._jumpBuf > 0; this._jumpBuf = Math.max(0, this._jumpBuf - dt);
    this.switchPressed = this._switchBuf > 0; this._switchBuf = Math.max(0, this._switchBuf - dt);
    this.pausePressed = this._pauseBuf > 0; this._pauseBuf = Math.max(0, this._pauseBuf - dt);
    this.jump = !!(this.keys.Space || this.keys.ArrowUp || this.keys.KeyW || this.keys.KeyZ) || this._btn('jump');
  },
  _btn(id) { const b = this.buttons.find(b => b.id === id); return b ? b.held : false; },
  pressBtn(id) {
    if (id === 'jump') this._jumpBuf = .12;
    else if (id === 'switch') this._switchBuf = .12;
  },
};
