import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { setupSidecarProject } from ".";

const project = await setupSidecarProject({
  name: "worker",
  sidecarFolder: { entry: "./entry.ts", run: "./run.ts", serve: true },
});

beforeAll(async () => {
  await project.bootstrap();
  await project.writeSource("tick.ts", project.tickModule("1"));
  await project.writeSource("entry.ts", project.serviceEntry());
  await project.startDevServer();
}, 180_000);

afterAll(async () => {
  await project.teardown();
});

describe("sidecar under kosmo serve", () => {
  test("starts the service once, on boot", async () => {
    const log = await project.waitForLog(1);

    expect(log).toEqual(["start:1"]);
  });

  test("a change in the entry's graph restarts it, teardown before close", async () => {
    await project.writeSource("tick.ts", project.tickModule("2"));

    // teardown, close, start - four lines counting the boot
    const log = await project.waitForLog(4);

    expect(log.slice(0, 3)).toEqual(["start:1", "teardown:1", "close:1"]);
  });

  test("the restarted service runs the edited source", async () => {
    const log = await project.waitForLog(4);

    // the reload is driven by the `hotUpdate` hook, which Vite calls after it
    // has invalidated the graph - a raw watcher listener re-imports first and
    // brings the service back up on the source as it was before the save
    expect(log[3]).toEqual("start:2");
  });

  test("editing the entry itself restarts it too", async () => {
    // the entry is a module in the graph like any other - the trigger is not
    // only the files it imports
    await project.writeSource(
      "entry.ts",
      `${project.serviceEntry()}\n// touched\n`,
    );

    const log = await project.waitForLog(7);

    expect(log.slice(4)).toEqual(["teardown:2", "close:2", "start:2"]);
  });

  test("a file outside the graph does not restart it", async () => {
    const before = await project.readLog();

    await project.writeSource("unrelated.ts", "export const x = 1;\n");
    await new Promise((resolve) => setTimeout(resolve, 1000));

    expect(await project.readLog()).toEqual(before);
  });
});
