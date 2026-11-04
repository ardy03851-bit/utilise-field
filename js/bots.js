/* bots.js — arena opponents. Same cube+scarf characters, pastel scarf colours,
   simple but lively AI: pick a preferred range for their weapon, strafe,
   hop over walls and gaps, avoid deep water, take aim with line-of-sight
   checks and human-ish inaccuracy. They wobble when hit and pop into
   debris + a flying scarf when defeated. */

import * as THREE from 'three';
import { Character } from './character.js';
import { WeaponRig } from './weapons.js';
import { makeRNG, clamp, damp } from './core.js';

const SCARF_COLORS = [
  ['#e86a6a', '#f2a65a'], ['#5bc0eb', '#7fd6f2'], ['#90be6d', '#c5e08a'],
  ['#c77dff', '#e5b8ff'], ['#f9c74f', '#fde28a'], ['#f2789f', '#f8b4c8'],
  ['#7fd6b5', '#b2ecd8'], ['#f4978e', '#f8c2ba'],
];

export class Bot extends Character {
  constructor(world, x, difficulty = 1) {
    super(world, {
      x, body: '#efe3d0', scarf: pickScarf(),
    });
    this.isBot = true;
    this.difficulty = difficulty;
    this.rig = new WeaponRig(this);
    this.thinkT = Math.random();
    this.strafe = 0; this.strafeT = 0;
    this.jumpCd = 0; this.fireCd = .8 + Math.random();
    this.wanderX = x;
    this.aimAngle = 0;
    this.hpBar = makeHpBar();
    this.add(this.hpBar);
    this.hpBar.position.y = 1.35;
  }
}

function pickScarf() { const c = SCARF_COLORS[Math.floor(Math.random() * SCARF_COLORS.length)]; return c; }

function makeHpBar() {
  const g = new THREE.Group();
  const bg = new THREE.Mesh(new THREE.BoxGeometry(1.1, .12, .06), new THREE.MeshBasicMaterial({ color: 0x3a2f28, transparent: true, opacity: .55 }));
  const fg = new THREE.Mesh(new THREE.BoxGeometry(1.04, .08, .07), new THREE.MeshBasicMaterial({ color: 0xf2789f }));
  g.add(bg, fg);
  g.visible = false;
  g.userData.fg = fg;
  return g;
}

/* Bot brain — runs every frame, decisions on a timer. */
export function updateBot(bot, player, dt, ctx) {
  // ctx: {world, vfx, bullets, spawnBullet, difficulty, props}
  if (bot.dead) return;
  const w = ctx.world, rng = ctx.rng;
  bot.thinkT -= dt;
  bot.jumpCd -= dt;
  bot.fireCd -= dt;

  const dx = player.pos.x - bot.pos.x;
  const dist = Math.abs(dx);
  const dir = Math.sign(dx) || 1;
  bot.facing = dir;
  bot.aimAngle = Math.atan2((player.pos.y + .4) - (bot.pos.y + .35), dx) + (rng() - .5) * .25 * (2 - bot.difficulty);

  // choose behaviour every ~0.7s
  if (bot.thinkT <= 0) {
    bot.thinkT = .5 + rng() * .6;
    const pref = bot.rig.current?.range ?? 12;
    const err = dist - pref;
    bot.strafe = Math.abs(err) > 3 ? Math.sign(err) * dir : (rng() < .4 ? dir * (rng() < .5 ? 1 : -1) : 0);
    bot.strafeT = .4 + rng() * .8;
  }
  bot.strafeT -= dt;
  const mv = bot.strafe;

  // wall / gap ahead → jump
  const aheadX = bot.pos.x + Math.sign(mv || dir) * .9;
  const hAhead = w.h(aheadX), hHere = w.h(bot.pos.x);
  if (bot.onGround && bot.jumpCd <= 0) {
    if (hAhead - hHere > .9) { bot.jump(11.5); bot.jumpCd = .5; }
    else if (mv !== 0 && w.inWater(aheadX, hAhead - .5) && hAhead < -.6 && Math.sign(mv) === dir) { bot.strafe *= -1; } // don't dive in
    else if (rng() < .004) { bot.jump(10); bot.jumpCd = 1; } // playful hop
  }

  // line of sight (sample terrain + props along the ray)
  let los = true;
  const steps = 8;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const sx = bot.pos.x + dx * t, sy = bot.pos.y + (player.pos.y - bot.pos.y) * t;
    if (w.h(sx) > sy) { los = false; break; }
  }

  // fire
  const def = bot.rig.current;
  if (bot.fireCd <= 0 && los && dist < (def?.range ?? 14) + 4) {
    const out = bot.rig.fire();
    if (out?.bullets) {
      for (const b of out.bullets) {
        // bullets aimed at the player with the bot's aim angle
        const a = bot.aimAngle;
        ctx.spawnBullet({
          x: bot.pos.x + Math.cos(a) * 1.1, y: bot.pos.y + .35,
          vx: Math.cos(a) * def.speed, vy: Math.sin(a) * def.speed,
          dmg: Math.round(def.dmg * .55), color: def.color ?? '#ff9d8a',
          owner: 'bot', id: def.id, radius: def.blast ?? 0,
        });
      }
      ctx.vfx.muzzle(bot.pos.x + dir * .9, bot.pos.y + .35, dir, def.color ?? '#ff9d8a');
    }
    bot.fireCd = (1 / (def?.rate ?? 1.5)) * (1.6 - bot.difficulty * .5) + rng() * .4;
  }

  // move (reuse the character controller by injecting input)
  bot.update(dt, {
    moveX: clamp(mv, -1, 1),
  }, ctx.t);
  bot.rig.update(dt);

  // hp bar
  if (bot.hp < bot.maxHp) {
    bot.hpBar.visible = true;
    const f = bot.hpBar.userData.fg;
    f.scale.x = clamp(bot.hp / bot.maxHp, .01, 1);
    f.position.x = -(1 - f.scale.x) * .52;
  }
}

export function botDeath(bot, vfx) {
  // pop into debris + scarf flies away + a puff of scarf-coloured particles
  const cols = ['#efe3d0', '#d9cbb4'];
  vfx.debrisBurst(bot.pos.x, bot.pos.y, 10, cols, 1);
  vfx.ring(bot.pos.x, bot.pos.y, '#ffd9c9', 6, .5);
  vfx.emit({ x: bot.pos.x, y: bot.pos.y + .4, count: 14, angle: Math.PI / 2, spread: Math.PI, speed: 4, grav: -8, size: .3, ttl: 1, col: ['#ffd9c9', '#ffb3a0', '#fff3e6'], fadePow: 2 });
  vfx.shake(.25);
}
