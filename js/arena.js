/* arena.js — the single game mode: you vs waves of bots in a small destructible
   diorama. You always carry a shovel (slot 2) plus one random gun given at the
   start of the round (slot 1). Dig trenches, carve craters with explosives,
   blow up barrels, chop down trees — the terrain and props are all destructible.
   Kill every bot to clear the wave; a fresh squad spawns, slightly tougher. */

import * as THREE from 'three';
import { World, HALF, WATER_Y } from './world.js';
import { Character } from './character.js';
import { WeaponRig, randomGun } from './weapons.js';
import { BulletSystem } from './bullets.js';
import { VFX } from './vfx.js';
import { populateWorld, animateProp, PROP_DEFS } from './props.js';
import { Bot, updateBot, botDeath } from './bots.js';
import { makeRNG, clamp, damp, lerp } from './core.js';
import { SHOVEL_FALLBACK } from './weapons.js';
import { Wind } from './wind.js';
import { UI } from './ui.js';
import { Audio } from './audio.js';
import { SAVES } from './saves.js';

export class Arena {
  constructor(renderer, scene, camera, biome, opts) {
    window.__uf = this; // debug handle
    this.renderer = renderer; this.scene = scene; this.camera = camera;
    this.biome = biome; this.opts = opts;
    this.rng = makeRNG((Math.random() * 1e9) | 0);
    Wind.set(biome);
    this._lights();
    this.windTime = 0;
    this.world = new World(scene, biome, this.rng() * 1e9 | 0);
    this.vfx = new VFX(scene, this.world);
    this.bullets = new BulletSystem(this.world, scene);
    this.props = populateWorld(this.world, themeOf(biome));
    this.ui = new UI(this, camera, renderer);
    this.audio = Audio;
    this.t = 0;

    // ---- player ----
    const look = SAVES.look();
    this.player = new Character(this.world, { x: -20, body: look.body, scarf: look.scarf });
    scene.add(this.player);
    this.playerRig = new WeaponRig(this.player);
    this.player.aimAngle = 0;

    // ---- starting weapon (random) + shovel ----
    this.slots = [];
    const gunId = randomGun(this.rng);
    this.slots = [gunId, 'shovel'];
    this.slot = 0;

    // ---- bots ----
    this.bots = [];
    this.wave = 1;
    this.kills = 0;
    this.spawnQueue = 0;
    this.spawnTimer = 0;
    this.state = 'playing';   // playing | waveclear | gameover | paused
    this.stateT = 0;

    this.camX = this.player.pos.x;
    this.bindUI();
    this.queueWave();
  }

  async init() {
    await this.equipSlot(0);
  }

  async equipSlot(i) {
    this.slot = i;
    const def = await this.ui.weaponDef(this.slots[i]);
    await this.playerRig.equip(def);
    this.ui.refreshHUD();
  }

  _lights() {
    const s = this.scene;
    this.hemi = new THREE.HemisphereLight(0xfff6ea, 0xc9a68a, 0.9);
    s.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff0d8, 1.1);
    this.sun.position.set(-25, 40, 20);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = -50; this.sun.shadow.camera.right = 50;
    this.sun.shadow.camera.top = 50; this.sun.shadow.camera.bottom = -50;
    this.sun.shadow.camera.near = 5; this.sun.shadow.camera.far = 120;
    this.sun.shadow.bias = -0.001;
    this.sun.shadow.normalBias = 0.05;
    this.sunTarget = new THREE.Object3D();
    s.add(this.sunTarget);
    this.sun.target = this.sunTarget;
    const wc = themeOf(this.biome).weather;
    if (wc) {
      if (wc.cloudy !== undefined) this.cloudy = wc.cloudy;
      if (wc.sunIntensity !== undefined) this.sun.intensity = wc.sunIntensity;
      if (wc.hemiIntensity !== undefined) this.hemi.intensity = wc.hemiIntensity;
    }
  }

  queueWave() {
    const base = this.opts.botCount ?? 4;
    this.spawnQueue = Math.min(base + (this.wave - 1), 12);
    this.spawnTimer = .6;
    this.ui.banner(`Wave ${this.wave}`, this.spawnQueue + ' bots incoming');
  }

  spawnBot() {
    const side = this.rng() < .5 ? -1 : 1;
    const x = clamp(this.player.pos.x + side * (18 + this.rng() * 14), -HALF + 14, HALF - 14);
    const y = this.world.h(x) + 6;
    const bot = new Bot(this.world, x, clamp(.5 + this.wave * .12, .5, 1.4));
    this.scene.add(bot);
    bot.rig.equip(this.rngWeapon() ?? SHOVEL_FALLBACK);
    this.bots.push(bot);
    // spawn poof
    this.vfx.emit({ x, y: y - 3, count: 10, angle: Math.PI / 2, spread: Math.PI, speed: 3, grav: -4, size: .35, ttl: .8, col: ['#ffffff', '#e8e0d0'], fadePow: 2 });
    this.vfx.ring(x, y - 3, '#ffffff', 4, .5);
  }
  rngWeapon() {
    const list = this.ui.weapons.filter(w => w.kind !== 'shovel');
    return list.length ? list[(this.rng() * list.length) | 0] : null;
  }

  bindUI() {
    this.ui.on('switch', () => this.switchWeapon());
    this.ui.on('restart', () => window.dispatchEvent(new CustomEvent('uf-restart')));
    this.ui.on('menu', () => window.dispatchEvent(new CustomEvent('uf-menu')));
    this.ui.on('pause', () => this.togglePause());
  }

  togglePause() {
    if (this.state === 'playing') { this.state = 'paused'; this.ui.showPause(true); }
    else if (this.state === 'paused') { this.state = 'playing'; this.ui.showPause(false); }
  }

  switchWeapon() { this.equipSlot(1 - this.slot); }

  /* ------------------------------ main update ------------------------------ */
  update(dt, input) {
    this.t += dt;
    Wind.update(dt);
    this.world.update(dt, this.t, this.opts.quality);

    if (this.state === 'paused') { this.ui.update(dt); this.renderCam(dt); return; }

    // ---- player ----
    const p = this.player;
    p.aimAngle = Math.atan2(input.aim.y, Math.abs(input.aim.x)) * Math.sign(input.aim.x || 1);
    if (input.fire) {
      const out = this.playerRig.fire();
      if (out?.bullets) {
        for (const b of out.bullets) this.bullets.spawn({ ...b, owner: 'player' });
        this.audio.shoot(this.playerRig.current);
        this.vfx.muzzle(p.pos.x + p.facing * 1, p.pos.y + .35, p.facing, this.playerRig.current?.color);
        this.vfx.shake(.06);
      } else if (out?.shovel) {
        this.audio.dig();
        this.doShovel();
      }
    }
    if (input.dig || this.ui.digHeld()) this.doShovelHold(dt);
    if (input.switchPressed) this.switchWeapon();
    if (input.jumpPressed) p.jump();
    if (input.move.y < -.6 && p.onGround) { /* down on stick: nothing extra */ }
    p.update(dt, input, this.t);
    this.playerRig.update(dt);
    if (p.dead) {
      if (this.state === 'playing') { this.state = 'gameover'; SAVES.recordRun(this.wave, this.kills); this.ui.gameOver(this.kills, this.wave); Audio.gameover(); }
    }

    // ---- bots ----
    for (let i = this.bots.length - 1; i >= 0; i--) {
      const bot = this.bots[i];
      if (bot.dead) {
        bot.deadT += dt;
        if (bot.deadT > 1.2) { this.scene.remove(bot); this.bots.splice(i, 1); }
        continue;
      }
      updateBot(bot, p, dt, {
        world: this.world, vfx: this.vfx, rng: this.rng, t: this.t,
        spawnBullet: b => this.bullets.spawn(b),
        weapons: this.ui.weapons,
      });
      bot.rig.update(dt);
      if (bot.dead) {
        this.kills++;
        botDeath(bot, this.vfx);
        this.audio.hit(true);
        this.ui.refreshHUD();
      }
    }
    // spawn queue
    if (this.spawnQueue > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) { this.spawnBot(); this.spawnQueue--; this.spawnTimer = .8; this.ui.refreshHUD(); }
    } else if (this.bots.length === 0 && this.state === 'playing' && !this.player.dead) {
      this.state = 'waveclear'; this.stateT = 0;
      this.wave++;
      this.vfx.confetti(p.pos.x, p.pos.y + 2);
      this.audio.win();
      this.ui.banner('Wave clear', 'nice');
      this.ui.refreshHUD();
    }
    if (this.state === 'waveclear') {
      this.stateT += dt;
      if (this.stateT > 2.2) { this.state = 'playing'; this.queueWave(); }
    }

    // ---- bullets ----
    this.bullets.update(dt,
      (b, h) => this.bulletHitTerrain(b, h),
      (b) => this.bulletHitProp(b),
      (b) => this.bulletHitChar(b),
      (b) => { this.vfx.splash(b.x, WATER_Y, 10); this.audio.splash(); });

    // ---- props ----
    for (const pr of this.props) {
      if (!pr.parent) continue;
      animateProp(pr, this.t, this.camX);
      const u = pr.userData;
      if (u.hp <= 0 && !u.dead) this.killProp(pr);
    }

    // ---- weather ----
    this.weather(dt);

    // ---- vfx & camera ----
    this.vfx.update(dt);
    this.ui.update(dt);
    this.renderCam(dt);
  }

  doShovel() {
    const p = this.player;
    const x = p.pos.x + p.facing * 1.4;
    this.world.crater(x, 1.5, .55);
    this.vfx.dirt(x, this.world.h(x) + .3, p.facing, 10, .8);
    this.vfx.shake(.08);
    // damage props / bots in front
    for (const pr of this.props) {
      if (Math.abs(pr.position.x - x) < 2 && pr.userData.kind !== 'rock') this.damageProp(pr, 34);
    }
    for (const bot of this.bots) {
      if (!bot.dead && Math.abs(bot.pos.x - x) < 1.8 && Math.abs(bot.pos.y - p.pos.y) < 1.6) bot.hurt(20, p.facing * 4);
    }
    // play dirt sound
  }
  doShovelHold(dt) { /* reserved for continuous trench digging (hold) */
    this._digHold = (this._digHold ?? 0) + dt;
    if (this._digHold > .25) {
      this._digHold = 0;
      this.doShovel();
    }
  }

  bulletHitTerrain(b, h) {
    const def = b.blast > 0 ? b.blast : 0;
    if (def > 0) {
      this.vfx.explosion(b.x, h + .3, b.color);
      this.world.crater(b.x, 2.2 + def, 1 + def * .5);
      this.audio.boom();
      // blast damage
      this.blastDamage(b.x, h + .5, 3 + def, b.dmg, b.owner);
    } else {
      this.world.crater(b.x, .7, .28);
      this.vfx.sparks(b.x, h + .1, -Math.sign(b.vx), b.color, 5);
      this.vfx.emit({ x: b.x, y: h + .2, count: 4, angle: Math.PI / 2, spread: Math.PI * .8, speed: 2.5, grav: -18, size: .2, ttl: .6, col: ['#6b563f', '#57452f'], fadePow: 1.5 });
      this.audio.thud();
    }
  }
  bulletHitProp(b) {
    for (const pr of this.props) {
      if (!pr.parent || pr.userData.dead) continue;
      const u = pr.userData;
      const w = PROP_DEFS[u.kind].w * u.scale;
      if (Math.abs(pr.position.x - b.x) > w * .55) continue;
      if (b.y > pr.position.y + u.tall * u.scale || b.y < pr.position.y - .5) continue;
      if (u.kind === 'rock' || u.kind === 'pillar' || u.kind === 'gravestone') {
        this.vfx.sparks(b.x, b.y, -Math.sign(b.vx), '#d8d2c8', 6);
        this.audio.thud();
        return true;
      }
      this.damageProp(pr, b.dmg);
      if (b.blast > 0) { this.vfx.explosion(b.x, b.y, b.color); this.world.crater(b.x, 2.2 + b.blast, 1 + b.blast * .5); this.blastDamage(b.x, b.y, 3 + b.blast, b.dmg, b.owner); this.audio.boom(); }
      else this.vfx.sparks(b.x, b.y, -Math.sign(b.vx), b.color, 6);
      return true;
    }
    return false;
  }
  bulletHitChar(b) {
    if (b.owner === 'player') {
      for (const bot of this.bots) {
        if (bot.dead) continue;
        if (Math.abs(bot.pos.x - b.x) < .85 && Math.abs(bot.pos.y + .1 - b.y) < .95) {
          bot.hurt(b.dmg, Math.sign(b.vx) * 2);
          this.audio.hit();
          this.vfx.sparks(b.x, b.y, -Math.sign(b.vx), b.color, 7);
          if (bot.dead) return true;
          return true;
        }
      }
    } else {
      const p = this.player;
      if (!p.dead && Math.abs(p.pos.x - b.x) < .85 && Math.abs(p.pos.y + .1 - b.y) < .95) {
        p.hurt(b.dmg, Math.sign(b.vx) * 2);
        this.audio.hurt();
        this.vfx.shake(.2);
        this.vfx.emit({ x: b.x, y: b.y, count: 8, angle: Math.PI / 2, spread: Math.PI, speed: 3, grav: -10, size: .25, ttl: .6, col: ['#ff8a7a', '#ffd0c4'], fadePow: 2 });
        this.ui.refreshHUD();
        return true;
      }
    }
    return false;
  }
  blastDamage(x, y, radius, dmg, owner) {
    for (const pr of this.props) {
      if (!pr.parent || pr.userData.dead) continue;
      const d = Math.hypot(pr.position.x - x, pr.position.y + 1 - y);
      if (d < radius + PROP_DEFS[pr.userData.kind].w * .4) this.damageProp(pr, dmg * (1 - d / radius * .5));
    }
    const targets = owner === 'player' ? this.bots : [this.player, ...this.bots];
    for (const c of targets) {
      if (c.dead) continue;
      const d = Math.hypot(c.pos.x - x, c.pos.y - y);
      if (d < radius + 1) c.hurt(dmg * (1 - d / (radius + 1) * .6), Math.sign(c.pos.x - x) * 5);
    }
    if (owner === 'player') this.killsCheck();
  }
  killsCheck() { /* handled per-bot in update */ }

  damageProp(pr, dmg) {
    const u = pr.userData;
    if (u.dead) return;
    u.hp -= dmg;
    u.wobV += (Math.random() - .5) * 3 + Math.sign(dmg) * .5;
    if (u.hp <= 0) this.killProp(pr);
  }
  killProp(pr) {
    const u = pr.userData;
    u.dead = true;
    const def = PROP_DEFS[u.kind];
    const cols = [u.kind.includes('pine') ? '#3d6758' : '#7fae5a', '#6e4c36', '#5c4a41'];
    if (u.kind === 'barrel') {
      this.vfx.explosion(pr.position.x, pr.position.y + 1, '#ff9d5c');
      this.world.crater(pr.position.x, 2.4, 1.1);
      this.blastDamage(pr.position.x, pr.position.y + 1, 3.4, 55, 'player');
      this.audio.boom();
    } else {
      this.vfx.debrisBurst(pr.position.x, pr.position.y + 1.2, Math.round(4 + def.w), cols, .8);
      if (def.tree) this.vfx.leafBurst(pr.position.x, pr.position.y + def.h * .6, ['#7fae5a', '#93c46e', '#6a9c4a']);
      this.vfx.ring(pr.position.x, pr.position.y + .5, '#ffffff', 3, .4);
    }
    pr.parent.remove(pr);
  }

  weather(dt) {
    const kind = this.biome.weather;
    if (!kind) return;
    this._wAcc = (this._wAcc ?? 0) + dt;
    const rate = { rain: 26, snow: 14, petals: 6, fireflies: 4, leaves: 5, dust: 8, ash: 6, storm: 40, snowfall: 14 }[kind] ?? 0;
    if (rate && this._wAcc > .033) {
      const n = Math.max(1, Math.round(rate * this._wAcc));
      this._wAcc = 0;
      const camX = this.camX;
      for (let i = 0; i < n; i++) {
        const x = camX + (Math.random() - .5) * 34;
        const topY = 16 + Math.random() * 8;
        if (kind === 'rain' || kind === 'storm') {
          this.vfx.emit({ x, y: topY, count: 1, angle: -Math.PI / 2 + (Wind.dir > 0 ? .35 : -.35), speed: 16, grav: 0, drag: 0, size: .1, ttl: 1.1, col: ['#9fc8e0', '#bfe0f0'], fadePow: 1 });
        } else if (kind === 'snow' || kind === 'snowfall') {
          this.vfx.emit({ x, y: topY, count: 1, angle: -Math.PI / 2, speed: 1.2, grav: -.5, drag: .2, size: .22, ttl: 6, col: ['#ffffff', '#eef4f8'], sway: 1.5, fadePow: 1 });
        } else if (kind === 'petals') {
          this.vfx.emit({ x, y: topY, count: 1, angle: -Math.PI / 2, speed: .8, grav: -.4, drag: .3, size: .26, ttl: 7, col: ['#f7b6c8', '#fde2ea', '#f39bb4'], sway: 2.5, fadePow: 1 });
        } else if (kind === 'fireflies') {
          this.vfx.emit({ x, y: 2 + Math.random() * 6, count: 1, angle: Math.random() * 6, speed: .5, grav: 0, drag: .5, size: .18, ttl: 3, col: ['#ffe9a0', '#fff6d0'], sway: 3, fadePow: 2 });
        } else if (kind === 'leaves') {
          this.vfx.emit({ x, y: topY, count: 1, angle: -Math.PI / 2, speed: 1, grav: -.6, drag: .4, size: .24, ttl: 6, col: ['#c8742f', '#e9a23b', '#d9573b'], sway: 3, fadePow: 1 });
        } else if (kind === 'dust') {
          this.vfx.emit({ x, y: 1 + Math.random() * 3, count: 1, angle: 0, speed: 2, grav: -.2, drag: .3, size: .2, ttl: 2.5, col: ['#e3d3b8', '#d8c5a5'], fadePow: 1.5 });
        } else if (kind === 'ash') {
          this.vfx.emit({ x, y: topY, count: 1, angle: -Math.PI / 2, speed: .9, grav: -.3, drag: .4, size: .18, ttl: 5, col: ['#8a8580', '#a09a92'], sway: 2, fadePow: 1 });
        }
      }
    }
  }

  renderCam(dt) {
    const p = this.player;
    const targetX = clamp(p.pos.x + p.facing * 2.5, -HALF + 12, HALF - 12);
    this.camX = damp(this.camX, targetX, 4, dt);
    const targetY = clamp(p.pos.y + 2.2, 2, 40);
    if (this._camY === undefined) this._camY = targetY;
    this._camY = damp(this._camY, targetY, 3, dt);
    const shake = this.vfx.shakeAmt;
    this.camera.position.set(
      this.camX + (Math.random() - .5) * shake * .5,
      this._camY + (Math.random() - .5) * shake * .5,
      30);
    this.camera.lookAt(this.camX, this._camY - 1.2, 0);
    // keep sky dome & sun centred on camera
    if (this.world.sky) { this.world.sky.position.x = this.camX; }
  }

  dispose() {
    this.world.dispose();
    this.ui.dispose();
  }
}

function themeOf(biome) {
  return { top: biome.top, mid: biome.mid, deep: biome.deep, cap: biome.cap, leaf: biome.leaf, far: biome.far };
}
