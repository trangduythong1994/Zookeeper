import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { locationsForRegion, regionsWithLocations, selectedLocationForPlayer, setPlayerLocation } from "./travel.js";

const database = new Database(":memory:");
database.exec(`
  CREATE TABLE pokemon_locations (key TEXT PRIMARY KEY, region_key TEXT NOT NULL, display_name TEXT NOT NULL);
  CREATE TABLE location_biomes (location_key TEXT NOT NULL, biome_key TEXT NOT NULL, PRIMARY KEY (location_key, biome_key));
  CREATE TABLE location_area_encounters (location_key TEXT NOT NULL, pokemon_national_dex INTEGER NOT NULL, encounter_method TEXT NOT NULL, encounter_label TEXT NOT NULL DEFAULT 'wild');
  CREATE TABLE player_locations (guild_id TEXT NOT NULL, user_id TEXT NOT NULL, location_key TEXT NOT NULL, selected_at INTEGER NOT NULL, PRIMARY KEY (guild_id, user_id));
`);
database.prepare("INSERT INTO pokemon_locations VALUES (?, ?, ?)").run("viridian-forest", "kanto", "Viridian Forest");
database.prepare("INSERT INTO location_biomes VALUES (?, ?)").run("viridian-forest", "forest");
database.prepare("INSERT INTO pokemon_locations VALUES (?, ?, ?)").run("gift-house", "kanto", "Gift House");
database.prepare("INSERT INTO location_area_encounters (location_key, pokemon_national_dex, encounter_method) VALUES (?, ?, ?)").run("gift-house", 1, "gift");
database.prepare("INSERT INTO pokemon_locations VALUES (?, ?, ?)").run("legendary-roam", "kanto", "Legendary Roam");
database.prepare("INSERT INTO location_area_encounters (location_key, pokemon_national_dex, encounter_method) VALUES (?, ?, ?)").run("legendary-roam", 2, "roaming-grass");
assert.deepEqual(regionsWithLocations(database), ["kanto"]);
assert.deepEqual(locationsForRegion(database, "kanto"), [
  { key: "legendary-roam", name: "Legendary Roam", regionKey: "kanto", biomeKeys: [] },
  { key: "viridian-forest", name: "Viridian Forest", regionKey: "kanto", biomeKeys: ["forest"] },
]);
assert.equal(selectedLocationForPlayer(database, "guild", "user"), undefined);
assert.deepEqual(setPlayerLocation(database, "guild", "user", "viridian-forest"), { key: "viridian-forest", name: "Viridian Forest", regionKey: "kanto", biomeKeys: ["forest"] });
assert.equal(selectedLocationForPlayer(database, "guild", "user")?.key, "viridian-forest");
database.close();
console.log("Verified Pokémon travel location state");
