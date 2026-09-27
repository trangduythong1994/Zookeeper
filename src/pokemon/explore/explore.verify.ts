import assert from "node:assert/strict";
import { chooseWeightedEncounter, exploreButtonId, exploreContextFromChannel, isWildEncounterMethod, parseExploreButtonId, rarityForChance, rollLevel } from "./explore.js";

const context = exploreContextFromChannel("rocky-area", "Kanto");
assert.deepEqual(context, { regionKey: "kanto", biomeKey: "rocky_area" });
assert.equal(exploreContextFromChannel("general", "Kanto"), undefined);
assert.equal(exploreContextFromChannel("forest", "Other"), undefined);
const encounters = [
  { nationalDex: 1, weight: 20, minLevel: 2, maxLevel: 6, nameEn: "Bulbasaur", slug: "bulbasaur" },
  { nationalDex: 4, weight: 80, minLevel: 3, maxLevel: 7, nameEn: "Charmander", slug: "charmander" },
];
assert.equal(chooseWeightedEncounter(encounters, () => 0)?.nationalDex, 1);
assert.equal(chooseWeightedEncounter(encounters, () => 0.99)?.nationalDex, 4);
assert.equal(rollLevel(encounters[0], () => 0), 2);
assert.equal(rollLevel(encounters[0], () => 0.99), 6);
assert.equal(isWildEncounterMethod("walk"), true);
assert.equal(isWildEncounterMethod("super-rod"), true);
assert.equal(isWildEncounterMethod("gift"), false);
assert.equal(isWildEncounterMethod("npc-trade"), false);
assert.equal(isWildEncounterMethod("static"), false);
assert.equal(isWildEncounterMethod("overworld-flying"), true);
assert.equal(isWildEncounterMethod("seaweed"), true);
assert.equal(isWildEncounterMethod("feebas-tile-fishing"), true);
assert.equal(rarityForChance(0.2).key, "common");
assert.equal(rarityForChance(0.05).key, "uncommon");
assert.equal(rarityForChance(0.01).key, "rare");
assert.equal(rarityForChance(0.001).key, "ultra_rare");
assert.equal(rarityForChance(0.0009).key, "mythic_rare");

assert.ok(context);
const buttonId = exploreButtonId(context);
assert.deepEqual(parseExploreButtonId(buttonId), { regionKey: "kanto", biomeKey: "rocky_area" });
assert.equal(parseExploreButtonId("pk-explore:kanto:unknown"), undefined);
console.log("Verified wild-only Pokémon explore rules");
