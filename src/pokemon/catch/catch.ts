import type Database from "better-sqlite3";

export const CATCH_BUTTON_ID = "pk-catch";
export const CATCH_PLAY_PREFIX = "pk-catch-play";
export const CATCH_INPUT_PREFIX = "pk-catch-input";
export const CATCH_SYMBOLS = ["🟢", "🟦", "🔶", "⭐"] as const;
export const SPAWN_LIFETIME_MS = 60_000;
export const EXPLORE_COOLDOWN_MS = 5_000;

export type CatchSymbolIndex = 0 | 1 | 2 | 3;
export type CatchSession = {
  sequence: CatchSymbolIndex[];
  progress: number;
  close?: (content: string) => Promise<void>;
};

export type PokemonSpawn = {
  messageId: string;
  guildId: string;
  channelId: string;
  pokemonNationalDex: number;
  pokemonName: string;
  regionKey: string;
  locationKey: string;
  locationName: string;
  encounterRate: number | null;
  encounterRarity: string | null;
  goCaptureRate: number;
  goFleeRate: number | null;
  appearedAt: number;
  expiresAt: number;
  state: "active" | "caught" | "fled";
  caughtByUserId: string | null;
  resolvedAt: number | null;
};

export type CaughtPokemon = {
  nationalDex: number;
  nameEn: string;
  slug: string;
  caughtAt: number;
  catchCount: number;
  regionKey: string;
  locationName: string;
  encounterRate: number | null;
  encounterRarity: string | null;
  goCaptureRate: number;
  goFleeRate: number | null;
  typesCsv: string;
};

export function sequenceLengthForCatchRate(captureRate: number): number {
  if (captureRate >= 40) return 4;
  if (captureRate >= 20) return 6;
  if (captureRate >= 10) return 8;
  if (captureRate >= 5) return 10;
  return 12;
}

export function previewDurationMs(sequenceLength: number): number {
  return 800 + sequenceLength * 160;
}

export function createCatchSession(captureRate: number, random = Math.random): CatchSession {
  const sequence = Array.from({ length: sequenceLengthForCatchRate(captureRate) }, () => Math.floor(random() * CATCH_SYMBOLS.length) as CatchSymbolIndex);
  return { sequence, progress: 0 };
}

export function catchPlayId(messageId: string, userId: string): string {
  return `${CATCH_PLAY_PREFIX}:${messageId}:${userId}`;
}

export function parseCatchPlayId(customId: string): { messageId: string; userId: string } | undefined {
  const [prefix, messageId, userId, ...extra] = customId.split(":");
  if (prefix !== CATCH_PLAY_PREFIX || !messageId || !userId || extra.length > 0) return undefined;
  return { messageId, userId };
}

export function catchInputId(messageId: string, userId: string, symbolIndex: CatchSymbolIndex): string {
  return `${CATCH_INPUT_PREFIX}:${messageId}:${userId}:${symbolIndex}`;
}

export function parseCatchInputId(customId: string): { messageId: string; userId: string; symbolIndex: CatchSymbolIndex } | undefined {
  const [prefix, messageId, userId, symbolText, ...extra] = customId.split(":");
  const symbolIndex = Number(symbolText);
  if (prefix !== CATCH_INPUT_PREFIX || !messageId || !userId || extra.length > 0 || !Number.isInteger(symbolIndex) || symbolIndex < 0 || symbolIndex >= CATCH_SYMBOLS.length) return undefined;
  return { messageId, userId, symbolIndex: symbolIndex as CatchSymbolIndex };
}

export function addPokemonSpawn(database: Database.Database, spawn: Omit<PokemonSpawn, "state" | "caughtByUserId" | "resolvedAt">): void {
  database.prepare(`
    INSERT INTO pokemon_spawns (
      message_id, guild_id, channel_id, pokemon_national_dex, pokemon_name, region_key, location_key, location_name,
      encounter_rate, encounter_rarity, go_capture_rate, go_flee_rate, appeared_at, expires_at, state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
  `).run(spawn.messageId, spawn.guildId, spawn.channelId, spawn.pokemonNationalDex, spawn.pokemonName, spawn.regionKey, spawn.locationKey, spawn.locationName, spawn.encounterRate, spawn.encounterRarity, spawn.goCaptureRate, spawn.goFleeRate, spawn.appearedAt, spawn.expiresAt);
}

export function pokemonSpawn(database: Database.Database, messageId: string): PokemonSpawn | undefined {
  return database.prepare(`
    SELECT message_id AS messageId, guild_id AS guildId, channel_id AS channelId, pokemon_national_dex AS pokemonNationalDex,
      pokemon_name AS pokemonName, region_key AS regionKey, location_key AS locationKey, location_name AS locationName,
      encounter_rate AS encounterRate, encounter_rarity AS encounterRarity, go_capture_rate AS goCaptureRate, go_flee_rate AS goFleeRate, appeared_at AS appearedAt, expires_at AS expiresAt,
      state, caught_by_user_id AS caughtByUserId, resolved_at AS resolvedAt
    FROM pokemon_spawns WHERE message_id = ?
  `).get(messageId) as PokemonSpawn | undefined;
}

export function activeSpawnInChannel(database: Database.Database, guildId: string, channelId: string, now = Date.now()): PokemonSpawn | undefined {
  return database.prepare(`
    SELECT message_id AS messageId, guild_id AS guildId, channel_id AS channelId, pokemon_national_dex AS pokemonNationalDex,
      pokemon_name AS pokemonName, region_key AS regionKey, location_key AS locationKey, location_name AS locationName,
      encounter_rate AS encounterRate, encounter_rarity AS encounterRarity, go_capture_rate AS goCaptureRate, go_flee_rate AS goFleeRate, appeared_at AS appearedAt, expires_at AS expiresAt,
      state, caught_by_user_id AS caughtByUserId, resolved_at AS resolvedAt
    FROM pokemon_spawns
    WHERE guild_id = ? AND channel_id = ? AND state = 'active' AND expires_at > ?
    ORDER BY appeared_at DESC LIMIT 1
  `).get(guildId, channelId, now) as PokemonSpawn | undefined;
}

export function caughtPokemonForPlayer(database: Database.Database, guildId: string, userId: string): CaughtPokemon[] {
  return database.prepare(`
    SELECT c.pokemon_national_dex AS nationalDex, s.name_en AS nameEn, s.slug, c.caught_at AS caughtAt,
      (SELECT COUNT(*) FROM pokemon_catches counted WHERE counted.guild_id = c.guild_id AND counted.user_id = c.user_id AND counted.pokemon_national_dex = c.pokemon_national_dex) AS catchCount,
      p.region_key AS regionKey, p.location_name AS locationName, p.encounter_rate AS encounterRate,
      p.encounter_rarity AS encounterRarity, p.go_capture_rate AS goCaptureRate, p.go_flee_rate AS goFleeRate,
      (SELECT group_concat(type_key, ',') FROM (SELECT type_key FROM pokemon_types WHERE national_dex = c.pokemon_national_dex ORDER BY slot)) AS typesCsv
    FROM pokemon_catches c
    JOIN pokemon_species s ON s.national_dex = c.pokemon_national_dex
    JOIN pokemon_spawns p ON p.message_id = c.spawn_message_id
    WHERE c.guild_id = ? AND c.user_id = ?
      AND c.id = (SELECT MAX(latest.id) FROM pokemon_catches latest WHERE latest.guild_id = c.guild_id AND latest.user_id = c.user_id AND latest.pokemon_national_dex = c.pokemon_national_dex)
    ORDER BY caughtAt DESC
  `).all(guildId, userId) as CaughtPokemon[];
}

export function resolvePokemonCaught(database: Database.Database, messageId: string, userId: string, now = Date.now()): PokemonSpawn | undefined {
  const resolve = database.transaction(() => {
    const updated = database.prepare(`UPDATE pokemon_spawns SET state = 'caught', caught_by_user_id = ?, resolved_at = ? WHERE message_id = ? AND state = 'active' AND expires_at > ?`).run(userId, now, messageId, now);
    if (updated.changes !== 1) return undefined;
    const spawn = pokemonSpawn(database, messageId);
    if (!spawn) return undefined;
    database.prepare(`INSERT INTO pokemon_catches (guild_id, user_id, spawn_message_id, pokemon_national_dex, region_key, location_key, caught_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(spawn.guildId, userId, messageId, spawn.pokemonNationalDex, spawn.regionKey, spawn.locationKey, now);
    return spawn;
  });
  return resolve();
}

export function resolvePokemonFled(database: Database.Database, messageId: string, now = Date.now()): PokemonSpawn | undefined {
  const updated = database.prepare(`UPDATE pokemon_spawns SET state = 'fled', resolved_at = ? WHERE message_id = ? AND state = 'active'`).run(now, messageId);
  return updated.changes === 1 ? pokemonSpawn(database, messageId) : undefined;
}
