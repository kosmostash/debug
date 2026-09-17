import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { setupSidecarProject } from ".";

/**
 * A service holding a socket, so its close function does real work and cannot
 * run twice - the shape that turns a mishandled failed reload into a sidecar
 * that never comes back.
 * */
const project = await setupSidecarProject({
  name: "worker",
  sidecar: { entry: "./entry.ts", run: "./run.ts", serve: true },
});

beforeAll(async () => {
  await project.bootstrap();
  await project.writeSource("tick.ts", project.tickModule("1"));
  await project.writeSource("entry.ts", project.servingEntry());
  await project.startDevServer();
  await project.waitForLog(1);
}, 180_000);

afterAll(async () => {
  await project.teardown();
});

describe("a reload that throws", () => {
  test("leaves the running service untouched", async () => {
    await project.writeSource("tick.ts", "export const tick = ;\n");
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // nothing was torn down: closing before knowing the new source compiles
    // would leave the service shut with nothing to replace it
    expect(await project.readLog()).toEqual(["start:1"]);
  });

  test("the next good save reloads it", async () => {
    await project.writeSource("tick.ts", project.tickModule("2"));
    await new Promise((resolve) => setTimeout(resolve, 2000));

    expect(await project.readLog()).toEqual(["start:1", "close:1", "start:2"]);
  });
});
