import assert from "node:assert/strict";
import { SpeechIntroductionTracker, speechRequestFromMessage } from "./command.js";

assert.deepEqual(speechRequestFromMessage("-s Xin chào"), { content: "Xin chào", language: "vi" });
assert.deepEqual(speechRequestFromMessage("-sen Hello everyone"), { content: "Hello everyone", language: "en" });
assert.equal(speechRequestFromMessage("hello"), undefined);
assert.equal(speechRequestFromMessage("-sen   "), undefined);

const introductions = new SpeechIntroductionTracker();
const start = 1_000;
assert.equal(introductions.format("guild", "trang", "Trang", "Xin chào", "vi", start), "Trang nói rằng Xin chào");
introductions.remember("guild", "trang", start);
assert.equal(introductions.format("guild", "trang", "Trang", "Tin tiếp theo", "vi", start + 29_999), "Tin tiếp theo");
assert.equal(introductions.format("guild", "minh", "Minh", "Hello everyone", "en", start + 1), "Minh says Hello everyone");
assert.equal(introductions.format("guild", "trang", "Trang", "Sau 30 giây", "vi", start + 30_000), "Trang nói rằng Sau 30 giây");

console.log("Verified speech command parsing");
