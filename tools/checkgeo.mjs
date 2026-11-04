import * as THREE from 'three';
import { World } from '../js/world.js';

const scene = new THREE.Scene();
const biome = { id:'meadow', top:'#7c9a5a', mid:'#5c4a41', deep:'#33282a', cap:'#86a65a', pond:true };
const w = new World(scene, biome, 42);

const geo = w.terrainGeo;
const pos = geo.attributes.position.array;
const idx = geo.index.array;
console.log('verts:', pos.length/3, 'indices:', idx.length);
// NaN / range checks
let nan = 0, minY=1e9, maxY=-1e9, minX=1e9, maxX=-1e9, minZ=1e9, maxZ=-1e9;
for (let i=0;i<pos.length;i+=3){
  if ([pos[i],pos[i+1],pos[i+2]].some(Number.isNaN)) nan++;
  minX=Math.min(minX,pos[i]);maxX=Math.max(maxX,pos[i]);
  minY=Math.min(minY,pos[i+1]);maxY=Math.max(maxY,pos[i+1]);
  minZ=Math.min(minZ,pos[i+2]);maxZ=Math.max(maxZ,pos[i+2]);
}
console.log('NaN verts:', nan, 'x:',minX.toFixed(1),maxX.toFixed(1),'y:',minY.toFixed(1),maxY.toFixed(1),'z:',minZ.toFixed(1),maxZ.toFixed(1));
let oob = idx.filter(v => v >= pos.length/3).length;
console.log('out-of-range indices:', oob);
// degenerate triangles
let degen = 0;
for (let t=0;t<idx.length;t+=3){
  const a=idx[t],b=idx[t+1],c=idx[t+2];
  const ax=pos[a*3],ay=pos[a*3+1],az=pos[a*3+2];
  const bx=pos[b*3],by=pos[b*3+1],bz=pos[b*3+2];
  const cx=pos[c*3],cy=pos[c*3+1],cz=pos[c*3+2];
  const ux=bx-ax,uy=by-ay,uz=bz-az, vx=cx-ax,vy=cy-ay,vz=cz-az;
  const nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx;
  if (Math.abs(nx)+Math.abs(ny)+Math.abs(nz) < 1e-9) degen++;
}
console.log('degenerate triangles:', degen, 'of', idx.length/3);
// normals NaN?
const nrm = geo.attributes.normal.array;
let nnan=0; for (let i=0;i<nrm.length;i++) if (Number.isNaN(nrm[i])) nnan++;
console.log('NaN normals:', nnan);
// heights stats
let hmin=1e9,hmax=-1e9; for (const h of w.heights){hmin=Math.min(hmin,h);hmax=Math.max(hmax,h);}
console.log('heights range:', hmin.toFixed(2), hmax.toFixed(2));
