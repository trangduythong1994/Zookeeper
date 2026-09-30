import type Database from "better-sqlite3";
import { REGION_BIOMES, type RegionKey } from "../data/regions.js";

export const EXPLORE_BUTTON_PREFIX = "pk-explore";
export const WILD_ENCOUNTER_METHODS = [
  "grass",
  "cave",
  "walk",
  "surf",
  "surfing",
  "old-rod",
  "good-rod",
  "super-rod",
  "rock-smash",
  "headbutt",
  "headbutt-normal-trees",
  "roaming-grass",
  "roaming-water",
  "overworld",
  "overworld-water",
  "overworld-flying",
  "seaweed",
  "underwater-seaweed",
  "feebas-tile-fishing",
  "fishing-feebas-tiles",
] as const;

export type RarityKey = "common" | "uncommon" | "rare" | "ultra_rare" | "mythic_rare";

export type ExploreRarity = {
  chance: number;
  color: number;
  key: RarityKey;
  label: string;
};

export type ExploreContext = {
  biomeKey: string;
  regionKey: RegionKey;
};


export type ExploreEncounter = {
  maxLevel: number;
  minLevel: number;
  nameEn: string;
  nationalDex: number;
  slug: string;
  weight: number;
};

export type ExploredPokemon = ExploreEncounter & {
  level: number;
  rarity: ExploreRarity;
  goCaptureRate: number;
  goFleeRate: number | null;
  types: string[];
};

type DatabaseExploreEncounter = ExploreEncounter & { goCaptureRate: number; goFleeRate: number | null; typesCsv: string };

export function isWildEncounterMethod(method: string): boolean {
  return (WILD_ENCOUNTER_METHODS as readonly string[]).includes(method);
}

export function exploreContextFromChannel(channelName: string, categoryName: string | null): ExploreContext | undefined {
  if (!categoryName) return undefined;
  const categoryKey = categoryName.trim().toLowerCase().replace(/^pk-test-/u, "").replace(/^pk-/u, "");
  if (!(categoryKey in REGION_BIOMES)) return undefined;

  const regionKey = categoryKey as RegionKey;
  const biomeKey = channelName.trim().toLowerCase().replaceAll("-", "_");
  if (!REGION_BIOMES[regionKey].includes(biomeKey as never)) return undefined;
  return { regionKey, biomeKey };
}

export function chooseWeightedEncounter(encounters: ExploreEncounter[], random = Math.random): ExploreEncounter | undefined {
  const totalWeight = encounters.reduce((total, encounter) => total + encounter.weight, 0);
  if (totalWeight <= 0) return undefined;
  let target = random() * totalWeight;
  for (const encounter of encounters) {
    target -= encounter.weight;
    if (target < 0) return encounter;
  }
  return encounters.at(-1);
}

export function rollLevel(encounter: ExploreEncounter, random = Math.random): number {
  return encounter.minLevel + Math.floor(random() * (encounter.maxLevel - encounter.minLevel + 1));
}

export function rarityForChance(chance: number): ExploreRarity {
  if (chance >= 0.2) return { chance, color: 0x94a3b8, key: "common", label: "Common" };
  if (chance >= 0.05) return { chance, color: 0x4ade80, key: "uncommon", label: "Uncommon" };
  if (chance >= 0.01) return { chance, color: 0x60a5fa, key: "rare", label: "Rare" };
  if (chance >= 0.001) return { chance, color: 0xc084fc, key: "ultra_rare", label: "Ultra Rare" };
  return { chance, color: 0xfbbf24, key: "mythic_rare", label: "Mythic Rare" };
}

function exploredPokemon(encounters: DatabaseExploreEncounter[], random: () => number): ExploredPokemon | undefined {
  const encounter = chooseWeightedEncounter(encounters, random) as DatabaseExploreEncounter | undefined;
  if (!encounter) return undefined;
  const totalWeight = encounters.reduce((total, entry) => total + entry.weight, 0);
  const speciesWeight = encounters.filter((entry) => entry.nationalDex === encounter.nationalDex).reduce((total, entry) => total + entry.weight, 0);
  return { ...encounter, types: encounter.typesCsv.split(",").filter(Boolean), level: rollLevel(encounter, random), rarity: rarityForChance(speciesWeight / totalWeight) };
}

export function explorePokemon(database: Database.Database, context: ExploreContext, random = Math.random): ExploredPokemon | undefined {
  const encounters = database.prepare(`
    SELECT e.pokemon_national_dex AS nationalDex, e.weight, e.min_level AS minLevel, e.max_level AS maxLevel,
      s.slug, s.name_en AS nameEn, s.go_capture_rate AS goCaptureRate, s.go_flee_rate AS goFleeRate,
      (SELECT group_concat(type_key, ',') FROM (SELECT type_key FROM pokemon_types WHERE national_dex = s.national_dex ORDER BY slot)) AS typesCsv
    FROM biome_encounters e
    JOIN pokemon_species s ON s.national_dex = e.pokemon_national_dex
    WHERE e.region_key = ? AND e.biome_key = ?
    ORDER BY e.pokemon_national_dex
  `).all(context.regionKey, context.biomeKey) as DatabaseExploreEncounter[];
  return exploredPokemon(encounters, random);
}

export function explorePokemonAtLocation(database: Database.Database, locationKey: string, random = Math.random): ExploredPokemon | undefined {
  const encounters = database.prepare(`
    SELECT e.pokemon_national_dex AS nationalDex, e.rate AS weight, e.min_level AS minLevel, e.max_level AS maxLevel,
      s.slug, s.name_en AS nameEn, s.go_capture_rate AS goCaptureRate, s.go_flee_rate AS goFleeRate,
      (SELECT group_concat(type_key, ',') FROM (SELECT type_key FROM pokemon_types WHERE national_dex = s.national_dex ORDER BY slot)) AS typesCsv,
      e.encounter_method AS encounterMethod
    FROM location_area_encounters e
    JOIN pokemon_species s ON s.national_dex = e.pokemon_national_dex
    WHERE e.location_key = ? AND e.encounter_label = 'wild'
    ORDER BY e.area_key, e.pokemon_national_dex
  `).all(locationKey) as (DatabaseExploreEncounter & { encounterMethod: string })[];
  return exploredPokemon(encounters.filter((entry) => isWildEncounterMethod(entry.encounterMethod)), random);
}

export function officialArtworkUrl(nationalDex: number): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${nationalDex}.png`;
}

export function exploreButtonId(context: ExploreContext): string {
  return `${EXPLORE_BUTTON_PREFIX}:${context.regionKey}:${context.biomeKey}`;
}

export function parseExploreButtonId(customId: string): { biomeKey: string; regionKey: RegionKey } | undefined {
  const [prefix, regionKey, biomeKey, ...extra] = customId.split(":");
  if (prefix !== EXPLORE_BUTTON_PREFIX || !regionKey || !biomeKey || extra.length > 0 || !(regionKey in REGION_BIOMES)) return undefined;
  if (!REGION_BIOMES[regionKey as RegionKey].includes(biomeKey as never)) return undefined;
  return { regionKey: regionKey as RegionKey, biomeKey };
}
