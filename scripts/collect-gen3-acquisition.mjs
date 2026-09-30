/* global process */

process.argv.push("--generation=3");
await import("./collect-gen1-acquisition.mjs");
