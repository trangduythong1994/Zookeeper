import type Database from "better-sqlite3";

export const DEFAULT_WARP_CANDY_CHANCE = 0.002;

export function findsWarpCandy(random = Math.random, chance = DEFAULT_WARP_CANDY_CHANCE): boolean {
  return random() < chance;
}

export function warpCandyChance(database: Database.Database, guildId: string): number {
  return (database.prepare("SELECT chance FROM pokemon_warp_candy_settings WHERE guild_id = ?").get(guildId) as { chance: number } | undefined)?.chance ?? DEFAULT_WARP_CANDY_CHANCE;
}

export function setWarpCandyChance(database: Database.Database, guildId: string, chance: number): void {
  if (!Number.isFinite(chance) || chance < 0 || chance > 1) throw new RangeError("Warp Candy chance must be between 0 and 1.");
  database.prepare(`
    INSERT INTO pokemon_warp_candy_settings (guild_id, chance) VALUES (?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET chance = excluded.chance
  `).run(guildId, chance);
}

export function addWarpCandy(database: Database.Database, guildId: string, userId: string): number {
  database.prepare(`
    INSERT INTO pokemon_warp_candies (guild_id, user_id, amount)
    VALUES (?, ?, 1)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET amount = amount + 1
  `).run(guildId, userId);
  return warpCandyCount(database, guildId, userId);
}

export function warpCandyCount(database: Database.Database, guildId: string, userId: string): number {
  return (database.prepare("SELECT amount FROM pokemon_warp_candies WHERE guild_id = ? AND user_id = ?").get(guildId, userId) as { amount: number } | undefined)?.amount ?? 0;
}

export function consumeWarpCandy(database: Database.Database, guildId: string, userId: string): boolean {
  return database.prepare("UPDATE pokemon_warp_candies SET amount = amount - 1 WHERE guild_id = ? AND user_id = ? AND amount > 0").run(guildId, userId).changes === 1;
}
