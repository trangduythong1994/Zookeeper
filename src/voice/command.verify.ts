import assert from "node:assert/strict";
import { speechTextForMessage } from "./command.js";

assert.equal(speechTextForMessage("Trang", "-s Xin chào"), "User Trang nói rằng Xin chào");
assert.equal(speechTextForMessage("Trang", "hello"), undefined);
assert.equal(speechTextForMessage("Trang", "-s   "), undefined);

console.log("Verified speech command parsing");
