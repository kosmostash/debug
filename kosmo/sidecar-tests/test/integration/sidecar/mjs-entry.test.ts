import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { setupSidecarProject } from ".";

/**
 * A sidecar written in plain JavaScript - the `typecheck: false` case
 * docs/sidecar/development.md points at, for an entry wrapping third-party JS.
 * Nothing about it is TypeScript: no `defineService`, no types, and relative
 * imports carry their extension.
 * */
const project = await setupSidecarProject({
  name: "worker",
  sidecarFolder: {
    entry: "./entry.mjs",
    run: "./run.mjs",
    serve: true,
    typecheck: false,
  },
});

beforeAll(async () => {
  await project.bootstrap();
  await project.writeSource("tick.mjs", project.tickModule("1"));
  await project.writeSource("entry.mjs", project.mjsEntry());
  await project.writeSource("run.mjs", project.mjsRunner());
  await project.startDevServer();
}, 180_000);

afterAll(async () => {
  await project.teardown();
});

describe("a plain-JavaScript sidecar", () => {
  test("the dev server starts it", async () => {
    expect(await project.waitForLog(1)).toEqual(["start:1"]);
  });

  test("and reloads it on a change to what it imports", async () => {
    await project.writeSource("tick.mjs", project.tickModule("2"));

    const log = await project.waitForLog(3);

    // no teardown line: an entry may omit it, and a plain object is a service
    expect(log).toEqual(["start:1", "close:1", "start:2"]);
  });

  test("typecheck skips the folder rather than checking it", async () => {
    // something tsc would certainly reject, so a pass proves the skip rather
    // than an empty program. Asserting on exit codes, not on the printed
    // SKIP - the spinner stubs itself out when stdout is not a TTY
    await project.writeSource(
      "broken.ts",
      `export const n: number = "not a number";\n`,
    );

    const skipped = await project.runKosmo(["typecheck", "worker"]);
    expect(skipped.code).toEqual(0);

    // `typecheck: false` is the companion to a JavaScript entry; without it
    // the same folder fails, which is what makes the pass above meaningful
    await project.writeConfig({
      entry: "./entry.mjs",
      run: "./run.mjs",
      serve: true,
    });

    const checked = await project.runKosmo(["typecheck", "worker"]);
    expect(checked.code).not.toEqual(0);

    await project.writeConfig({
      entry: "./entry.mjs",
      run: "./run.mjs",
      serve: true,
      typecheck: false,
    });
  }, 60_000);

  test("builds to the same place a TypeScript one does", async () => {
    await project.build();

    const entries = await project.distEntries("sidecar");

    expect(entries).toContain("entry.js");
    expect(entries).toContain("run.js");
  });
});
