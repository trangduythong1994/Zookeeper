/* global process */

process.argv.push("--generation=2");
await import("./collect-gen1-acquisition.mjs");
