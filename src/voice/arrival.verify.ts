import assert from "node:assert/strict";
import { shouldAnnouncePresenceBoundary, shouldSpeakMemberArrival, shouldWelcomeFirstVoiceMember, watchedVoiceTransition } from "./arrival.js";

const watchedUserId = "471156966866026506";
assert.equal(watchedVoiceTransition(watchedUserId, null, "voice", watchedUserId), "joined");
assert.equal(watchedVoiceTransition(watchedUserId, "voice-a", "voice-b", watchedUserId), "moved");
assert.equal(watchedVoiceTransition(watchedUserId, "voice", null, watchedUserId), "left");
assert.equal(watchedVoiceTransition("another-user", null, "voice", watchedUserId), undefined);
assert.equal(shouldSpeakMemberArrival(null, "voice", "voice"), true);
assert.equal(shouldSpeakMemberArrival("voice-a", "voice-b", "voice-b"), true);
assert.equal(shouldSpeakMemberArrival("voice", "voice", "voice"), false);
assert.equal(shouldSpeakMemberArrival(null, "voice", undefined), false);
assert.equal(shouldWelcomeFirstVoiceMember(null, "voice", null), true);
assert.equal(shouldWelcomeFirstVoiceMember("voice-a", "voice-b", null), true);
assert.equal(shouldWelcomeFirstVoiceMember(null, "voice", "another-voice"), false);
assert.equal(shouldAnnouncePresenceBoundary(watchedUserId, "offline", "online", watchedUserId), true);
assert.equal(shouldAnnouncePresenceBoundary(watchedUserId, undefined, "online", watchedUserId), false);
assert.equal(shouldAnnouncePresenceBoundary(watchedUserId, "dnd", "offline", watchedUserId), true);
assert.equal(shouldAnnouncePresenceBoundary(watchedUserId, "online", "idle", watchedUserId), false);
assert.equal(shouldAnnouncePresenceBoundary("another-user", "offline", "online", watchedUserId), false);

console.log("Verified voice-arrival notification rules");
