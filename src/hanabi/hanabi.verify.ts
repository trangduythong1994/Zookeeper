import assert from "node:assert/strict";
import { discardCard, emptyState, giveHint, impossibleFireworkColor, joinLobby, score, startClassicGame } from "./hanabi.js";

const state = emptyState("a", "Apples");
assert.equal(joinLobby(state, "b", "Loliêm"), "joined");
startClassicGame(state, () => 0);
assert.equal(state.players.length, 2);
assert.equal(state.players[0]!.userId, "b");
assert.equal(state.players[0]!.hand.length, 5);
assert.equal(state.deck.length, 40);

const actor = state.players[0]!;
const target = state.players[1]!;
const absentColor = (["red", "yellow", "green", "blue", "white"] as const).find((color) => !target.hand.some((card) => card.color === color)) ?? "red";
const clueBefore = state.clues;
const negativeHint = giveHint(state, actor.userId, target.userId, absentColor);
assert.equal(negativeHint.matches, 0);
assert.equal(state.clues, clueBefore - 1);
assert.equal(target.hand.some((card) => card.knownColor === absentColor), false);

const current = state.players[state.turnIndex]!;
const handBeforeDiscard = current.hand.length;
discardCard(state, current.userId, 0);
assert.equal(current.hand.length, handBeforeDiscard);
assert.ok(score(state) >= 0);

const impossible = emptyState("a", "Apples");
assert.equal(joinLobby(impossible, "b", "Loliêm"), "joined");
startClassicGame(impossible, () => 0.5);
const lostFive = impossible.deck.findIndex((card) => card.color === "red" && card.number === 5);
assert.ok(lostFive >= 0);
impossible.discard.push(impossible.deck.splice(lostFive, 1)[0]!);
assert.equal(impossibleFireworkColor(impossible), "red");

console.log("hanabi verification passed");
