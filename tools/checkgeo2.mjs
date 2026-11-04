import * as THREE from 'three';
import { World } from '../js/world.js';
const scene = new THREE.Scene();
const w = new World(scene, { id:'meadow', top:'#7c9a5a', pond:true }, 42);
const pos = w.terrainGeo.attributes.position.array;
const idx = w.terrainGeo.index.array;
console.log('pos.length/3 =', pos.length/3, 'idx.length =', idx.length);
let max = 0; for (const v of idx) max = Math.max(max, v);
console.log('max index =', max);
// count by section
const sB = 3249, bB = 3971, cB = 4693;
let over = idx.filter(v => v >= 4701).length;
console.log('idx >= 4701:', over);
// histogram of out-of-range locations
for (let t = 0; t < idx.length; t += 3) {
  if (idx[t] >= 4701 || idx[t+1] >= 4701 || idx[t+2] >= 4701) {
    console.log('first bad triangle at', t, ':', idx[t], idx[t+1], idx[t+2]);
    break;
  }
}
// how many bad triangles
let bad = 0;
for (let t = 0; t < idx.length; t += 3) if (idx[t] >= 4701 || idx[t+1] >= 4701 || idx[t+2] >= 4701) bad++;
console.log('bad triangles:', bad);
