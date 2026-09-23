import assert from "node:assert/strict";
import { colorInteger, isColorRoleName, normalizeHexColor } from "./command.js";

assert.equal(normalizeHexColor("#000000"), "#000000");
assert.equal(normalizeHexColor(" #aBc123 "), "#ABC123");
assert.equal(normalizeHexColor("ABC123"), undefined);
assert.equal(normalizeHexColor("#12345"), undefined);
assert.equal(normalizeHexColor("#GG0000"), undefined);
assert.equal(isColorRoleName("#abcdef"), true);
assert.equal(isColorRoleName("#ABCDEF"), true);
assert.equal(isColorRoleName("Blue"), false);
assert.equal(colorInteger("#FF0000"), 0xFF0000);

console.log("Verified color command helpers");
