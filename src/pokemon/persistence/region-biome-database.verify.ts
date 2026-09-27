import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { REGION_BIOMES } from "../data/regions.js";
import { initializeRegionBiomeDatabase } from "./region-biome-database.js";

const directory = mkdtempSync(join(tmpdir(), "zookeeper-db-"));
try {
  const database = initializeRegionBiomeDatabase(join(directory, "test.sqlite"));
  const expectedMappings = Object.values(REGION_BIOMES).reduce((total, biomes) => total + biomes.length, 0);
  const regionCount = database.prepare("SELECT COUNT(*) AS count FROM regions").get() as { count: number };
  const mappingCount = database.prepare("SELECT COUNT(*) AS count FROM region_biomes").get() as { count: number };
  const speciesCount = database.prepare("SELECT COUNT(*) AS count FROM pokemon_species").get() as { count: number };
  const typeCount = database.prepare("SELECT COUNT(*) AS count FROM pokemon_types").get() as { count: number };
  const evolutionCount = database.prepare("SELECT COUNT(*) AS count FROM pokemon_evolutions").get() as { count: number };
  const encounterCount = database.prepare("SELECT COUNT(*) AS count FROM biome_encounters").get() as { count: number };
  const locationEncounterCount = database.prepare("SELECT COUNT(*) AS count FROM location_area_encounters").get() as { count: number };
  const johtoLocationCount = database.prepare("SELECT COUNT(*) AS count FROM pokemon_locations WHERE region_key = 'johto'").get() as { count: number };
  const hoennLocationCount = database.prepare("SELECT COUNT(*) AS count FROM pokemon_locations WHERE region_key = 'hoenn'").get() as { count: number };
  const safariSubzoneCount = database.prepare("SELECT COUNT(*) AS count FROM pokemon_locations WHERE display_name LIKE 'Safari Zone — %'").get() as { count: number };
  const safariBlockCount = database.prepare("SELECT COUNT(*) AS count FROM location_area_encounters WHERE encounter_label = 'safari-block'").get() as { count: number };
  const combinedSafariEncounterCount = database.prepare("SELECT COUNT(*) AS count FROM location_area_encounters WHERE location_key = 'johto-johto-safari-zone'").get() as { count: number };
  assert.equal(regionCount.count, Object.keys(REGION_BIOMES).length);
  assert.equal(speciesCount.count, 386);
  assert.equal(mappingCount.count, expectedMappings);
  assert.ok(typeCount.count >= 218);
  assert.ok(evolutionCount.count > 0);
  assert.equal(encounterCount.count, 288);
  assert.ok(locationEncounterCount.count > 0);
  assert.ok(johtoLocationCount.count > 0);
  assert.ok(hoennLocationCount.count > 0);
  assert.equal(safariSubzoneCount.count, 12);
  assert.ok(safariBlockCount.count > 0);
  assert.equal(combinedSafariEncounterCount.count, 0);
  database.close();
} finally {
  try {
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    // Windows can briefly retain the SQLite handle after close; the temp
    // directory is isolated and is cleaned by the operating system later.
  }
}

console.log("Verified SQLite region and biome data");
