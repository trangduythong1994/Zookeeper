import assert from "node:assert/strict";
import { CATCH_SYMBOLS, catchInputId, catchPlayId, createCatchSession, parseCatchInputId, parseCatchPlayId, previewDurationMs, sequenceLengthForCatchRate } from "./catch.js";

assert.equal(sequenceLengthForCatchRate(50), 4);
assert.equal(sequenceLengthForCatchRate(20), 6);
assert.equal(sequenceLengthForCatchRate(10), 8);
assert.equal(sequenceLengthForCatchRate(5), 10);
assert.equal(sequenceLengthForCatchRate(2), 12);
assert.ok(previewDurationMs(12) > previewDurationMs(4));

const session = createCatchSession(20, () => 0.5);
assert.equal(session.sequence.length, 6);
assert.ok(session.sequence.every((index) => CATCH_SYMBOLS[index] !== undefined));
const inputId = catchInputId("123", "456", 2);
assert.deepEqual(parseCatchInputId(inputId), { messageId: "123", userId: "456", symbolIndex: 2 });
assert.equal(parseCatchInputId("pk-catch-input:123:456:8"), undefined);
assert.deepEqual(parseCatchPlayId(catchPlayId("123", "456")), { messageId: "123", userId: "456" });
console.log("Verified Pokémon Catch mechanics");
