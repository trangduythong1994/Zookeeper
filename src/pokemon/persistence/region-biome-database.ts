import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { REGION_BIOMES } from "../data/regions.js";
import { ALL_GEN3_SPECIES } from "../data/all-gen3-species.js";
import { KANTO_ENCOUNTERS } from "../data/kanto-encounters.js";
import { KANTO_LOCATIONS } from "../data/kanto-locations.js";
import { JOHTO_HOENN_LOCATION_SOURCES } from "../data/johto-hoenn-locations.js";
import { POKEMON_GO_RATES } from "../data/pokemon-go-rates.js";

export function initializeRegionBiomeDatabase(databasePath: string): Database.Database {
  const absolutePath = resolve(databasePath);
  mkdirSync(dirname(absolutePath), { recursive: true });

  const database = new Database(absolutePath);
  database.pragma("foreign_keys = ON");
  database.exec(`
    CREATE TABLE IF NOT EXISTS regions (
      key TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS biomes (
      key TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS region_biomes (
      region_key TEXT NOT NULL REFERENCES regions(key),
      biome_key TEXT NOT NULL REFERENCES biomes(key),
      PRIMARY KEY (region_key, biome_key)
    );
    CREATE INDEX IF NOT EXISTS region_biomes_by_biome ON region_biomes (biome_key);
    CREATE TABLE IF NOT EXISTS pokemon_species (
      national_dex INTEGER PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name_en TEXT NOT NULL,
      name_vi TEXT,
      hp INTEGER NOT NULL,
      attack INTEGER NOT NULL,
      defense INTEGER NOT NULL,
      special_attack INTEGER NOT NULL,
      special_defense INTEGER NOT NULL,
      speed INTEGER NOT NULL,
      stat_total INTEGER NOT NULL,
      height_dm INTEGER NOT NULL,
      weight_hg INTEGER NOT NULL,
      capture_rate INTEGER NOT NULL,
      base_experience INTEGER NOT NULL,
      base_happiness INTEGER NOT NULL,
      growth_rate TEXT NOT NULL,
      gender_rate INTEGER NOT NULL,
      hatch_counter INTEGER NOT NULL,
      color TEXT NOT NULL,
      shape TEXT,
      habitat TEXT,
      is_baby INTEGER NOT NULL,
      is_legendary INTEGER NOT NULL,
      is_mythical INTEGER NOT NULL,
      go_capture_rate REAL NOT NULL DEFAULT 0,
      go_flee_rate REAL,
      evolves_from INTEGER REFERENCES pokemon_species(national_dex)
    );
    CREATE TABLE IF NOT EXISTS pokemon_types (
      national_dex INTEGER NOT NULL REFERENCES pokemon_species(national_dex) ON DELETE CASCADE,
      type_key TEXT NOT NULL,
      slot INTEGER NOT NULL,
      PRIMARY KEY (national_dex, type_key)
    );
    CREATE TABLE IF NOT EXISTS pokemon_abilities (
      national_dex INTEGER NOT NULL REFERENCES pokemon_species(national_dex) ON DELETE CASCADE,
      ability_key TEXT NOT NULL,
      is_hidden INTEGER NOT NULL,
      slot INTEGER NOT NULL,
      PRIMARY KEY (national_dex, ability_key)
    );
    CREATE TABLE IF NOT EXISTS pokemon_egg_groups (
      national_dex INTEGER NOT NULL REFERENCES pokemon_species(national_dex) ON DELETE CASCADE,
      egg_group_key TEXT NOT NULL,
      PRIMARY KEY (national_dex, egg_group_key)
    );
    CREATE TABLE IF NOT EXISTS pokemon_evolutions (
      from_national_dex INTEGER NOT NULL REFERENCES pokemon_species(national_dex) ON DELETE CASCADE,
      to_national_dex INTEGER NOT NULL REFERENCES pokemon_species(national_dex),
      method TEXT NOT NULL,
      min_level INTEGER,
      item_key TEXT,
      trigger_detail TEXT,
      PRIMARY KEY (from_national_dex, to_national_dex)
    );
    CREATE INDEX IF NOT EXISTS pokemon_evolutions_by_target ON pokemon_evolutions (to_national_dex);
    CREATE TABLE IF NOT EXISTS biome_encounters (
      region_key TEXT NOT NULL REFERENCES regions(key),
      biome_key TEXT NOT NULL REFERENCES biomes(key),
      time_key TEXT NOT NULL,
      pokemon_national_dex INTEGER NOT NULL REFERENCES pokemon_species(national_dex),
      weight INTEGER NOT NULL CHECK (weight > 0),
      min_level INTEGER NOT NULL CHECK (min_level > 0),
      max_level INTEGER NOT NULL CHECK (max_level >= min_level),
      conditions_json TEXT NOT NULL,
      PRIMARY KEY (region_key, biome_key, time_key, pokemon_national_dex, conditions_json)
    );
    CREATE INDEX IF NOT EXISTS biome_encounters_by_lookup ON biome_encounters (region_key, biome_key, time_key);
    CREATE TABLE IF NOT EXISTS pokemon_locations (
      key TEXT PRIMARY KEY,
      region_key TEXT NOT NULL REFERENCES regions(key),
      display_name TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS location_biomes (
      location_key TEXT NOT NULL REFERENCES pokemon_locations(key) ON DELETE CASCADE,
      biome_key TEXT NOT NULL REFERENCES biomes(key),
      PRIMARY KEY (location_key, biome_key)
    );
    CREATE TABLE IF NOT EXISTS player_locations (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      location_key TEXT NOT NULL REFERENCES pokemon_locations(key),
      selected_at INTEGER NOT NULL,
      PRIMARY KEY (guild_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS pokemon_warp_candies (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      amount INTEGER NOT NULL DEFAULT 0 CHECK (amount >= 0),
      PRIMARY KEY (guild_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS pokemon_warp_candy_settings (
      guild_id TEXT PRIMARY KEY,
      chance REAL NOT NULL CHECK (chance >= 0 AND chance <= 1)
    );
    CREATE TABLE IF NOT EXISTS pokemon_roaming_settings (
      guild_id TEXT PRIMARY KEY,
      chance REAL NOT NULL CHECK (chance >= 0 AND chance <= 1)
    );
    CREATE TABLE IF NOT EXISTS pokemon_event_announcements (
      guild_id TEXT NOT NULL,
      event_key TEXT NOT NULL,
      message_id TEXT NOT NULL,
      expires_at INTEGER,
      PRIMARY KEY (guild_id, event_key)
    );
    CREATE TABLE IF NOT EXISTS location_area_encounters (
      source_game_key TEXT NOT NULL,
      location_key TEXT NOT NULL REFERENCES pokemon_locations(key) ON DELETE CASCADE,
      area_key TEXT NOT NULL,
      pokemon_national_dex INTEGER NOT NULL REFERENCES pokemon_species(national_dex),
      encounter_method TEXT NOT NULL,
      rate INTEGER NOT NULL CHECK (rate > 0),
      min_level INTEGER NOT NULL CHECK (min_level > 0),
      max_level INTEGER NOT NULL CHECK (max_level >= min_level),
      conditions_json TEXT NOT NULL,
      encounter_label TEXT NOT NULL DEFAULT 'wild',
      PRIMARY KEY (source_game_key, area_key, pokemon_national_dex, encounter_method, rate, min_level, max_level, conditions_json)
    );
    CREATE INDEX IF NOT EXISTS location_area_encounters_by_location ON location_area_encounters (location_key);
    CREATE TABLE IF NOT EXISTS pokemon_spawns (
      message_id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      pokemon_national_dex INTEGER NOT NULL REFERENCES pokemon_species(national_dex),
      pokemon_name TEXT NOT NULL,
      region_key TEXT NOT NULL,
      location_key TEXT NOT NULL,
      location_name TEXT NOT NULL,
      encounter_rate REAL,
      encounter_rarity TEXT,
      go_capture_rate REAL NOT NULL,
      go_flee_rate REAL,
      is_event INTEGER NOT NULL DEFAULT 0,
      catch_sequence_length INTEGER,
      appeared_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('active', 'caught', 'fled')),
      caught_by_user_id TEXT,
      resolved_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS pokemon_spawns_by_expiry ON pokemon_spawns (state, expires_at);
    CREATE TABLE IF NOT EXISTS pokemon_catches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      spawn_message_id TEXT NOT NULL UNIQUE REFERENCES pokemon_spawns(message_id),
      pokemon_national_dex INTEGER NOT NULL REFERENCES pokemon_species(national_dex),
      region_key TEXT NOT NULL,
      location_key TEXT NOT NULL,
      caught_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pokemon_gift_cooldowns (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      last_gifted_at INTEGER NOT NULL,
      PRIMARY KEY (guild_id, user_id)
    );
    DROP TABLE IF EXISTS game_weather;
  `);
  ensureColumn(database, "pokemon_species", "go_capture_rate REAL NOT NULL DEFAULT 0");
  ensureColumn(database, "pokemon_species", "go_flee_rate REAL");
  ensureColumn(database, "pokemon_spawns", "encounter_rate REAL");
  ensureColumn(database, "pokemon_spawns", "encounter_rarity TEXT");
  ensureColumn(database, "pokemon_spawns", "is_event INTEGER NOT NULL DEFAULT 0");
  ensureColumn(database, "pokemon_spawns", "catch_sequence_length INTEGER");
  ensureColumn(database, "pokemon_event_announcements", "expires_at INTEGER");
  ensureColumn(database, "location_area_encounters", "encounter_label TEXT NOT NULL DEFAULT 'wild'");

  const insertRegion = database.prepare("INSERT OR IGNORE INTO regions (key, display_name) VALUES (?, ?)");
  const insertBiome = database.prepare("INSERT OR IGNORE INTO biomes (key, display_name) VALUES (?, ?)");
  const insertRegionBiome = database.prepare("INSERT OR IGNORE INTO region_biomes (region_key, biome_key) VALUES (?, ?)");
  const seed = database.transaction(() => {
    for (const [regionKey, biomes] of Object.entries(REGION_BIOMES)) {
      insertRegion.run(regionKey, displayName(regionKey));
      for (const biomeKey of biomes) {
        insertBiome.run(biomeKey, displayName(biomeKey));
        insertRegionBiome.run(regionKey, biomeKey);
      }
    }
  });
  seed();
  seedGenerationThreeSpecies(database);
  seedKantoEncounters(database);
  seedKantoLocations(database);
  seedJohtoHoennLocations(database);
  splitJohtoSafariZone(database);
  removeSourceRoamingLocations(database);
  removeCombinedSafariCatches(database);
  migrateKantoPilotLocations(database);
  backfillSpawnEncounterRates(database);
  return database;
}

function removeSourceRoamingLocations(database: Database.Database): void {
  database.transaction(() => {
    database.prepare("DELETE FROM location_area_encounters WHERE location_key IN ('johto-roaming-johto', 'hoenn-roaming-hoenn')").run();
    database.prepare("DELETE FROM player_locations WHERE location_key IN ('johto-roaming-johto', 'hoenn-roaming-hoenn')").run();
  })();
}

const JOHTO_SAFARI_LOCATION_KEY = "johto-johto-safari-zone";
const JOHTO_SAFARI_AREAS = [
  "desert", "forest", "marshland", "meadow", "mountain", "peak",
  "plains", "rocky-beach", "savannah", "swamp", "wasteland", "wetland",
] as const;

function splitJohtoSafariZone(database: Database.Database): void {
  const sourceRows = database.prepare(`
    SELECT area_key AS areaKey, pokemon_national_dex AS nationalDex, encounter_method AS method,
      rate, min_level AS minLevel, max_level AS maxLevel, conditions_json AS conditionsJson
    FROM location_area_encounters
    WHERE location_key = ? AND area_key = ?
  `);
  const insertLocation = database.prepare("INSERT OR IGNORE INTO pokemon_locations (key, region_key, display_name) VALUES (?, 'johto', ?)");
  const insertEncounter = database.prepare(`
    INSERT OR REPLACE INTO location_area_encounters (
      source_game_key, location_key, area_key, pokemon_national_dex, encounter_method, rate,
      min_level, max_level, conditions_json, encounter_label
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const deleteDerived = database.prepare("DELETE FROM location_area_encounters WHERE source_game_key GLOB 'zookeeper-safari:*'");
  const deleteCombined = database.prepare("DELETE FROM location_area_encounters WHERE location_key = ?");
  const movePlayers = database.prepare("UPDATE player_locations SET location_key = 'johto-safari-zone-plains' WHERE location_key = ?");
  const split = database.transaction(() => {
    deleteDerived.run();
    for (const area of JOHTO_SAFARI_AREAS) {
      const areaKey = `johto-johto-safari-zone-${area}`;
      const locationKey = `johto-safari-zone-${area}`;
      insertLocation.run(locationKey, `Safari Zone — ${displayName(area)}`);
      const rows = sourceRows.all(JOHTO_SAFARI_LOCATION_KEY, areaKey) as {
        areaKey: string; nationalDex: number; method: string; rate: number; minLevel: number; maxLevel: number; conditionsJson: string;
      }[];
      for (const row of rows) {
        const conditions = JSON.parse(row.conditionsJson) as string[];
        const requiresBlock = conditions.some((condition) => condition.startsWith("johto-safari-blocks-") && condition !== "johto-safari-blocks-inactive");
        insertEncounter.run(`zookeeper-safari:${area}`, locationKey, row.areaKey, row.nationalDex, row.method, row.rate, row.minLevel, row.maxLevel, row.conditionsJson, requiresBlock ? "safari-block" : "wild");
      }
    }
    deleteCombined.run(JOHTO_SAFARI_LOCATION_KEY);
    movePlayers.run(JOHTO_SAFARI_LOCATION_KEY);
  });
  split();
}

function removeCombinedSafariCatches(database: Database.Database): void {
  database.prepare(`
    DELETE FROM pokemon_catches
    WHERE spawn_message_id IN (
      SELECT message_id FROM pokemon_spawns WHERE location_key = ?
    )
  `).run(JOHTO_SAFARI_LOCATION_KEY);
}

function backfillSpawnEncounterRates(database: Database.Database): void {
  const wildMethods = ["walk", "surf", "old-rod", "good-rod", "super-rod", "rock-smash", "headbutt", "roaming-grass", "roaming-water"];
  const wildSql = wildMethods.map((method) => `'${method}'`).join(", ");
  const missingSpawns = database.prepare(`
    SELECT message_id AS messageId, region_key AS regionKey, location_key AS locationKey, pokemon_national_dex AS nationalDex
    FROM pokemon_spawns WHERE encounter_rate IS NULL
  `).all() as { messageId: string; regionKey: string; locationKey: string; nationalDex: number }[];
  const rawChance = database.prepare(`
    SELECT CAST(SUM(CASE WHEN pokemon_national_dex = ? THEN rate ELSE 0 END) AS REAL) / SUM(rate) AS chance
    FROM location_area_encounters WHERE location_key = ? AND encounter_method IN (${wildSql})
  `);
  const locationBiomes = database.prepare("SELECT biome_key AS biomeKey FROM location_biomes WHERE location_key = ?");
  const biomeChance = database.prepare(`
    SELECT CAST(SUM(CASE WHEN pokemon_national_dex = ? THEN weight ELSE 0 END) AS REAL) / SUM(weight) AS chance
    FROM biome_encounters WHERE region_key = ? AND biome_key = ?
  `);
  const update = database.prepare("UPDATE pokemon_spawns SET encounter_rate = ?, encounter_rarity = ? WHERE message_id = ?");
  const backfill = database.transaction(() => {
    for (const spawn of missingSpawns) {
      const raw = rawChance.get(spawn.nationalDex, spawn.locationKey) as { chance: number | null } | undefined;
      let chance = raw?.chance ?? null;
      if (chance === null || chance <= 0) {
        const biomes = locationBiomes.all(spawn.locationKey) as { biomeKey: string }[];
        for (const biome of biomes) {
          const biomeRate = (biomeChance.get(spawn.nationalDex, spawn.regionKey, biome.biomeKey) as { chance: number | null } | undefined)?.chance ?? null;
          if (biomeRate !== null && biomeRate > 0) {
            chance = biomeRate;
            break;
          }
        }
      }
      if (chance === null || chance <= 0) continue;
      update.run(chance, rarityKeyForChance(chance), spawn.messageId);
    }
  });
  backfill();
}

function rarityKeyForChance(chance: number): string {
  if (chance >= 0.2) return "common";
  if (chance >= 0.05) return "uncommon";
  if (chance >= 0.01) return "rare";
  if (chance >= 0.001) return "ultra_rare";
  return "mythic_rare";
}

function seedJohtoHoennLocations(database: Database.Database): void {
  const insertLocation = database.prepare("INSERT OR IGNORE INTO pokemon_locations (key, region_key, display_name) VALUES (?, ?, ?)");
  const insertEncounter = database.prepare(`
    INSERT OR IGNORE INTO location_area_encounters (
      source_game_key, location_key, area_key, pokemon_national_dex, encounter_method, rate, min_level, max_level, conditions_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const seed = database.transaction(() => {
    for (const source of JOHTO_HOENN_LOCATION_SOURCES) {
      for (const location of source.locations) {
        insertLocation.run(location.key, source.regionKey, location.name);
        for (const area of location.areas) {
          for (const encounter of area.encounters) {
            insertEncounter.run(source.gameKey, location.key, area.key, encounter.pokemonNationalDex, encounter.method, encounter.rate, encounter.minLevel, encounter.maxLevel, JSON.stringify(encounter.conditions));
          }
        }
      }
    }
  });
  seed();
}

function seedKantoLocations(database: Database.Database): void {
  const insertLocation = database.prepare("INSERT OR IGNORE INTO pokemon_locations (key, region_key, display_name) VALUES (?, 'kanto', ?)");
  const insertBiome = database.prepare("INSERT OR IGNORE INTO location_biomes (location_key, biome_key) VALUES (?, ?)");
  const seed = database.transaction(() => {
    for (const location of KANTO_LOCATIONS) {
      insertLocation.run(location.key, location.name);
      for (const biomeKey of location.biomeKeys) insertBiome.run(location.key, biomeKey);
    }
  });
  seed();
}

function migrateKantoPilotLocations(database: Database.Database): void {
  const replacements: Record<string, string> = {
    "kanto-route-1": "kanto-kanto-route-1",
    "viridian-forest": "kanto-viridian-forest",
    "kanto-route-24": "kanto-kanto-route-24",
    "kanto-route-6": "kanto-kanto-route-6",
    "cerulean-cave": "kanto-cerulean-cave",
    "kanto-route-19": "kanto-kanto-sea-route-19",
    "kanto-route-20": "kanto-kanto-sea-route-20",
    "mt-moon": "kanto-mt-moon",
    "rock-tunnel": "kanto-rock-tunnel",
    "kanto-route-10": "kanto-kanto-route-10",
    "pokemon-tower": "kanto-pokemon-tower",
    "saffron-city": "kanto-saffron-city",
  };
  const migratePlayerLocation = database.prepare("UPDATE player_locations SET location_key = ? WHERE location_key = ?");
  const removePilotBiome = database.prepare("DELETE FROM location_biomes WHERE location_key = ?");
  const migrate = database.transaction(() => {
    for (const [oldKey, newKey] of Object.entries(replacements)) {
      migratePlayerLocation.run(newKey, oldKey);
      removePilotBiome.run(oldKey);
    }
  });
  migrate();
}

function seedGenerationThreeSpecies(database: Database.Database): void {
  const insertSpecies = database.prepare(`
    INSERT INTO pokemon_species (
      national_dex, slug, name_en, name_vi, hp, attack, defense, special_attack, special_defense, speed, stat_total,
      height_dm, weight_hg, capture_rate, base_experience, base_happiness, growth_rate, gender_rate, hatch_counter,
      color, shape, habitat, is_baby, is_legendary, is_mythical, go_capture_rate, go_flee_rate, evolves_from
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(national_dex) DO UPDATE SET
      slug = excluded.slug, name_en = excluded.name_en, name_vi = excluded.name_vi,
      hp = excluded.hp, attack = excluded.attack, defense = excluded.defense, special_attack = excluded.special_attack,
      special_defense = excluded.special_defense, speed = excluded.speed, stat_total = excluded.stat_total,
      height_dm = excluded.height_dm, weight_hg = excluded.weight_hg, capture_rate = excluded.capture_rate,
      base_experience = excluded.base_experience, base_happiness = excluded.base_happiness, growth_rate = excluded.growth_rate,
      gender_rate = excluded.gender_rate, hatch_counter = excluded.hatch_counter, color = excluded.color, shape = excluded.shape,
      habitat = excluded.habitat, is_baby = excluded.is_baby, is_legendary = excluded.is_legendary,
      is_mythical = excluded.is_mythical, go_capture_rate = excluded.go_capture_rate,
      go_flee_rate = excluded.go_flee_rate, evolves_from = excluded.evolves_from
  `);
  const insertType = database.prepare("INSERT OR REPLACE INTO pokemon_types (national_dex, type_key, slot) VALUES (?, ?, ?)");
  const insertAbility = database.prepare("INSERT OR REPLACE INTO pokemon_abilities (national_dex, ability_key, is_hidden, slot) VALUES (?, ?, ?, ?)");
  const insertEggGroup = database.prepare("INSERT OR REPLACE INTO pokemon_egg_groups (national_dex, egg_group_key) VALUES (?, ?)");
  const insertEvolution = database.prepare("INSERT OR REPLACE INTO pokemon_evolutions (from_national_dex, to_national_dex, method, min_level, item_key, trigger_detail) VALUES (?, ?, ?, ?, ?, ?)");
  const seed = database.transaction(() => {
    for (const species of ALL_GEN3_SPECIES) {
      const stats = species.baseStats;
      const goRates = POKEMON_GO_RATES[species.nationalDex];
      if (!goRates) throw new Error(`Missing Pokémon GO rates for #${species.nationalDex}`);
      insertSpecies.run(species.nationalDex, species.slug, species.nameEn, species.nameVi, stats.hp, stats.attack, stats.defense, stats.specialAttack, stats.specialDefense, stats.speed, stats.total, species.heightDm, species.weightHg, species.captureRate, species.baseExperience, species.baseHappiness, species.growthRate, species.genderRate, species.hatchCounter, species.color, species.shape, species.habitat, Number(species.isBaby), Number(species.isLegendary), Number(species.isMythical), goRates.captureRate, goRates.fleeRate, species.evolvesFrom);
    }
    for (const species of ALL_GEN3_SPECIES) {
      species.types.forEach((type, index) => insertType.run(species.nationalDex, type, index + 1));
      species.abilities.normal.forEach((ability, index) => insertAbility.run(species.nationalDex, ability, 0, index + 1));
      species.abilities.hidden.forEach((ability, index) => insertAbility.run(species.nationalDex, ability, 1, index + 1));
      species.eggGroups.forEach((eggGroup) => insertEggGroup.run(species.nationalDex, eggGroup));
      for (const evolution of species.evolutions) {
        insertEvolution.run(species.nationalDex, evolution.toNationalDex, evolution.method, evolution.minLevel, evolution.item, evolution.triggerDetail);
      }
    }
  });
  seed();
}

function ensureColumn(database: Database.Database, table: string, definition: string): void {
  const column = definition.split(" ")[0];
  const columns = database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((entry) => entry.name === column)) database.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
}

function seedKantoEncounters(database: Database.Database): void {
  const deleteKantoEncounters = database.prepare("DELETE FROM biome_encounters WHERE region_key = 'kanto'");
  const insertEncounter = database.prepare(`
    INSERT INTO biome_encounters (region_key, biome_key, time_key, pokemon_national_dex, weight, min_level, max_level, conditions_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const seed = database.transaction(() => {
    deleteKantoEncounters.run();
    for (const encounter of KANTO_ENCOUNTERS) {
      insertEncounter.run(encounter.region, encounter.biome, encounter.time, encounter.pokemonNationalDex, encounter.weight, encounter.minLevel, encounter.maxLevel, JSON.stringify(encounter.conditions));
    }
  });
  seed();
}

function displayName(key: string): string {
  return key.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
