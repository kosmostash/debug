import { describe, expect, test } from "vitest";

import { createRoutes } from "../../src/api/routes";
import type { HandlerDefinition, RouteSource } from "../../src/api/types";
import type { ValidationSchemas } from "../../src/types";

type Middleware = (ctx: never, next: Function) => unknown;

const PARAMS = { id: 1, name: "kosmo" };

/**
 * Run a route's composed chain against a bare context and hand back whatever
 * the handler saw on `ctx.validated`.
 *
 * `validationSchemas: {}` is the `validation: false` folder - no schema for any
 * target. Every generated project sets `validation: true`, so this shape is
 * reachable only from a unit test.
 * */
const validatedIn = async (
  validationSchemas: ValidationSchemas = {},
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
        query: () => ({ page: 2 }),
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

/** a schema object that is present but cannot validate - a codegen bug */
const malformed = { check: () => true } as never;

describe("validation disabled for the folder", () => {
  test("params are still seeded", async () => {
    expect(await validatedIn({}, false)).toHaveProperty("params", PARAMS);
  });
});

describe("a malformed schema fails loudly", () => {
  test("params", async () => {
    await expect(validatedIn({ params: malformed })).rejects.toThrow(
      /malformed params schema for GET - no validate\(\)/,
    );
  });

  test("a per-method target", async () => {
    await expect(
      validatedIn({ query: { GET: malformed } } as never),
    ).rejects.toThrow(/malformed query schema for GET - no validate\(\)/);
  });

  test("but an absent schema is not malformed", async () => {
    // the two must stay distinguishable: `validation: false` has no schemas
    // at all, and that is a configuration, not a bug
    await expect(validatedIn({})).resolves.toHaveProperty("params", PARAMS);
  });
});

describe("ctx.validated", () => {
  test("params are present even with no params schema", async () => {
    // ExtendContext types `validated` as `& { params: ParamsT }` - always
    // present, never optional - so the runtime has to hold up its end
    expect(await validatedIn({})).toHaveProperty("params", PARAMS);
  });

  test("params run through the schema when there is one", async () => {
    const checked: Array<unknown> = [];

    const validated = await validatedIn({
      params: {
        validate: (data: unknown) => {
          checked.push(data);
        },
      } as never,
    });

    expect(checked).toEqual([PARAMS]);
    expect(validated).toHaveProperty("params", PARAMS);
  });

  test("a target with no schema stays empty", async () => {
    // unlike params, the other targets are filled by validation and nothing
    // else - parsing one through the metaparser must not leak into `validated`.
    // Every target is an enumerable getter, so the key is always there and it
    // is the value that has to be undefined.
    expect((await validatedIn({})).query).toBeUndefined();
  });
});
