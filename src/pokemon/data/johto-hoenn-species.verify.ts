import assert from "node:assert/strict";
import { JOHTO_HOENN_SPECIES } from "./johto-hoenn-species.js";

assert.equal(JOHTO_HOENN_SPECIES.length, 235);
assert.deepEqual(JOHTO_HOENN_SPECIES.map((species) => species.nationalDex), Array.from({ length: 235 }, (_, index) => index + 152));
for (const species of JOHTO_HOENN_SPECIES) {
  const stats = species.baseStats;
  assert.equal(stats.total, stats.hp + stats.attack + stats.defense + stats.specialAttack + stats.specialDefense + stats.speed, `${species.slug} stat total`);
}
console.log("Verified Johto and Hoenn Pokémon species data");
