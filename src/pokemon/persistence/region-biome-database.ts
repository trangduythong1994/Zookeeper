import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { REGION_BIOMES } from "../data/regions.js";

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
  `);

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
  return database;
}

function displayName(key: string): string {
  return key.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
