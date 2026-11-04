/* saves.js — persistent player stuff (localStorage): wardrobe look,
   settings (quality, sound, bot count), stats. */

const KEY = 'utilise-field-save-v1';

export const SAVES = {
  data: null,

  load() {
    if (this.data) return this.data;
    try { this.data = JSON.parse(localStorage.getItem(KEY)) || {}; }
    catch (e) { this.data = {}; }
    this.data.look ??= { body: '#f7e9d7', scarf: ['#e86a6a', '#f2a65a'], scarfLen: 13 };
    this.data.settings ??= { quality: 'high', sound: true, bots: 4, biome: 'random' };
    this.data.stats ??= { bestWave: 0, totalKills: 0 };
    return this.data;
  },
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { } },

  look() { this.load(); return this.data.look; },
  setLook(look) { this.load(); this.data.look = look; this.save(); },
  settings() { this.load(); return this.data.settings; },
  setSettings(s) { this.load(); this.data.settings = s; this.save(); },
  stats() { this.load(); return this.data.stats; },
  recordRun(wave, kills) {
    this.load();
    this.data.stats.bestWave = Math.max(this.data.stats.bestWave, wave);
    this.data.stats.totalKills += kills;
    this.save();
  },
};
