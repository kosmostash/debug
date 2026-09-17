import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { setupSidecarProject } from ".";

/**
 * A service holding a socket, so its close function does real work and throws
 * if called twice - the shape that turns a mishandled failed reload into a
 * sidecar that never comes back, however many times you save afterwards.
 *
 * The two ways a reload fails are covered in order against one dev server,
 * because what matters is that the state each leaves behind is still reloadable.
 * */
const project = await setupSidecarProject({
  name: "worker",
  sidecar: { entry: "./entry.ts", run: "./run.ts", serve: true },
});

beforeAll(async () => {
  await project.bootstrap();
  await project.writeSource("tick.ts", project.tickModule("1"));
  await project.writeSource(
    "entry.ts",
    project.servingEntry({ failStartOn: "boom" }),
  );
  await project.startDevServer();
  await project.waitForLog(1);
}, 180_000);

afterAll(async () => {
  await project.teardown();
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 2000));

describe("a save that cannot compile", () => {
  test("leaves the running service untouched", async () => {
    await project.writeSource("tick.ts", "export const tick = ;\n");
    await settle();

    // the import is what throws, and it runs before anything is torn down
    expect(await project.readLog()).toEqual(["start:1"]);
  });

  test("the next good save reloads it", async () => {
    await project.writeSource("tick.ts", project.tickModule("2"));
    await settle();

    expect(await project.readLog()).toEqual(["start:1", "close:1", "start:2"]);
  });
});

describe("a start() that throws", () => {
  test("stops the old service and leaves nothing running", async () => {
    await project.writeSource("tick.ts", project.tickModule("boom"));
    await settle();

    // the old one is closed by then - the new one simply never came up
    expect(await project.readLog()).toEqual([
      "start:1",
      "close:1",
      "start:2",
      "close:2",
    ]);
  });

  test("the next good save still reloads it", async () => {
    await project.writeSource("tick.ts", project.tickModule("3"));
    await settle();

    // only if the closer of the service that never started was dropped;
    // calling the previous one again throws and wedges every later save
    expect(await project.readLog()).toEqual([
      "start:1",
      "close:1",
      "start:2",
      "close:2",
      "start:3",
    ]);
  });
});
