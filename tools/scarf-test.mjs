import * as THREE from 'three';
import { Character } from '../js/character.js';
import { World } from '../js/world.js';

const scene = new THREE.Scene();
const world = new World(scene, { id:'meadow', top:'#7c9a5a', pond:true }, 42);
const ch = new Character(world, { x: -20, body: '#f7e9d7', scarf: ['#e86a6a', '#f2a65a'] });
scene.add(ch);
// simulate: fall to ground then stand 240 frames
const input = { moveX: 0 };
for (let f = 0; f < 240; f++) {
  ch.update(1/60, input, f/60);
}
console.log('pos:', ch.pos.x.toFixed(2), ch.pos.y.toFixed(2));
console.log('anchor:', ch.scarfAnchor(new THREE.Vector3()).toArray().map(v=>v.toFixed(2)));
for (let i = 0; i < ch.scarfPts.length; i++) {
  const p = ch.scarfPts[i];
  console.log(i, p.x.toFixed(2), p.y.toFixed(2), p.z.toFixed(2));
}
