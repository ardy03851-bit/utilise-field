/* Biome: Frost Tundra — pale blues, snow pines, crystal clearings. */
Biome({
  order: 100,
  name: "Frost Tundra",
  weather: "snowfall",
  wind: 0.3,
  pond: true,
  skyT: "#c4d8e8", skyB: "#f4f0ea",
  sun: "#fffaf0",
  far: ["#dfe8ee", "#cfdce4", "#bfd0da"],
  top: "#e8edf0", mid: "#7d746a", deep: "#4a4440", cap: "#f2f6f8",
  props: [["snowpine", 1], ["rock", 0.5], ["crystal", 0.2], ["bush", 0.15]],
  bgTrees: "snowpine",
  cloud: "#ffffff",
  water: "#a8ccd8",
  leaf: ["#d8e4ea", "#c8d8e0", "#e4eef2"],
  flat: 0.5,
});
