import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { DEFAULT_ROAMING_CHANCE, roamingChance, roamingPokemonForRegion, setRoamingChance } from "./roaming.js";

const database = new Database(":memory:");
database.exec(`
  CREATE TABLE pokemon_roaming_settings (guild_id TEXT PRIMARY KEY, chance REAL NOT NULL);
  CREATE TABLE pokemon_species (national_dex INTEGER PRIMARY KEY, slug TEXT, name_en TEXT, go_capture_rate REAL, go_flee_rate REAL);
  CREATE TABLE pokemon_types (national_dex INTEGER, type_key TEXT, slot INTEGER);
  INSERT INTO pokemon_species VALUES
    (243, 'raikou', 'Raikou', 2, 4), (244, 'entei', 'Entei', 2, 4), (245, 'suicune', 'Suicune', 2, 4),
    (380, 'latias', 'Latias', 2, 1), (381, 'latios', 'Latios', 2, 1);
  INSERT INTO pokemon_types VALUES (243, 'electric', 1), (244, 'fire', 1), (245, 'water', 1), (380, 'dragon', 1), (381, 'dragon', 1);
`);
assert.equal(roamingChance(database, "guild"), DEFAULT_ROAMING_CHANCE);
setRoamingChance(database, "guild", 0.01);
assert.equal(roamingChance(database, "guild"), 0.01);
assert.equal(roamingPokemonForRegion(database, "kanto", 0.001, () => 0.001), undefined);
const kanto = roamingPokemonForRegion(database, "kanto", 0.001, (() => { let index = 0; return () => [0, 0.99][index++]; })());
assert.equal(kanto?.nationalDex, 245);
assert.equal(kanto?.rarity.chance, 0.001);
const hoenn = roamingPokemonForRegion(database, "hoenn", 0.001, (() => { let index = 0; return () => [0, 0.99][index++]; })());
assert.equal(hoenn?.nationalDex, 381);
console.log("Verified Roaming Pokémon rates and regional pools");
