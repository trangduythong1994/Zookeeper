import assert from "node:assert/strict";
import { ALL_GEN3_SPECIES } from "./all-gen3-species.js";

assert.equal(ALL_GEN3_SPECIES.length, 386);
assert.deepEqual(ALL_GEN3_SPECIES.map((species) => species.nationalDex), Array.from({ length: 386 }, (_, index) => index + 1));
console.log("Verified complete Generation III species range");
