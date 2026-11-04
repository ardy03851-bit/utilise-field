/* Biome: Desert Oasis — palms, cacti and warm dust. */
Biome({
  order: 40,
  name: "Desert Oasis",
  weather: "dust",
  wind: 0.4,
  pond: true,
  skyT: "#f2c98f", skyB: "#fdf0d8",
  sun: "#fff2c8",
  far: ["#e8c9a0", "#d9b384", "#c9a074"],
  top: "#d9b57e", mid: "#a8815c", deep: "#5c4632", cap: "#ecc992",
  props: [["palm", 1], ["cactus", 0.5], ["rock", 0.3], ["dead", 0.2], ["crate", 0.15]],
  bgTrees: "palm",
  cloud: "#fdf6e8",
  water: "#7fc4c9",
  leaf: ["#6fae6a", "#82c47a", "#5c9c58"],
  flat: 0.7,
});
