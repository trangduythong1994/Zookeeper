import assert from "node:assert/strict";
import { KANTO_SPECIES } from "./kanto-species.js";

assert.equal(KANTO_SPECIES.length, 151);
assert.deepEqual(KANTO_SPECIES.map((species) => species.nationalDex), Array.from({ length: 151 }, (_, index) => index + 1));
for (const species of KANTO_SPECIES) {
  const stats = species.baseStats;
  assert.equal(stats.total, stats.hp + stats.attack + stats.defense + stats.specialAttack + stats.specialDefense + stats.speed, `${species.slug} stat total`);
  assert.ok(species.evolvesFrom === null || KANTO_SPECIES.some((candidate) => candidate.nationalDex === species.evolvesFrom), `${species.slug} parent evolution`);
  for (const evolution of species.evolutions) {
    assert.ok(KANTO_SPECIES.some((candidate) => candidate.nationalDex === evolution.toNationalDex), `${species.slug} target evolution`);
  }
}
console.log("Verified Kanto Pokémon species data");
