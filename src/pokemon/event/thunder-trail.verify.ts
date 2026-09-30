import assert from "node:assert/strict";
import { createThunderTrailPath, isValidThunderTrailPath, renderThunderTrailPath } from "./thunder-trail.js";

for (let index = 0; index < 1_000; index += 1) {
  const path = createThunderTrailPath();
  assert.equal(isValidThunderTrailPath(path), true);
  assert.equal(renderThunderTrailPath(path).split("\n").length, 8);
}
