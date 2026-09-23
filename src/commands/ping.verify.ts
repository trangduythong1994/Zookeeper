import assert from "node:assert/strict";
import { pingCommand } from "./ping.js";

assert.equal(pingCommand.data.name, "ping");
assert.equal(pingCommand.data.description, "Check whether the bot is online.");

console.log("Verified /ping command definition");
