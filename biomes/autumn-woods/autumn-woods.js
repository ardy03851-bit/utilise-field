/* Biome: Autumn Woods — amber canopies, drifting leaves. */
Biome({
  order: 80,
  name: "Autumn Woods",
  weather: "leaves",
  wind: 0.45,
  pond: true,
  skyT: "#f2c9a0", skyB: "#fdf0dc",
  sun: "#ffedc4",
  far: ["#e0b58e", "#cf9d76", "#bd8760"],
  top: "#b08d5f", mid: "#6b5443", deep: "#3d332c", cap: "#d9b57e",
  props: [["autumn", 1], ["bush", 0.35], ["mushroom", 0.25], ["rock", 0.2], ["pumpkin", 0.15]],
  bgTrees: "autumn",
  cloud: "#fdf3e3",
  water: "#c9a878",
  leaf: ["#d9573b", "#e9a23b", "#c8742f"],
  flat: 0.6,
});
