import assert from "node:assert/strict";
import { SpeechIntroductionTracker, speechRequestFromMessage } from "./command.js";

assert.deepEqual(speechRequestFromMessage("-s Xin chào"), { content: "Xin chào", language: "vi", provider: "edge", deleteSource: false, whisper: false, shouting: false });
assert.deepEqual(speechRequestFromMessage("-sen Hello everyone"), { content: "Hello everyone", language: "en", provider: "edge", deleteSource: false, whisper: false, shouting: false });
assert.deepEqual(speechRequestFromMessage("--s Bí mật"), { content: "Bí mật", language: "vi", provider: "edge", deleteSource: true, whisper: true, shouting: false });
assert.deepEqual(speechRequestFromMessage("--sen Secret message"), { content: "Secret message", language: "en", provider: "edge", deleteSource: true, whisper: false, shouting: false });
assert.deepEqual(speechRequestFromMessage("-g Xin chào từ Google"), { content: "Xin chào từ Google", language: "vi", provider: "google", deleteSource: false, whisper: false, shouting: false });
assert.deepEqual(speechRequestFromMessage("-gen Hello from Google"), { content: "Hello from Google", language: "en", provider: "google", deleteSource: false, whisper: false, shouting: false });
assert.deepEqual(speechRequestFromMessage("--g Bí mật Google"), { content: "Bí mật Google", language: "vi", provider: "google", deleteSource: true, whisper: true, shouting: false });
assert.deepEqual(speechRequestFromMessage("--gen Secret Google"), { content: "Secret Google", language: "en", provider: "google", deleteSource: true, whisper: false, shouting: false });
assert.deepEqual(speechRequestFromMessage("—g Mobile Google"), { content: "Mobile Google", language: "vi", provider: "google", deleteSource: true, whisper: true, shouting: false });
assert.deepEqual(speechRequestFromMessage("–sen Mobile Edge"), { content: "Mobile Edge", language: "en", provider: "edge", deleteSource: true, whisper: false, shouting: false });
assert.deepEqual(speechRequestFromMessage("-S XIN chào"), { content: "XIN chào", language: "vi", provider: "edge", deleteSource: false, whisper: false, shouting: true });
assert.deepEqual(speechRequestFromMessage("-SEN HELLO THERE"), { content: "HELLO THERE", language: "en", provider: "edge", deleteSource: false, whisper: false, shouting: true });
assert.equal(speechRequestFromMessage("hello"), undefined);
assert.equal(speechRequestFromMessage("-sen   "), undefined);

const introductions = new SpeechIntroductionTracker();
const start = 1_000;
assert.equal(introductions.format("guild", "trang", "Trang", "Xin chào", "vi", false, false, start), "Trang nói rằng Xin chào");
introductions.remember("guild", "trang", start);
assert.equal(introductions.format("guild", "trang", "Trang", "Tin tiếp theo", "vi", false, false, start + 29_999), "Tin tiếp theo");
assert.equal(introductions.format("guild", "trang", "Trang", "XIN CHÀO", "vi", false, true, start + 1), "Trang gào thét rằng XIN CHÀO");
assert.equal(introductions.format("guild", "minh", "Minh", "Hello everyone", "en", false, false, start + 1), "Minh says Hello everyone");
assert.equal(introductions.format("guild", "trang", "Trang", "Sau 30 giây", "vi", false, false, start + 30_000), "Trang nói rằng Sau 30 giây");
assert.equal(introductions.format("other-guild", "trang", "Trang", "Bí mật", "vi", true, false, start), "Trang thì thầm rằng Bí mật");
assert.equal(introductions.format("shout-guild", "trang", "Trang", "XIN CHÀO", "vi", false, true, start), "Trang gào thét rằng XIN CHÀO");

console.log("Verified speech command parsing");
