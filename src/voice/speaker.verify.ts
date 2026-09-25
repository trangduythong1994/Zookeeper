import assert from "node:assert/strict";
import { isRetryableTtsFailure, ttsRetryDelayMs } from "./speaker.js";

assert.equal(isRetryableTtsFailure(new Error("Edge TTS closed unexpectedly (1006): no reason")), true);
assert.equal(isRetryableTtsFailure(new Error("Edge TTS timed out.")), true);
assert.equal(isRetryableTtsFailure(new Error("Voice connection did not become ready")), false);
assert.equal(ttsRetryDelayMs(1), 1_500);
assert.equal(ttsRetryDelayMs(2), 3_000);
console.log("Verified Edge TTS retry rules");
