import assert from "node:assert/strict";
import { responseForChance } from "./command.js";

assert.equal(responseForChance(0), "Không. Vũ trụ từ chối.");
assert.equal(responseForChance(1), "Khó xảy ra.");
assert.equal(responseForChance(20), "Khó xảy ra.");
assert.equal(responseForChance(21), "Cũng có cửa.");
assert.equal(responseForChance(40), "Cũng có cửa.");
assert.equal(responseForChance(41), "50/50... đại khái vậy.");
assert.equal(responseForChance(59), "50/50... đại khái vậy.");
assert.equal(responseForChance(60), "Khả năng khá cao 👀");
assert.equal(responseForChance(79), "Khả năng khá cao 👀");
assert.equal(responseForChance(80), "Chuẩn bị tinh thần đi 💀");
assert.equal(responseForChance(99), "Chuẩn bị tinh thần đi 💀");
assert.equal(responseForChance(100), "Không chạy được đâu.");

console.log("Verified chance response ranges");
