import * as THREE from 'three';
import { Character } from '../js/character.js';
import { World } from '../js/world.js';
const scene = new THREE.Scene();
const world = new World(scene, { id:'meadow', pond:true }, 42);
const ch = new Character(world, { x: -20, scarf: ['#e86a6a','#f2a65a'] });
scene.add(ch);
for (let f = 0; f < 240; f++) ch.update(1/60, { moveX: 0 }, f/60);
const pos = ch.scarfGeo.attributes.position.array;
for (let i = 0; i < 13; i++) {
  console.log(i, 'L', pos[i*6].toFixed(2), pos[i*6+1].toFixed(2), ' R', pos[i*6+3].toFixed(2), pos[i*6+4].toFixed(2));
}
