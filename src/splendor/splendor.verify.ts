import assert from "node:assert/strict";
import { SPLENDOR_CARDS, SPLENDOR_NOBLES, autoPassBlockedTurns, createState, currentPlayer, finishTurn, takeGems, tokenCount } from "./splendor.js";

assert.equal(SPLENDOR_CARDS.length, 90, "base Splendor has 90 development cards");
assert.deepEqual([1, 2, 3].map((tier) => SPLENDOR_CARDS.filter((card) => card.tier === tier).length), [40, 30, 20]);
assert.equal(SPLENDOR_NOBLES.length, 10, "base Splendor has 10 Nobles");

const state = createState([
  { userId: "one", displayName: "One" },
  { userId: "two", displayName: "Two" },
], () => 0.5);
assert.equal(state.bank.white, 4);
assert.equal(state.bank.gold, 5);
assert.equal(state.nobles.length, 3);
assert.deepEqual([state.market[1].length, state.market[2].length, state.market[3].length], [4, 4, 4]);

const first = currentPlayer(state);
takeGems(state, first.userId, ["white", "blue", "green"]);
assert.equal(tokenCount(first), 3);
finishTurn(state, first.userId);
assert.equal(currentPlayer(state).userId, "two");
assert.equal(autoPassBlockedTurns(state), "active");

console.log("Splendor checks passed.");
