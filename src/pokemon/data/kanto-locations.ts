/**
 * Navigation layer only. Encounter rows remain stored separately by source
 * location-area; this pilot maps each initial Kanto destination to the biome
 * used by the existing Explore data until the FireRed/LeafGreen import lands.
 */
export const KANTO_LOCATIONS = [
  { key: "kanto-route-1", name: "Route 1", biomeKeys: ["prairie"] },
  { key: "viridian-forest", name: "Viridian Forest", biomeKeys: ["forest"] },
  { key: "kanto-route-24", name: "Route 24", biomeKeys: ["flower", "riverside"] },
  { key: "kanto-route-6", name: "Route 6", biomeKeys: ["prairie", "riverside"] },
  { key: "cerulean-cave", name: "Cerulean Cave", biomeKeys: ["cave", "lake"] },
  { key: "kanto-route-19", name: "Route 19", biomeKeys: ["beach", "ocean"] },
  { key: "kanto-route-20", name: "Route 20", biomeKeys: ["beach", "ocean", "rocky_area"] },
  { key: "mt-moon", name: "Mt. Moon", biomeKeys: ["cave", "mountain", "rocky_area"] },
  { key: "rock-tunnel", name: "Rock Tunnel", biomeKeys: ["cave", "mountain", "rocky_area"] },
  { key: "kanto-route-10", name: "Route 10", biomeKeys: ["mountain", "rocky_area", "riverside"] },
  { key: "pokemon-tower", name: "Pokémon Tower", biomeKeys: ["ruins", "town"] },
  { key: "saffron-city", name: "Saffron City", biomeKeys: ["town"] },
] as const;

export type KantoLocation = (typeof KANTO_LOCATIONS)[number];
