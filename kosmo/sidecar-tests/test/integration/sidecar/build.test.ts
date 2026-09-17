import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { setupSidecarProject } from ".";

/**
 * One project for the whole file, in the layout the docs recommend:
 * a sidecar folder beside an HTTP folder, built by one `pnpm build`.
 * */
const project = await setupSidecarProject({
  name: "worker",
  sidecar: { entry: "./entry.ts", run: "./run.ts" },
  webFolder: { name: "web", base: "/api" },
});

beforeAll(async () => {
  await project.bootstrap();
  await project.writeSource("tick.ts", project.tickModule("1"));
  await project.writeSource("entry.ts", project.serviceEntry());
  await project.build();
}, 180_000);

afterAll(async () => {
  await project.teardown();
});

describe("sidecar build", () => {
  test("emits the entry and the runner under dist/<folder>/sidecar", async () => {
    const entries = await project.distEntries("sidecar");

    expect(entries).toContain("entry.js");
    expect(entries).toContain("run.js");
  });

  test("the runner starts the service and stays up", async () => {
    await project.resetLog();

    const runner = project.spawnDist("sidecar/run.js");

    // the service holds the event loop open; a runner that exited here would
    // mean start() never ran, or ran and left nothing alive
    expect(await runner.exit(2000)).toEqual("running");
    expect(await project.readLog()).toEqual(["start:1"]);

    runner.child.kill("SIGKILL");
  });

  test("SIGINT drains it through teardown and the close function", async () => {
    await project.resetLog();

    const runner = project.spawnDist("sidecar/run.js");

    // start() has to have returned before the runner registers its handlers,
    // so wait for the process to settle rather than for the log line alone
    await project.waitForLog(1);
    await new Promise((resolve) => setTimeout(resolve, 500));

    runner.child.kill("SIGINT");

    expect(await runner.exit()).toEqual("exit 0");

    // teardown first, then the close function - see docs/sidecar/entry
    expect(await project.readLog()).toEqual([
      "start:1",
      "teardown:1",
      "close:1",
    ]);
  });

  test("the dispatcher ignores a sidecar folder and serves the web one", async () => {
    // dist/<sidecar>/ carries no kosmo.json, so dist/run.js must skip it
    // rather than fail to boot the folders that do serve HTTP
    const { createListener } = await import(
      project.createPath.distDir("../run.js")
    );

    const listener = await createListener();

    expect(listener).toBeTypeOf("function");
  });

  test("without `run` only the entry is emitted", async () => {
    await project.writeConfig({ entry: "./entry.ts" });
    await project.build();

    const entries = await project.distEntries("sidecar");

    expect(entries).toContain("entry.js");
    expect(entries).not.toContain("run.js");
  });
});
