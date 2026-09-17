/**
 * The service a sidecar test runs, in its variants.
 *
 * `logFile` and `value` arrive JSON-serialized, so a path or a tick value
 * lands as a valid literal whatever characters it carries - which is why
 * they appear unquoted in the templates.
 * */

export { default as config } from "./kosmo.config.hbs?raw";
export { default as entry } from "./entry.hbs?raw";
export { default as servingEntry } from "./serving-entry.hbs?raw";
export { default as tick } from "./tick.hbs?raw";

export { default as mjsEntry } from "./mjs/entry.hbs?raw";
export { default as mjsRunner } from "./mjs/run.hbs?raw";
