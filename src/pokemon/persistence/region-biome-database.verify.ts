import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initializeRegionBiomeDatabase } from "./region-biome-database.js";

const directory = mkdtempSync(join(tmpdir(), "zookeeper-db-"));
try {
  const database = initializeRegionBiomeDatabase(join(directory, "test.sqlite"));
  const regionCount = database.prepare("SELECT COUNT(*) AS count FROM regions").get() as { count: number };
  const speciesCount = database.prepare("SELECT COUNT(*) AS count FROM pokemon_species").get() as { count: number };
  const typeCount = database.prepare("SELECT COUNT(*) AS count FROM pokemon_types").get() as { count: number };
  const evolutionCount = database.prepare("SELECT COUNT(*) AS count FROM pokemon_evolutions").get() as { count: number };
  const locationEncounterCount = database.prepare("SELECT COUNT(*) AS count FROM location_area_encounters").get() as { count: number };
  const johtoLocationCount = database.prepare("SELECT COUNT(*) AS count FROM pokemon_locations WHERE region_key = 'johto'").get() as { count: number };
  const hoennLocationCount = database.prepare("SELECT COUNT(*) AS count FROM pokemon_locations WHERE region_key = 'hoenn'").get() as { count: number };
  const wildSpeciesCount = database.prepare("SELECT COUNT(DISTINCT pokemon_national_dex) AS count FROM location_area_encounters WHERE encounter_label = 'wild'").get() as { count: number };
  const acquisitionCount = database.prepare("SELECT COUNT(*) AS count FROM pokemon_acquisitions").get() as { count: number };
  const hiddenAcquisitionCount = database.prepare("SELECT COUNT(*) AS count FROM pokemon_acquisitions WHERE hidden = 1").get() as { count: number };
  const invalidRateTotalCount = database.prepare(`
    SELECT COUNT(*) AS count FROM (
      SELECT location_key FROM location_area_encounters WHERE encounter_label = 'wild'
      GROUP BY location_key HAVING SUM(rate) != 10000
    )
  `).get() as { count: number };
  const biomeCount = database.prepare("SELECT COUNT(*) AS count FROM biomes").get() as { count: number };
  assert.equal(regionCount.count, 3);
  assert.equal(speciesCount.count, 386);
  assert.ok(typeCount.count >= 218);
  assert.ok(evolutionCount.count > 0);
  assert.equal(biomeCount.count, 0);
  assert.equal(locationEncounterCount.count, 808);
  assert.equal(wildSpeciesCount.count, 237);
  assert.equal(acquisitionCount.count, 152);
  assert.equal(hiddenAcquisitionCount.count, 2);
  assert.equal(invalidRateTotalCount.count, 0);
  assert.ok(johtoLocationCount.count > 0);
  assert.ok(hoennLocationCount.count > 0);
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
