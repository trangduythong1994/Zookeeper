import assert from "node:assert/strict";
import { channelNameForBiome, PRIVATE_TEST_REGION_KEYS, REGION_BIOMES } from "./regions.js";

assert.equal(Object.keys(REGION_BIOMES).length, 11);
assert.deepEqual(PRIVATE_TEST_REGION_KEYS, ["kanto", "hoenn"]);
assert.equal(REGION_BIOMES.hoenn.includes("underwater"), true);
assert.equal(REGION_BIOMES.unova.includes("chargestone"), true);
assert.equal(channelNameForBiome("rocky_area"), "rocky-area");

console.log("Verified Pokémon region and biome configuration");
