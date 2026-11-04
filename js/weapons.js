/* weapons.js — weapons live in weapons/<id>/manifest.json + weapon.png
   (add a folder, regenerate the manifest with tools/make-manifest.js, done).
   The PNG is rendered on a real 3D quad with a soft drop shadow, a rim glow
   that pulses with muzzle flash, recoil kick and a walk bob — never a flat
   DOM image. The shovel is built from actual 3D geometry (it's a tool, not a
   picture) and digs the terrain. */

import * as THREE from 'three';
import { clamp, damp, WEAPONS } from './core.js';

const CUBE_OFFSET = .95;
const texCache = new Map();

export const SHOVEL_FALLBACK = {
  id: 'shovel', name: 'Shovel', kind: 'shovel', dmg: 20, rate: 1.8, speed: 10,
  color: '#cfd6dc', order: 999,
};

export async function loadTex(url) {
  if (texCache.has(url)) return texCache.get(url);
  const tex = await new THREE.TextureLoader().loadAsync(url);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  texCache.set(url, tex);
  return tex;
}

export class WeaponRig {
  constructor(character) {
    this.ch = character;
    this.group = new THREE.Group();
    character.add(this.group);
    this.group.position.set(0, .1, CUBE_OFFSET);
    this.current = null;
    this.recoil = 0; this.flash = 0; this.bobT = 0;
    this.swing = 0;
    this.cool = 0;
    this.gun = null; this.gunMat = null; this.shadow = null;
  }

  /* Equip a weapon definition (entry from the WEAPONS registry). */
  async equip(def) {
    this.current = def;
    while (this.group.children.length) this.group.remove(this.group.children[0]);
    this.gun = null; this.gunMat = null; this.shadow = null;
    if (!def) return;
    if (def.kind === 'shovel') this._buildShovel();
    else await this._buildGun(def);
  }

  async _buildGun(def) {
    let tex;
    try { tex = await loadTex(def.png); } catch (e) { console.warn('weapon png missing', def.id); return; }
    const aspect = tex.image.width / tex.image.height;
    const w = 2, h = w / aspect;
    const mat = new THREE.MeshStandardMaterial({
      map: tex, transparent: true, alphaTest: .15, roughness: .85,
      emissive: new THREE.Color(def.color ?? '#ffd98a'), emissiveMap: tex, emissiveIntensity: 0,
      side: THREE.DoubleSide,
    });
    this.gunMat = mat;
    const gun = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    gun.castShadow = true;
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({
      map: tex, transparent: true, opacity: .2, color: 0x2a2018, depthWrite: false,
    }));
    sh.position.set(.1, -.12, -.03);
    this.group.add(sh, gun);
    this.gun = gun; this.shadow = sh;
  }

  _buildShovel() {
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: '#a97c50', roughness: .8 });
    const metal = new THREE.MeshStandardMaterial({ color: '#cfd6dc', roughness: .4, metalness: .5 });
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, 1.5, 8), wood);
    handle.position.y = .1; handle.castShadow = true;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(.065, .065, .22, 8), new THREE.MeshStandardMaterial({ color: '#7a5238', roughness: .9 }));
    grip.position.y = .8;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(.42, .5, .06), metal);
    blade.position.y = -.75; blade.castShadow = true;
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(.21, .21, .06, 10), metal);
    tip.rotation.x = Math.PI / 2; tip.position.y = -1;
    g.add(handle, grip, blade, tip);
    this.group.add(g);
    this.gun = g; this.gunMat = null; this.shadow = null;
  }

  /* Fire: returns {bullets:[...]} or {shovel:true} — caller spawns vfx. */
  fire() {
    const def = this.current;
    if (!def || this.cool > 0) return null;
    this.cool = 1 / def.rate;
    this.recoil = 1; this.flash = 1;
    if (def.kind === 'shovel') { this.swing = 1; return { shovel: true }; }
    const out = [];
    const pellets = def.pellets ?? 1;
    for (let i = 0; i < pellets; i++) {
      const spread = (def.spread ?? .04) * (Math.random() - .5) * 2;
      const a = this.ch.aimAngle + spread;
      out.push({
        x: this.ch.pos.x + Math.cos(a) * 1.1,
        y: this.ch.pos.y + .35 + Math.sin(a) * .3,
        vx: Math.cos(a) * def.speed,
        vy: Math.sin(a) * def.speed,
        dmg: def.dmg, id: def.id, color: def.color ?? '#ffd98a',
        radius: def.blast ?? 0,
      });
    }
    return { bullets: out };
  }

  update(dt) {
    this.cool = Math.max(0, this.cool - dt);
    this.recoil = damp(this.recoil, 0, 9, dt);
    this.flash = damp(this.flash, 0, 14, dt);
    this.swing = damp(this.swing, 0, 7, dt);
    const moving = Math.abs(this.ch.vel.x) > 1 && this.ch.onGround;
    this.bobT += dt * (moving ? 9 : 2.4);
    const bob = moving ? Math.sin(this.bobT) * .05 : Math.sin(this.bobT) * .015;
    if (!this.gun) return;
    const fx = this.ch.facing;
    this.group.position.x = fx * CUBE_OFFSET - fx * this.recoil * .28;
    this.group.position.y = .1 + bob;
    if (this.gun.isMesh) {
      // PNG gun: flip horizontally to match facing, recoil tilts it up
      this.gun.scale.x = Math.abs(this.gun.scale.x) * (fx > 0 ? 1 : -1);
      this.gun.rotation.z = -fx * .1 - fx * this.recoil * .16;
      this.gun.position.z = .05;
      if (this.shadow) {
        this.shadow.scale.x = Math.abs(this.shadow.scale.x) * (fx > 0 ? 1 : -1);
        this.shadow.position.x = fx * .1;
      }
      if (this.gunMat) this.gunMat.emissiveIntensity = this.flash * .85;
    } else {
      // shovel: rest over the shoulder, swing arc when digging
      this.group.rotation.z = fx * (.65 - this.swing * 1.9);
      this.group.position.x = fx * CUBE_OFFSET;
    }
  }
}

/* Pick a random gun id for round start (shovel excluded). */
export function randomGun(rng) {
  const guns = WEAPONS.filter(w => w.kind !== 'shovel');
  if (!guns.length) return null;
  return guns[Math.floor(rng() * guns.length)].id;
}
