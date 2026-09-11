import { describe, expect, test } from "vitest";

import { createRoutes } from "../../src/api/routes";
import type { HandlerDefinition, RouteSource } from "../../src/api/types";
import type { ValidationSchemas } from "../../src/types";

type Middleware = (ctx: never, next: Function) => unknown;

const PARAMS = { id: 1, name: "kosmo" };
const QUERY = { page: 2 };

/** a schema that passes everything, standing in for a generated one */
const permissive = { validate: () => {} } as never;

/** present but unable to validate - a codegen bug, never a configuration */
const malformed = { check: () => true } as never;

/**
 * Run a route's composed chain and hand back what the handler saw on
 * `ctx.validated`.
 *
 * Mirrors the real shapes only: a folder either has validation on, in which
 * case every route carries a params schema (static routes included), or has it
 * off, in which case the validators are not composed at all.
 * */
const validatedIn = async (
  validationSchemas: ValidationSchemas,
  validationEnabled = true,
) => {
  let seen: Record<string, unknown> | undefined;

  const handler: HandlerDefinition<Middleware> = {
    kind: "handler",
    method: "GET",
    middleware: [
      ((ctx: { validated: Record<string, unknown> }) => {
        seen = { ...ctx.validated };
      }) as never,
    ],
  };

  const routeSource: RouteSource<Middleware> = {
    name: "users/[id]/[name]",
    path: "/users/:id/:name",
    pathPattern: "/users/:id/:name",
    file: "users/[id]/[name]/index.ts",
    params: ["id", "name"],
    numericProperties: { params: ["id"], query: {} },
    booleanProperties: { query: {} },
    cascadingMiddleware: [],
    definitionItems: [handler],
    validationSchemas,
  };

  const [route] = createRoutes<Middleware, Middleware>([routeSource], {
    productionBuild: false,
    createMetaparsers: () =>
      ({
        method: () => "GET",
        pathname: () => "/users/1/kosmo",
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
    validationEnabled,
  });

  // koa-style compose - the shape every backend adapter ends up calling
  const ctx = {} as never;
  const dispatch = async (i: number): Promise<unknown> => {
    const fn = route.middleware[i] as Middleware | undefined;
    return fn ? fn(ctx, () => dispatch(i + 1)) : undefined;
  };
  await dispatch(0);

  return seen ?? {};
};

describe("validation enabled", () => {
  test("a validated target is filled", async () => {
    const validated = await validatedIn({
      params: permissive,
      query: { GET: permissive } as never,
    });

    expect(validated.params).toEqual(PARAMS);
    expect(validated.query).toEqual(QUERY);
  });

  test("params go through the schema", async () => {
    const checked: Array<unknown> = [];

    await validatedIn({
      params: { validate: (data: unknown) => checked.push(data) } as never,
    });

    expect(checked).toEqual([PARAMS]);
  });

  test("a target with no schema for this method stays empty", async () => {
    // a route may declare `json` on POST only - a GET having no json schema is
    // ordinary, unlike params, which every route carries
    const validated = await validatedIn({ params: permissive });

    expect(validated.query).toBeUndefined();
    expect(validated.json).toBeUndefined();
  });
});

describe("a schema that cannot validate fails loudly", () => {
  test("params missing entirely", async () => {
    // every route gets a params schema, static ones included, so its absence
    // is a codegen bug - not a folder that opted out
    await expect(validatedIn({})).rejects.toThrow(
      /malformed params schema for GET - no validate\(\)/,
    );
  });

  test("params present but without validate()", async () => {
    await expect(validatedIn({ params: malformed })).rejects.toThrow(
      /malformed params schema for GET - no validate\(\)/,
    );
  });

  test("a per-method target without validate()", async () => {
    await expect(
      validatedIn({
        params: permissive,
        query: { GET: malformed },
      } as never),
    ).rejects.toThrow(/malformed query schema for GET - no validate\(\)/);
  });
});

describe("validation disabled for the folder", () => {
  test("every target is empty, params included", async () => {
    // the validators are not composed at all, so nothing has passed a schema.
    // Reading the request goes through ctx.metaparser, which is unaffected.
    const validated = await validatedIn({}, false);

    for (const target of ["params", "query", "headers", "cookies", "json"]) {
      expect(validated[target], target).toBeUndefined();
    }
  });

  test("a missing params schema is not an error here", async () => {
    await expect(validatedIn({}, false)).resolves.toBeTruthy();
  });
});
