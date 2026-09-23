import assert from "node:assert/strict";
import { shouldAnnouncePresenceBoundary, shouldAnnounceVoiceArrival, shouldSpeakMemberArrival, shouldWelcomeFirstVoiceMember } from "./arrival.js";

const watchedUserId = "471156966866026506";
assert.equal(shouldAnnounceVoiceArrival(watchedUserId, null, "voice", "online", watchedUserId), true);
assert.equal(shouldAnnounceVoiceArrival(watchedUserId, null, "voice", "idle", watchedUserId), true);
assert.equal(shouldAnnounceVoiceArrival(watchedUserId, null, "voice", "dnd", watchedUserId), true);
assert.equal(shouldAnnounceVoiceArrival(watchedUserId, null, "voice", "offline", watchedUserId), false);
assert.equal(shouldAnnounceVoiceArrival(watchedUserId, "voice-a", "voice-b", "online", watchedUserId), false);
assert.equal(shouldAnnounceVoiceArrival("another-user", null, "voice", "online", watchedUserId), false);
assert.equal(shouldSpeakMemberArrival(null, "voice", "voice"), true);
assert.equal(shouldSpeakMemberArrival("voice-a", "voice-b", "voice-b"), true);
assert.equal(shouldSpeakMemberArrival("voice", "voice", "voice"), false);
assert.equal(shouldSpeakMemberArrival(null, "voice", undefined), false);
assert.equal(shouldWelcomeFirstVoiceMember(null, "voice", null), true);
assert.equal(shouldWelcomeFirstVoiceMember("voice-a", "voice-b", null), true);
assert.equal(shouldWelcomeFirstVoiceMember(null, "voice", "another-voice"), false);
assert.equal(shouldAnnouncePresenceBoundary(watchedUserId, "offline", "online", watchedUserId), true);
assert.equal(shouldAnnouncePresenceBoundary(watchedUserId, "dnd", "offline", watchedUserId), true);
assert.equal(shouldAnnouncePresenceBoundary(watchedUserId, "online", "idle", watchedUserId), false);
assert.equal(shouldAnnouncePresenceBoundary("another-user", "offline", "online", watchedUserId), false);

console.log("Verified voice-arrival notification rules");
