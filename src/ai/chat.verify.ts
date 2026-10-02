import assert from "node:assert/strict";
import { actualCostMicroUsd, estimatedMaximumCostMicroUsd, responseText } from "./chat.js";

assert.equal(actualCostMicroUsd(1_000, 200), 200);
assert.ok(estimatedMaximumCostMicroUsd() > 0);
assert.equal(responseText({ output_text: " Hello " }), "Hello");
assert.equal(responseText({ output: [{ content: [{ type: "output_text", text: "Hi" }] }] }), "Hi");
assert.equal(responseText({ output: [{ content: [{ type: "reasoning", text: "Hidden" }] }] }), undefined);

console.log("ai chat verification passed");
