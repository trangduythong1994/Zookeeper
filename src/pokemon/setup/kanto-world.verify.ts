import assert from "node:assert/strict";
import { KANTO_WORLD } from "./kanto-world.js";
import { REGION_BIOMES, channelNameForBiome } from "../data/regions.js";

assert.equal(KANTO_WORLD.categoryName, "Kanto");
assert.equal(REGION_BIOMES.kanto.length, 12);
assert.deepEqual(REGION_BIOMES.kanto.map(channelNameForBiome), ["prairie", "forest", "flower", "riverside", "lake", "beach", "ocean", "cave", "mountain", "rocky-area", "ruins", "town"]);
console.log("Verified Kanto world setup data");
