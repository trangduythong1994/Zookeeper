import assert from "node:assert/strict";
import { KANTO_ENCOUNTERS } from "./kanto-encounters.js";

const groups = new Map<string, typeof KANTO_ENCOUNTERS>();
for (const encounter of KANTO_ENCOUNTERS) {
  assert.equal(encounter.region, "kanto");
  assert.ok(encounter.pokemonNationalDex >= 1 && encounter.pokemonNationalDex <= 151);
  assert.ok(encounter.minLevel <= encounter.maxLevel);
  const key = `${encounter.biome}/${encounter.time}`;
  const group = groups.get(key) ?? [];
  group.push(encounter);
  groups.set(key, group);
}
assert.equal(groups.size, 36);
for (const [key, encounters] of groups) {
  assert.equal(encounters.length, 8, `${key} count`);
  assert.equal(encounters.reduce((total, encounter) => total + encounter.weight, 0), 100, `${key} weight`);
}
console.log("Verified Kanto biome encounter data");
