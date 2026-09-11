import { afterAll, beforeAll, describe, test } from "vitest";

import { createTests } from "../middleware-slots-factory";

const { project, tests } = await createTests("h3");

beforeAll(async () => {
  await project.startServer();
});

afterAll(async () => {
  await project.teardown();
});

describe("middleware slots", () => {
  for (const { name, runner } of tests) {
    test(name, runner);
  }
});
