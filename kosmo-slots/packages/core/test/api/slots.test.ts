import { describe, expect, test } from "vitest";

import { createRoutes } from "../../src/api/routes";
import type {
  HandlerDefinition,
  MiddlewareDefinition,
  RouteSource,
} from "../../src/api/types";
import { use } from "../../src/api/use";

/**
 * Custom slot names are declared by the project in `api/env.d.ts`;
 * this is the same augmentation, scoped to the test.
 * */
declare module "../../src/api/types" {
  interface UseSlots {
    logger: string;
  }
}

type Middleware = (ctx: unknown, next: Function) => unknown;

/**
 * A named no-op middleware - the chain is asserted by function name,
 * which is also what the route debug output prints.
 * */
const middleware = (name: string): Middleware => {
  const fn: Middleware = (_ctx, next) => next();
  Object.defineProperty(fn, "name", { value: name });
  return fn;
};

const GET = (fn: Middleware): HandlerDefinition<Middleware> => {
  return { kind: "handler", method: "GET", middleware: [fn] };
};

/**
 * Names of the middleware a GET request runs, in order.
 * Built-in validators are anonymous, so they surface as "".
 * */
const chainOf = ({
  global = [],
  cascading = [],
  route = [GET(middleware("handler"))],
}: {
  // api/use.ts
  global?: Array<MiddlewareDefinition<Middleware>>;
  // a folder-level use.ts
  cascading?: Array<MiddlewareDefinition<Middleware>>;
  // the route's own definition items
  route?: Array<
    MiddlewareDefinition<Middleware> | HandlerDefinition<Middleware>
  >;
}): Array<string> => {
  const routeSource: RouteSource<Middleware> = {
    name: "demo",
    path: "/demo",
    pathPattern: "/demo",
    file: "demo/index.ts",
    params: [],
    numericProperties: { params: [], query: {} },
    booleanProperties: { query: {} },
    cascadingMiddleware: cascading,
    definitionItems: route,
    validationSchemas: {},
  };

  const [entry] = createRoutes<Middleware, Middleware>([routeSource], {
    productionBuild: false,
    createMetaparsers: () => ({}) as never,
    createBodyparsers: () => ({}) as never,
    responseResolver: () => {
      return {
        status: 200,
        contentType: null,
        body: async () => undefined,
      };
    },
    globalMiddleware: global,
  });

  return entry.middleware.map((fn) => (fn as Function).name);
};

describe("slot composition", () => {
  describe("edge slots", () => {
    test("an edge slot runs once, at the edge", () => {
      expect(
        chainOf({
          global: [use(middleware("authenticate"), { slot: "edge:auth" })],
        }),
      ).toEqual(["useExtendContext", "authenticate", "", "handler"]);
    });

    test("every edge slot reaches the edge, in declaration order", () => {
      expect(
        chainOf({
          global: [
            use(middleware("rateLimit"), { slot: "edge:ratelimit" }),
            use(middleware("authenticate"), { slot: "edge:auth" }),
          ],
        }),
      ).toEqual([
        "useExtendContext",
        "rateLimit",
        "authenticate",
        "",
        "handler",
      ]);
    });

    test("a route override replaces its own slot and leaves the others", () => {
      expect(
        chainOf({
          global: [
            use(middleware("rateLimit"), { slot: "edge:ratelimit" }),
            use(middleware("authenticate"), { slot: "edge:auth" }),
          ],
          route: [
            use(middleware("verifySignature"), { slot: "edge:auth" }),
            GET(middleware("handler")),
          ],
        }),
      ).toEqual([
        "useExtendContext",
        "rateLimit",
        "verifySignature",
        "",
        "handler",
      ]);
    });

    test("a cascading use.ts overrides the global entry for its subtree", () => {
      expect(
        chainOf({
          global: [use(middleware("authenticate"), { slot: "edge:auth" })],
          cascading: [use(middleware("subtreeAuth"), { slot: "edge:auth" })],
        }),
      ).toEqual(["useExtendContext", "subtreeAuth", "", "handler"]);
    });

    test("a route-only edge slot runs at the edge with nothing to replace", () => {
      expect(
        chainOf({
          route: [
            use(middleware("audit"), { slot: "edge:audit" }),
            GET(middleware("handler")),
          ],
        }),
      ).toEqual(["useExtendContext", "audit", "", "handler"]);
    });

    test("the bare edge slot is overridable", () => {
      expect(
        chainOf({
          global: [use(middleware("myOwnEdge"), { slot: "edge" })],
        }),
      ).toEqual(["myOwnEdge", "", "handler"]);
    });
  });

  describe("named slots", () => {
    test("the innermost declaration wins, keeping the outermost position", () => {
      expect(
        chainOf({
          global: [use(middleware("globalLogger"), { slot: "logger" })],
          cascading: [use(middleware("cascadingLogger"), { slot: "logger" })],
          route: [
            use(middleware("routeLogger"), { slot: "logger" }),
            GET(middleware("handler")),
          ],
        }),
      ).toEqual(["useExtendContext", "", "routeLogger", "handler"]);
    });

    test("a slot with no global counterpart still overrides", () => {
      expect(
        chainOf({
          cascading: [use(middleware("cascadingLogger"), { slot: "logger" })],
          route: [
            use(middleware("routeLogger"), { slot: "logger" }),
            GET(middleware("handler")),
          ],
        }),
      ).toEqual(["useExtendContext", "", "routeLogger", "handler"]);
    });

    test("unslotted global middleware keeps running after validation", () => {
      expect(chainOf({ global: [use(middleware("requestId"))] })).toEqual([
        "useExtendContext",
        "",
        "requestId",
        "handler",
      ]);
    });
  });

  describe("validation slots", () => {
    test("a cascading use.ts overrides the global validators", () => {
      expect(
        chainOf({
          global: [
            use(middleware("globalParams"), { slot: "validate:params" }),
            use(middleware("globalJson"), { slot: "validate:json" }),
          ],
          cascading: [
            use(middleware("cascadingParams"), { slot: "validate:params" }),
            use(middleware("cascadingJson"), { slot: "validate:json" }),
          ],
        }),
      ).toEqual([
        "useExtendContext",
        "cascadingParams",
        "cascadingJson",
        "handler",
      ]);
    });

    test("a route use() overrides a cascading validator", () => {
      expect(
        chainOf({
          cascading: [
            use(middleware("cascadingParams"), { slot: "validate:params" }),
          ],
          route: [
            use(middleware("routeParams"), { slot: "validate:params" }),
            GET(middleware("handler")),
          ],
        }),
      ).toEqual(["useExtendContext", "routeParams", "handler"]);
    });
  });
});
