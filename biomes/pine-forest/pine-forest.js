/* Biome: Pine Forest — quiet evergreens and falling snow. */
Biome({
  order: 30,
  name: "Pine Forest",
  weather: "snow",
  wind: 0.3,
  pond: true,
  skyT: "#c9dce8", skyB: "#eef5f2",
  sun: "#f4f8fb",
  far: ["#b9cdd6", "#a5bcc8", "#93aebc"],
  top: "#7d9482", mid: "#57544a", deep: "#33302c", cap: "#93b094",
  props: [["pine", 1], ["snowpine", 0.6], ["bush", 0.3], ["rock", 0.25], ["mushroom", 0.2]],
  bgTrees: "pine",
  cloud: "#f2f7fa",
  water: "#8fb0c4",
  leaf: ["#3d6758", "#487465", "#547f6e"],
  flat: 0.55,
});
