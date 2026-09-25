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
  assert.equal(regionCount.count, Object.keys(REGION_BIOMES).length);
  assert.equal(mappingCount.count, expectedMappings);
  database.close();
} finally {
  rmSync(directory, { recursive: true, force: true });
}

console.log("Verified SQLite region and biome data");
