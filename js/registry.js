/* registry.js — content loading.
   Biomes live in biomes/<id>/<id>.js and weapons in weapons/<id>/manifest.json
   (+ weapon.png). Each folder tree has a manifest.json (regenerate it with
   `node tools/make-manifest.js`). Nothing else needs editing — drop a folder,
   rebuild the manifest, and the game picks it up. */

import { BIOMES, WEAPONS } from './core.js';

export const Content = {
  loaded: false,

  async load() {
    if (this.loaded) return;
    await this._loadBiomes();
    await this._loadWeapons();
    this.loaded = true;
  },

  async _loadBiomes() {
    let manifest;
    try { manifest = await (await fetch('biomes/manifest.json')).json(); }
    catch (e) { console.warn('no biomes manifest'); return; }
    for (const entry of manifest.biomes) {
      try {
        const src = await (await fetch(`biomes/${entry.id}/${entry.js}`)).text();
        // biome files call the global Biome({...}) helper
        const register = def => {
          if (!def || !def.name) return;
          def.id = entry.id;
          def.order = def.order ?? 100;
          BIOMES.push(def);
        };
        new Function('Biome', src)(register);
      } catch (e) { console.warn('biome failed', entry.id, e); }
    }
    BIOMES.sort((a, b) => a.order - b.order);
  },

  async _loadWeapons() {
    let manifest;
    try { manifest = await (await fetch('weapons/manifest.json')).json(); }
    catch (e) { console.warn('no weapons manifest'); return; }
    for (const entry of manifest.weapons) {
      try {
        const def = await (await fetch(`weapons/${entry.id}/manifest.json`)).json();
        def.id = entry.id;
        def.png = `weapons/${entry.id}/weapon.png`;
        if (def.kind === undefined) def.kind = 'gun';
        WEAPONS.push(def);
      } catch (e) { console.warn('weapon failed', entry.id, e); }
    }
    WEAPONS.sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
  },
};
