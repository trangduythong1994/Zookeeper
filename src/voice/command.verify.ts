import assert from "node:assert/strict";
import { SpeechIntroductionTracker, speechRequestFromMessage } from "./command.js";

assert.deepEqual(speechRequestFromMessage("-s Xin chào"), { content: "Xin chào", language: "vi", deleteSource: false, whisper: false });
assert.deepEqual(speechRequestFromMessage("-sen Hello everyone"), { content: "Hello everyone", language: "en", deleteSource: false, whisper: false });
assert.deepEqual(speechRequestFromMessage("--s Bí mật"), { content: "Bí mật", language: "vi", deleteSource: true, whisper: true });
assert.deepEqual(speechRequestFromMessage("--sen Secret message"), { content: "Secret message", language: "en", deleteSource: true, whisper: false });
assert.equal(speechRequestFromMessage("hello"), undefined);
assert.equal(speechRequestFromMessage("-sen   "), undefined);

const introductions = new SpeechIntroductionTracker();
const start = 1_000;
assert.equal(introductions.format("guild", "trang", "Trang", "Xin chào", "vi", false, start), "Trang nói rằng Xin chào");
introductions.remember("guild", "trang", start);
assert.equal(introductions.format("guild", "trang", "Trang", "Tin tiếp theo", "vi", false, start + 29_999), "Tin tiếp theo");
assert.equal(introductions.format("guild", "minh", "Minh", "Hello everyone", "en", false, start + 1), "Minh says Hello everyone");
assert.equal(introductions.format("guild", "trang", "Trang", "Sau 30 giây", "vi", false, start + 30_000), "Trang nói rằng Sau 30 giây");
assert.equal(introductions.format("other-guild", "trang", "Trang", "Bí mật", "vi", true, start), "Trang thì thầm rằng Bí mật");

console.log("Verified speech command parsing");
