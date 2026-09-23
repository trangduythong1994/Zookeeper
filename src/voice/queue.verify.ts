import assert from "node:assert/strict";
import { SpeechQueue } from "./queue.js";

const queue = new SpeechQueue<string>();
queue.enqueue("chat one", "standard");
queue.enqueue("chat two", "standard");
queue.enqueue("arrival one", "arrival");
queue.enqueue("arrival two", "arrival");

assert.deepEqual([queue.dequeue(), queue.dequeue(), queue.dequeue(), queue.dequeue()], [
  "arrival one",
  "arrival two",
  "chat one",
  "chat two",
]);

console.log("Verified speech queue priorities");
