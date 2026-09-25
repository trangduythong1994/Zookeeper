import assert from "node:assert/strict";
import { replaceUserMentionsForSpeech } from "./mentions.js";

const names = new Map([["123", "Trang"], ["456", "Minh (nickname server)"]]);
assert.equal(replaceUserMentionsForSpeech("Xin chào <@123> và <@!456>", (userId) => names.get(userId)), "Xin chào Trang và Minh (nickname server)");
assert.equal(replaceUserMentionsForSpeech("Chào <@999>", (userId) => names.get(userId)), "Chào một người dùng");
console.log("Verified TTS user-mention display names");
