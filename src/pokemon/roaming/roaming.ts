import type Database from "better-sqlite3";
import type { ExploredPokemon } from "../explore/explore.js";
import type { RegionKey } from "../data/regions.js";

export const DEFAULT_ROAMING_CHANCE = 0.001;

const ROAMING_DEX_BY_REGION: Readonly<Partial<Record<RegionKey, readonly number[]>>> = {
  kanto: [243, 244, 245],
  johto: [243, 244],
  hoenn: [380, 381],
};

type RoamingSpecies = {
  nationalDex: number;
  slug: string;
  nameEn: string;
  goCaptureRate: number;
  goFleeRate: number | null;
  typesCsv: string;
};

export function roamingChance(database: Database.Database, guildId: string): number {
  return (database.prepare("SELECT chance FROM pokemon_roaming_settings WHERE guild_id = ?").get(guildId) as { chance: number } | undefined)?.chance ?? DEFAULT_ROAMING_CHANCE;
}

export function setRoamingChance(database: Database.Database, guildId: string, chance: number): void {
  database.prepare(`
    INSERT INTO pokemon_roaming_settings (guild_id, chance) VALUES (?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET chance = excluded.chance
  `).run(guildId, chance);
}

export function roamingPokemonForRegion(database: Database.Database, regionKey: RegionKey, chance: number, random = Math.random): ExploredPokemon | undefined {
  if (random() >= chance) return undefined;
  const dexPool = ROAMING_DEX_BY_REGION[regionKey];
  if (!dexPool || dexPool.length === 0) return undefined;
  const nationalDex = dexPool[Math.floor(random() * dexPool.length)];
  if (!nationalDex) return undefined;
  const species = database.prepare(`
    SELECT s.national_dex AS nationalDex, s.slug, s.name_en AS nameEn,
      s.go_capture_rate AS goCaptureRate, s.go_flee_rate AS goFleeRate,
      (SELECT group_concat(type_key, ',') FROM (SELECT type_key FROM pokemon_types WHERE national_dex = s.national_dex ORDER BY slot)) AS typesCsv
    FROM pokemon_species s WHERE s.national_dex = ?
  `).get(nationalDex) as RoamingSpecies | undefined;
  if (!species) return undefined;
  return {
    nationalDex: species.nationalDex,
    slug: species.slug,
    nameEn: species.nameEn,
    goCaptureRate: species.goCaptureRate,
    goFleeRate: species.goFleeRate,
    types: species.typesCsv.split(",").filter(Boolean),
    weight: 1,
    minLevel: 40,
    maxLevel: 40,
    level: 40,
    rarity: { chance, color: 0xc084fc, key: "ultra_rare", label: "Ultra Rare" },
  };
}
