/* Biome: Volcanic Ash — smoky greys, dead trees, hot rocks. */
Biome({
  order: 90,
  name: "Volcanic Ash",
  weather: "ash",
  wind: 0.5,
  pond: true,
  skyT: "#8a8a96", skyB: "#e8d8c8",
  sun: "#ffd9a0",
  far: ["#7a746e", "#6a655f", "#5c5852"],
  top: "#8c8478", mid: "#4a4038", deep: "#2a2320", cap: "#6e675e",
  props: [["dead", 1], ["rock", 0.6], ["crystal", 0.2], ["gravestone", 0.15]],
  bgTrees: "dead",
  cloud: "#b8b4ae",
  water: "#5a7d8a",
  leaf: ["#8a7a6a", "#9a8a76", "#7a6a5a"],
  flat: 0.4,
});
