export const REGION_BIOMES = {
  kanto: ["prairie", "forest", "flower", "riverside", "lake", "beach", "ocean", "cave", "mountain", "rocky_area", "ruins", "town"],
  johto: ["prairie", "forest", "flower", "riverside", "lake", "beach", "ocean", "cave", "mountain", "rocky_area", "swamp", "ruins", "town"],
  hoenn: ["prairie", "forest", "flower", "riverside", "lake", "beach", "ocean", "underwater", "cave", "cave_water", "mountain", "rocky_area", "desert", "volcano", "wasteland", "ruins", "town"],
  sinnoh: ["prairie", "forest", "flower", "riverside", "lake", "beach", "ocean", "cave", "cave_water", "mountain", "rocky_area", "swamp", "snowfield", "mine", "ruins", "town", "underground"],
  unova: ["prairie", "forest", "flower", "bamboo_forest", "riverside", "lake", "beach", "ocean", "cave", "cave_water", "mountain", "rocky_area", "desert", "swamp", "snowfield", "chargestone", "volcano", "wasteland", "ruins", "town"],
  kalos: ["prairie", "forest", "flower", "riverside", "lake", "beach", "ocean", "cave", "mountain", "rocky_area", "swamp", "snowfield", "wasteland", "ruins", "town"],
  alola: ["prairie", "forest", "flower", "riverside", "lake", "beach", "ocean", "cave", "mountain", "rocky_area", "desert", "snowfield", "volcano", "ruins", "town"],
  galar: ["prairie", "forest", "flower", "riverside", "lake", "beach", "ocean", "cave", "mountain", "rocky_area", "swamp", "snowfield", "mine", "wasteland", "ruins", "town"],
  hisui: ["prairie", "forest", "flower", "riverside", "lake", "beach", "ocean", "cave", "mountain", "rocky_area", "swamp", "snowfield", "volcano", "ruins", "town"],
  paldea: ["bamboo_forest", "beach", "cave", "desert", "flower", "forest", "lake", "mine", "mountain", "ocean", "olive", "prairie", "riverside", "rocky_area", "ruins", "snowfield", "swamp", "town", "underground"],
  kitakami: ["bamboo_forest", "cave", "cave_water", "desert", "flower", "lake", "prairie", "riverside", "rocky_area", "swamp"],
} as const;

export type RegionKey = keyof typeof REGION_BIOMES;
export type BiomeKey = (typeof REGION_BIOMES)[RegionKey][number];

export const PRIVATE_TEST_REGION_KEYS = ["kanto", "hoenn"] as const satisfies RegionKey[];

export function channelNameForBiome(biome: string): string {
  return biome.replaceAll("_", "-");
}
