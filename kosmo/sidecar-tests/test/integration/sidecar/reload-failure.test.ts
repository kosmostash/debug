import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

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

/**
 * Both cases below make chassis report a failed reload on `console.error`.
 * Captured rather than left to print: the report is behaviour worth asserting,
 * and a suite that logs expected stack traces buries the unexpected ones.
 * */
const reported: Array<string> = [];

const takeReported = () => reported.splice(0).join("\n");

beforeAll(async () => {
  vi.spyOn(console, "error").mockImplementation((...args: Array<unknown>) => {
    reported.push(args.map((arg) => String(arg)).join(" "));
  });

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
  vi.restoreAllMocks();
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 2000));

describe("a save that cannot compile", () => {
  test("leaves the running service untouched, and says so", async () => {
    takeReported();

    await project.writeSource("tick.ts", "export const tick = ;\n");
    await settle();

    // the import is what throws, and it runs before anything is torn down
    expect(await project.readLog()).toEqual(["start:1"]);

    const errors = takeReported();
    expect(errors).toMatch(/worker: sidecar reload failed/);
    expect(errors).toMatch(/tick\.ts/);
  });

  test("the next good save reloads it", async () => {
    await project.writeSource("tick.ts", project.tickModule("2"));
    await settle();

    expect(await project.readLog()).toEqual(["start:1", "close:1", "start:2"]);
    expect(takeReported()).toEqual("");
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

    const errors = takeReported();
    expect(errors).toMatch(/worker: sidecar reload failed/);
    expect(errors).toMatch(/start failed/);
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
    expect(takeReported()).toEqual("");
  });
});
