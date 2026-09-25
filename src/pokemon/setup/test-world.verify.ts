import assert from "node:assert/strict";
import { biomeStatusMessage, TEST_WORLD } from "./test-world.js";

assert.equal(TEST_WORLD.biomes.length, 4);
assert.equal(new Set(TEST_WORLD.biomes.map((biome) => biome.channelName)).size, TEST_WORLD.biomes.length);
assert.match(biomeStatusMessage("Kanto (Test)", TEST_WORLD.biomes[0]), /PK_SETUP_BIOME:forest/);
console.log("Verified Pokémon test-world setup data");
