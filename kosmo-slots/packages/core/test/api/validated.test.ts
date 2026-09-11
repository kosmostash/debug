import { describe, expect, test } from "vitest";

import { createRoutes } from "../../src/api/routes";
import type { HandlerDefinition, RouteSource } from "../../src/api/types";
import type { ValidationSchemas } from "../../src/types";

type Middleware = (ctx: never, next: Function) => unknown;

const PARAMS = { id: 1, name: "kosmo" };
const QUERY = { page: 2 };

const TARGETS = ["params", "query", "headers", "cookies", "json"] as const;

/** a schema that passes everything, standing in for a generated one */
const permissive = { validate: () => {} } as never;

/** present but unable to validate - a codegen bug, never a configuration */
const malformed = { check: () => true } as never;

type Seen = Record<string, unknown>;

const routeSource = (
  name: string,
  validationSchemas: ValidationSchemas | undefined,
  onHandled: (validated: Seen) => void,
): RouteSource<Middleware> => {
  const handler: HandlerDefinition<Middleware> = {
    kind: "handler",
    method: "GET",
    middleware: [
      ((ctx: { validated: Seen }) => onHandled({ ...ctx.validated })) as never,
    ],
  };

  return {
    name,
    path: `/${name}/:id/:name`,
    pathPattern: `/${name}/:id/:name`,
    file: `${name}/[id]/[name]/index.ts`,
    params: ["id", "name"],
    numericProperties: { params: ["id"], query: {} },
    booleanProperties: { query: {} },
    cascadingMiddleware: [],
    definitionItems: [handler],
    // omitted entirely when the route is not validated
    ...(validationSchemas ? { validationSchemas } : {}),
  };
};

const build = (sources: Array<RouteSource<Middleware>>) => {
  return createRoutes<Middleware, Middleware>(sources, {
    productionBuild: false,
    createMetaparsers: () =>
      ({
        method: () => "GET",
        pathname: () => "/r/1/kosmo",
        params: () => PARAMS,
        query: () => QUERY,
        headers: () => ({}),
        cookies: () => ({}),
      }) as never,
    createBodyparsers: () => ({}) as never,
    responseResolver: () => {
      return { status: 200, contentType: null, body: async () => undefined };
    },
    globalMiddleware: [],
  });
};

// koa-style compose - the shape every backend adapter ends up calling
const run = async (route: { middleware: Array<unknown> }) => {
  const ctx = {} as never;
  const dispatch = async (i: number): Promise<unknown> => {
    const fn = route.middleware[i] as Middleware | undefined;
    return fn ? fn(ctx, () => dispatch(i + 1)) : undefined;
  };
  await dispatch(0);
};

/** Run one route and hand back what its handler saw on `ctx.validated`. */
const validatedIn = async (validationSchemas?: ValidationSchemas) => {
  let seen: Seen = {};
  const [route] = build([
    routeSource("r", validationSchemas, (v) => {
      seen = v;
    }),
  ]);
  await run(route);
  return seen;
};

describe("a route carrying schemas", () => {
  test("fills the targets it declares", async () => {
    const validated = await validatedIn({
      params: permissive,
      query: { GET: permissive } as never,
    });

    expect(validated.params).toEqual(PARAMS);
    expect(validated.query).toEqual(QUERY);
  });

  test("runs params through the schema", async () => {
    const checked: Array<unknown> = [];

    await validatedIn({
      params: { validate: (data: unknown) => checked.push(data) } as never,
    });

    expect(checked).toEqual([PARAMS]);
  });

  test("leaves a target with no schema for this method empty", async () => {
    // a route may declare `json` on POST only - a GET having no json schema is
    // ordinary, unlike params, which every validated route carries
    const validated = await validatedIn({ params: permissive });

    expect(validated.query).toBeUndefined();
    expect(validated.json).toBeUndefined();
  });
});

describe("a schema that cannot validate fails loudly", () => {
  test("params missing from an otherwise validated route", async () => {
    // schemas were emitted for this route, so params must be among them -
    // its absence is a codegen bug, not a route that opted out
    await expect(
      validatedIn({ query: { GET: permissive } } as never),
    ).rejects.toThrow(/malformed params schema for GET - no validate\(\)/);
  });

  test("params present but without validate()", async () => {
    await expect(validatedIn({ params: malformed })).rejects.toThrow(
      /malformed params schema for GET - no validate\(\)/,
    );
  });

  test("a per-method target without validate()", async () => {
    await expect(
      validatedIn({ params: permissive, query: { GET: malformed } } as never),
    ).rejects.toThrow(/malformed query schema for GET - no validate\(\)/);
  });
});

describe("a route carrying no schemas", () => {
  test("validates nothing - every target stays empty, params included", async () => {
    const validated = await validatedIn(undefined);

    for (const target of TARGETS) {
      expect(validated[target], target).toBeUndefined();
    }
  });

  test("an empty schema map reads the same as none", async () => {
    const validated = await validatedIn({});

    for (const target of TARGETS) {
      expect(validated[target], target).toBeUndefined();
    }
  });

  test("composes no validators at all", async () => {
    const [validated] = build([routeSource("a", { params: permissive }, () => {})]);
    const [plain] = build([routeSource("b", undefined, () => {})]);

    // the unvalidated route is shorter by exactly the validator set
    expect(plain.middleware.length).toBeLessThan(validated.middleware.length);
  });
});

describe("validation is per route", () => {
  test("an unvalidated route does not disarm a validated sibling", async () => {
    const seen: Record<string, Seen> = {};

    const routes = build([
      routeSource("validated", { params: permissive }, (v) => {
        seen.validated = v;
      }),
      routeSource("plain", undefined, (v) => {
        seen.plain = v;
      }),
    ]);

    for (const route of routes) {
      await run(route);
    }

    expect(seen.validated.params).toEqual(PARAMS);
    expect(seen.plain.params).toBeUndefined();
  });

  test("a malformed schema on one route does not reach another", async () => {
    const [, plain] = build([
      routeSource("broken", { params: malformed }, () => {}),
      routeSource("plain", undefined, () => {}),
    ]);

    // the broken route throws when it runs; this one is untouched by it
    await expect(run(plain)).resolves.toBeUndefined();
  });
});
