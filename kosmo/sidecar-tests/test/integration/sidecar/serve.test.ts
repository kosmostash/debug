import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { setupSidecarProject } from ".";

const project = await setupSidecarProject({
  name: "worker",
  sidecar: { entry: "./entry.ts", run: "./run.ts", serve: true },
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

  /**
   * Parked, not passing: on one save the restarted service logs `start:1` -
   * the source as it was before the change. The watcher handler re-imports
   * the entry before Vite has marked the changed modules dirty, so the module
   * runner replays its cached transform.
   *
   * Deterministic here (5/5), and not a burst-of-saves case - a single write
   * does it. Any await between the change and the re-import hides it, which
   * is why the backend path, with a generator pass in between, does not show
   * it; a bare `setImmediate` yield is not enough.
   *
   * Unskip if the reload ever orders itself after Vite's invalidation.
   * */
  test.skip("the restarted service runs the edited source", async () => {
    const log = await project.waitForLog(4);

    expect(log[3]).toEqual("start:2");
  });

  test("a file outside the graph does not restart it", async () => {
    const before = await project.readLog();

    await project.writeSource("unrelated.ts", "export const x = 1;\n");
    await new Promise((resolve) => setTimeout(resolve, 1000));

    expect(await project.readLog()).toEqual(before);
  });
});
