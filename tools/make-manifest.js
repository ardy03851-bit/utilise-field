/* tools/make-manifest.js — scans biomes/ and weapons/ and writes the
   manifest.json files the game loads at boot. Run after adding a folder:
     node tools/make-manifest.js
   (uses plain fs only, no deps) */

const fs = require('fs');
const path = require('path');

function scan(dir, check) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const full = path.join(dir, entry.name);
    if (!check(full)) continue;
    out.push(entry.name);
  }
  return out;
}

/* biomes: <dir>/<dir>.js or any .js inside */
const biomes = scan(path.join(__dirname, '..', 'biomes'), dir => {
  return fs.readdirSync(dir).some(f => f === path.basename(dir) + '.js' || f.endsWith('.js'));
}).map(id => {
  const dir = path.join(__dirname, '..', 'biomes', id);
  const js = fs.existsSync(path.join(dir, id + '.js'))
    ? id + '.js'
    : fs.readdirSync(dir).find(f => f.endsWith('.js'));
  return { id, js, png: null, files: fs.readdirSync(dir) };
});

/* weapons: <dir>/manifest.json */
const weapons = scan(path.join(__dirname, '..', 'weapons'), dir =>
  fs.existsSync(path.join(dir, 'manifest.json'))
).map(id => ({ id, files: fs.readdirSync(path.join(__dirname, '..', 'weapons', id)) }));

fs.writeFileSync(path.join(__dirname, '..', 'biomes', 'manifest.json'),
  JSON.stringify({ biomes }, null, 1));
fs.writeFileSync(path.join(__dirname, '..', 'weapons', 'manifest.json'),
  JSON.stringify({ weapons }, null, 1));
console.log(`biomes: ${biomes.length}, weapons: ${weapons.length}`);
