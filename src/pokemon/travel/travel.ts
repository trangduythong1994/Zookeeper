import type Database from "better-sqlite3";
import type { RegionKey } from "../data/regions.js";
import { WILD_ENCOUNTER_METHODS, rarityForChance, type ExploreRarity } from "../explore/explore.js";

const WILD_METHOD_SQL = WILD_ENCOUNTER_METHODS.map((method) => `'${method}'`).join(", ");
const EXPLORABLE_LOCATION_SQL = `
  EXISTS (SELECT 1 FROM location_biomes b WHERE b.location_key = l.key)
  OR EXISTS (
    SELECT 1 FROM location_area_encounters e
    WHERE e.location_key = l.key
      AND e.encounter_method IN (${WILD_METHOD_SQL})
      AND e.encounter_label = 'wild'
  )
`;

export type TravelLocation = {
  biomeKeys: string[];
  key: string;
  name: string;
  regionKey: RegionKey;
};

export type LocationPokemon = {
  nationalDex: number;
  nameEn: string;
  rarity: ExploreRarity;
};

export function regionsWithLocations(database: Database.Database): RegionKey[] {
  return database.prepare(`
    SELECT DISTINCT l.region_key AS regionKey
    FROM pokemon_locations l
    WHERE ${EXPLORABLE_LOCATION_SQL}
    ORDER BY l.region_key
  `).all().map((row) => (row as { regionKey: RegionKey }).regionKey);
}

export function locationsForRegion(database: Database.Database, regionKey: RegionKey): TravelLocation[] {
  return database.prepare(`
    SELECT l.key, l.display_name AS name, l.region_key AS regionKey,
      json_group_array(b.biome_key) AS biomeKeys
    FROM pokemon_locations l
    LEFT JOIN location_biomes b ON b.location_key = l.key
    WHERE l.region_key = ? AND (${EXPLORABLE_LOCATION_SQL})
    GROUP BY l.key, l.display_name, l.region_key
    ORDER BY l.display_name
  `).all(regionKey).map((row) => readTravelLocation(row as RawTravelLocation));
}

export function selectedLocationForPlayer(database: Database.Database, guildId: string, userId: string): TravelLocation | undefined {
  const location = database.prepare(`
    SELECT l.key, l.display_name AS name, l.region_key AS regionKey,
      json_group_array(b.biome_key) AS biomeKeys
    FROM player_locations p
    JOIN pokemon_locations l ON l.key = p.location_key
    LEFT JOIN location_biomes b ON b.location_key = l.key
    WHERE p.guild_id = ? AND p.user_id = ?
    GROUP BY l.key, l.display_name, l.region_key
  `).get(guildId, userId) as RawTravelLocation | undefined;
  return location ? readTravelLocation(location) : undefined;
}

export function setPlayerLocation(database: Database.Database, guildId: string, userId: string, locationKey: string): TravelLocation | undefined {
  const location = database.prepare(`
    SELECT l.key, l.display_name AS name, l.region_key AS regionKey,
      json_group_array(b.biome_key) AS biomeKeys
    FROM pokemon_locations l
    LEFT JOIN location_biomes b ON b.location_key = l.key
    WHERE l.key = ?
    GROUP BY l.key, l.display_name, l.region_key
  `).get(locationKey) as RawTravelLocation | undefined;
  if (!location) return undefined;
  database.prepare(`
    INSERT INTO player_locations (guild_id, user_id, location_key, selected_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET
      location_key = excluded.location_key,
      selected_at = excluded.selected_at
  `).run(guildId, userId, locationKey, Date.now());
  return readTravelLocation(location);
}

export function pokemonForLocation(database: Database.Database, location: TravelLocation): LocationPokemon[] {
  const rawEntries = database.prepare(`
    SELECT e.pokemon_national_dex AS nationalDex, e.rate AS weight, s.name_en AS nameEn
    FROM location_area_encounters e
    JOIN pokemon_species s ON s.national_dex = e.pokemon_national_dex
    WHERE e.location_key = ? AND e.encounter_method IN (${WILD_METHOD_SQL}) AND e.encounter_label = 'wild'
  `).all(location.key) as { nationalDex: number; weight: number; nameEn: string }[];
  const entries = rawEntries.length > 0 ? rawEntries : location.biomeKeys.length === 0 ? [] : database.prepare(`
    SELECT e.pokemon_national_dex AS nationalDex, e.weight, s.name_en AS nameEn
    FROM biome_encounters e
    JOIN pokemon_species s ON s.national_dex = e.pokemon_national_dex
    WHERE e.region_key = ? AND e.biome_key = ?
  `).all(location.regionKey, location.biomeKeys[0]) as { nationalDex: number; weight: number; nameEn: string }[];
  const totalWeight = entries.reduce((total, entry) => total + entry.weight, 0);
  const byPokemon = new Map<number, { nameEn: string; weight: number }>();
  for (const entry of entries) {
    const current = byPokemon.get(entry.nationalDex);
    byPokemon.set(entry.nationalDex, { nameEn: entry.nameEn, weight: (current?.weight ?? 0) + entry.weight });
  }
  return [...byPokemon.entries()]
    .map(([nationalDex, entry]) => ({ nationalDex, nameEn: entry.nameEn, rarity: rarityForChance(totalWeight === 0 ? 0 : entry.weight / totalWeight) }))
    .sort((left, right) => right.rarity.chance - left.rarity.chance || left.nationalDex - right.nationalDex);
}

type RawTravelLocation = Omit<TravelLocation, "biomeKeys"> & { biomeKeys: string };

function readTravelLocation(location: RawTravelLocation): TravelLocation {
  return { ...location, biomeKeys: (JSON.parse(location.biomeKeys) as (string | null)[]).filter((biomeKey): biomeKey is string => biomeKey !== null) };
}
