import { writeFile } from "node:fs/promises";

import type { TestFunction } from "vitest";

import type { BACKENDS } from "@kosmojs/core";
import { pathResolver } from "@kosmojs/lib";

import { setupTestProject } from "./setup";

type Backend = keyof typeof BACKENDS;

/**
 * The only per-backend differences. Everything else the generated middleware
 * does - reading the request, recording the chain, short-circuiting with a
 * status - goes through the framework-agnostic KosmoJS API.
 *
 * Denying short-circuits by sending a response rather than throwing: the
 * seeded `api/errors.ts` files do not agree on how a thrown value becomes a
 * status, and that difference is not what these tests are about.
 * */
const dialects: Record<
  Backend,
  {
    ctx: string;
    send: (value: string) => string;
    deny: (status: number, message: string) => string;
  }
> = {
  hono: {
    ctx: "ctx",
    send: (value) => `return ctx.json(${value})`,
    deny: (status, message) => `return ctx.text("${message}", ${status})`,
  },
  h3: {
    ctx: "event",
    send: (value) => `return ${value}`,
    deny: (status, message) =>
      `return new Response("${message}", { status: ${status} })`,
  },
  koa: {
    ctx: "ctx",
    send: (value) => `ctx.body = ${value}`,
    deny: (status, message) =>
      `ctx.status = ${status}; ctx.body = "${message}"; return;`,
  },
};

/**
 * Middleware bodies record themselves on the parsed query object.
 *
 * `ctx.metaparser.query()` is cached per request and returns the same object
 * every time, so appending to it gives a request-scoped trace with no shared
 * state between requests - and proves the metaparser is usable at the edge,
 * where `ctx.validated.*` is still empty.
 * */
/**
 * Every named validation slot, in the order createRoutes positions them.
 * A trace of these names is the whole override matrix in one assertion.
 * */
const VALIDATION_SLOTS = [
  "validate:params",
  "validate:query",
  "validate:headers",
  "validate:cookies",
  "validate:json",
  "validate:form",
  "validate:raw",
  "validate:response",
] as const;

type Level = "global" | "cascading" | "route";

/** what a validator override records: "global:validate:params" */
const slotLabel = (level: Level, slot: string) => `${level}:${slot}`;

const OVERRIDE = /^(global|cascading|route):validate:/;

const validatorsIn = (trace: Array<string>) =>
  trace.filter((e) => OVERRIDE.test(e));
const withoutValidators = (trace: Array<string>) =>
  trace.filter((e) => !OVERRIDE.test(e));

const record = (ctx: string, label: string) => {
  return `const q = ${ctx}.metaparser.query();
      q.trace = [...(q.trace ?? []), "${label}"];`;
};

export const createTests = async (backend: Backend) => {
  const { ctx, send, deny } = dialects[backend];

  const project = await setupTestProject({ frontend: "random", backend });

  const { createPath } = pathResolver(project.sourceFolder);

  await project.bootstrapProject();

  const use = (label: string, slot?: string) => {
    return `use(async (${ctx}, next) => {
      ${record(ctx, label)}
      return next();
    }${slot ? `, { slot: "${slot}" }` : ""})`;
  };

  /**
   * Global middleware: two edge slots plus an unslotted entry, so every test
   * can tell an edge position from the ordinary global one.
   * */
  await writeFile(
    createPath.api("use.ts"),
    `
      import { use } from "_/api";

      export default [
        ${use("edge:ratelimit", "edge:ratelimit")},
        use(async (${ctx}, next) => {
          ${record(ctx, "edge:auth")}
          // validation has not run yet - this is what makes 401-before-400 work
          q.validatedAtEdge = String(${ctx}.validated.query);
          if (q.token !== "ok" && q.authenticate === "yes") {
            ${deny(401, "Authentication required")}
          }
          return next();
        }, { slot: "edge:auth" }),
        ${use("global")},
        ${VALIDATION_SLOTS.map((slot) => use(slotLabel("global", slot), slot)).join(",\n        ")},
      ];
    `,
  );

  // a cascading use.ts that substitutes edge:auth for its subtree only
  await project.createApiRoutes(
    [{ name: "guarded", file: "use" }],
    async () => {
      return () => `
      import { use } from "_/api";
      export type UseT = {};
      export default [
        ${use("subtree:auth", "edge:auth")},
        ${use("cascading")},
      ];
    `;
    },
  );

  // re-claims every validation slot for its subtree
  await project.createApiRoutes(
    [{ name: "overridden", file: "use" }],
    async () => {
      return () => `
        import { use } from "_/api";
        export type UseT = {};
        export default [
          ${VALIDATION_SLOTS.map((slot) => use(slotLabel("cascading", slot), slot)).join(",\n          ")},
        ];
      `;
    },
  );

  /**
   * An override carrying `on` - the slot is resolved before `on` is applied,
   * so the question is what a method outside that list ends up with.
   * */
  await project.createApiRoutes([{ name: "scoped", file: "use" }], async () => {
    return () => `
      import { use } from "_/api";
      export type UseT = {};
      export default [
        use(async (${ctx}, next) => {
          ${record(ctx, slotLabel("cascading", "validate:params"))}
          return next();
        }, { slot: "validate:params", on: ["POST"] }),
      ];
    `;
  });

  const handler = `GET(async (${ctx}) => {
    const q = ${ctx}.metaparser.query();
    ${send(`{ trace: [...(q.trace ?? []), "handler"], validatedAtEdge: q.validatedAtEdge }`)};
  })`;

  const routes: Array<[name: string, body: string]> = [
    // inherits both global edge slots untouched
    ["chain", handler],

    // substitutes edge:auth only - edge:ratelimit must keep applying
    ["chain/route-edge", `${use("route:auth", "edge:auth")},\n${handler}`],

    // an edge slot of its own, with nothing above it to replace
    ["audited", `${use("route:audit", "edge:audit")},\n${handler}`],

    // under the cascading use.ts
    ["guarded/subtree", handler],

    /**
     * A validate:query override that rejects. Paired with the global edge:auth
     * above it answers the question the feature exists for: which status does a
     * request that is both unauthenticated and invalid get?
     * */
    [
      "gated",
      `use(async (${ctx}, next) => {
        ${record(ctx, "validate:query")}
        ${deny(400, "Invalid query")}
      }, { slot: "validate:query" }),\n${handler}`,
    ],
  ];

  await project.createApiRoutes(
    routes.map(([name]) => ({ name })),
    async ({ name }) => {
      const [, body] = routes.find(([route]) => route === name) as [
        string,
        string,
      ];
      return () => `
        import { defineRoute } from "_/api";
        export default defineRoute<"${name}">(({ GET, use }) => [
          ${body},
        ]);
      `;
    },
  );

  /**
   * Each matrix route declares a numeric `id`, and every request below sends a
   * non-numeric one. A surviving built-in `validate:params` would answer 400,
   * so a 200 is proof the override displaced it rather than merely preceding it.
   * */
  const matrix: Array<[name: string, overrides: Array<string>]> = [
    // nothing local - the global use.ts holds every slot
    ["at-global/[id]", []],
    // under the cascading use.ts, which re-claims them from the global one
    ["overridden/at-cascading/[id]", []],
    // and the route takes them from the cascading one
    [
      "overridden/at-route/[id]",
      VALIDATION_SLOTS.map((slot) => use(slotLabel("route", slot), slot)),
    ],
    // the `on`-scoped cascading override, requested on a method it excludes
    ["scoped/probe/[id]", []],
  ];

  await project.createApiRoutes(
    matrix.map(([name]) => ({ name })),
    async ({ name }) => {
      const [, overrides] = matrix.find(([route]) => route === name) as [
        string,
        Array<string>,
      ];
      return () => `
        import { defineRoute } from "_/api";
        export default defineRoute<"${name}", [number]>(({ GET, use }) => [
          ${[...overrides, handler].join(",\n          ")},
        ]);
      `;
    },
  );

  /**
   * `got` rejects on non-2xx, so normalize both outcomes into a plain result -
   * an assertion in a catch block passes vacuously when nothing throws.
   * */
  const request = async (
    path: string,
    searchParams?: Record<string, string>,
  ) => {
    const collect = (response: {
      statusCode: number;
      body: unknown;
      headers: Record<string, unknown>;
    }) => {
      const body = String(response.body ?? "");
      return {
        status: response.statusCode,
        body,
        json: String(response.headers["content-type"]).includes("json")
          ? JSON.parse(body)
          : undefined,
      };
    };

    try {
      const { response } = await project.withApiResponse(path, {
        ...(searchParams ? { searchParams } : {}),
      });
      return collect(response as never);
    } catch (error) {
      const response = (error as { response?: never }).response;
      if (!response) {
        throw error;
      }
      return collect(response);
    }
  };

  const traceOf = async (
    path: string,
    searchParams?: Record<string, string>,
  ) => {
    const { status, json, body } = await request(path, searchParams);
    if (status !== 200) {
      throw new Error(`${path}: expected 200, got ${status} - ${body}`);
    }
    return json as { trace: Array<string>; validatedAtEdge: string };
  };

  /** the validation-slot labels a matrix route recorded, plus its status */
  const matrixTrace = async (path: string) => {
    const { status, json, body } = await request(path);
    if (status !== 200) {
      return { status, trace: [] as Array<string>, body };
    }
    return {
      status,
      body,
      trace: validatorsIn((json as { trace: Array<string> }).trace),
    };
  };

  const tests: Array<{ name: string; runner: TestFunction }> = [
    {
      name: "edge slots run first, in declaration order, exactly once",
      async runner({ expect }) {
        const { trace: raw } = await traceOf("chain");
        const trace = withoutValidators(raw);
        expect(trace).toEqual([
          "edge:ratelimit",
          "edge:auth",
          "global",
          "handler",
        ]);
      },
    },

    {
      name: "a route override substitutes its own edge slot only",
      async runner({ expect }) {
        const { trace: raw } = await traceOf("chain/route-edge");
        const trace = withoutValidators(raw);
        // edge:ratelimit keeps its edge position; edge:auth is replaced in place
        expect(trace).toEqual([
          "edge:ratelimit",
          "route:auth",
          "global",
          "handler",
        ]);
        expect(trace).not.toContain("edge:auth");
      },
    },

    {
      name: "a cascading use.ts substitutes an edge slot for its subtree",
      async runner({ expect }) {
        const { trace: raw } = await traceOf("guarded/subtree");
        const trace = withoutValidators(raw);
        expect(trace).toEqual([
          "edge:ratelimit",
          "subtree:auth",
          "global",
          "cascading",
          "handler",
        ]);
        expect(trace).not.toContain("edge:auth");

        // a sibling outside the subtree still gets the global one
        const sibling = await traceOf("chain");
        expect(withoutValidators(sibling.trace)).toContain("edge:auth");
      },
    },

    {
      name: "a route-only edge slot runs at the edge with nothing to replace",
      async runner({ expect }) {
        const { trace: raw } = await traceOf("audited");
        const trace = withoutValidators(raw);
        expect(trace).toEqual([
          "edge:ratelimit",
          "edge:auth",
          "route:audit",
          "global",
          "handler",
        ]);
      },
    },

    {
      name: "ctx.validated is empty at the edge even for a parsed target",
      async runner({ expect }) {
        const { validatedAtEdge } = await traceOf("chain");
        expect(validatedAtEdge).toEqual("undefined");
      },
    },

    {
      name: "an edge slot answers 401 before validation can answer 400",
      async runner({ expect }) {
        // unauthenticated AND invalid - the edge gets there first
        const rejected = await request("gated", { authenticate: "yes" });
        expect(rejected.status).toEqual(401);
        expect(rejected.body).toMatch(/Authentication required/);

        // authenticated, still invalid - now validation speaks
        const invalid = await request("gated", {
          authenticate: "yes",
          token: "ok",
        });
        expect(invalid.status).toEqual(400);
        expect(invalid.body).toMatch(/Invalid query/);
      },
    },

    {
      name: "every validation slot is held by the global use.ts by default",
      async runner({ expect }) {
        const { trace, status } = await matrixTrace("at-global/abc");

        expect(trace).toEqual(
          VALIDATION_SLOTS.map((slot) => slotLabel("global", slot)),
        );
        // a surviving built-in validator would have rejected the non-numeric id
        expect(status).toEqual(200);
      },
    },

    {
      name: "a cascading use.ts takes every slot from the global one",
      async runner({ expect }) {
        const { trace, status } = await matrixTrace(
          "overridden/at-cascading/abc",
        );

        expect(trace).toEqual(
          VALIDATION_SLOTS.map((slot) => slotLabel("cascading", slot)),
        );
        expect(trace.some((e) => e.startsWith("global:"))).toBe(false);
        expect(status).toEqual(200);
      },
    },

    {
      name: "a route takes every slot from the cascading and global ones",
      async runner({ expect }) {
        const { trace, status } = await matrixTrace("overridden/at-route/abc");

        expect(trace).toEqual(
          VALIDATION_SLOTS.map((slot) => slotLabel("route", slot)),
        );
        expect(trace.some((e) => /^(global|cascading):/.test(e))).toBe(false);
        expect(status).toEqual(200);
      },
    },

    {
      name: "each level claims a slot exactly once",
      async runner({ expect }) {
        for (const path of [
          "at-global/abc",
          "overridden/at-cascading/abc",
          "overridden/at-route/abc",
        ]) {
          const { trace } = await matrixTrace(path);
          expect(new Set(trace).size, path).toEqual(VALIDATION_SLOTS.length);
        }
      },
    },
    {
      name: "an on-scoped override empties its slot on other methods",
      async runner({ expect }) {
        /**
         * The slot is resolved before `on` is applied, so a cascading
         * `{ slot: "validate:params", on: ["POST"] }` displaces both the global
         * override and the built-in validator - and is then filtered out of a
         * GET, leaving the slot with nothing in it.
         *
         * The route declares a numeric id and the request sends "abc": a 200
         * means nothing validated it. Pinning current behaviour, not endorsing
         * it - scoping an override silently drops validation elsewhere.
         * */
        const { status, trace } = await matrixTrace("scoped/probe/abc");

        // nothing holds validate:params - not the cascading override that
        // claimed it, not the global one it displaced, not the built-in
        expect(trace.filter((e) => e.endsWith(":validate:params"))).toEqual([]);

        // the slots it did not claim are untouched
        expect(trace).toEqual(
          VALIDATION_SLOTS.filter((slot) => slot !== "validate:params").map(
            (slot) => slotLabel("global", slot),
          ),
        );

        // and the non-numeric id reached the handler unchecked
        expect(status).toEqual(200);
      },
    },

    {
      name: "an edge slot that passes leaves the chain intact",
      async runner({ expect }) {
        const { trace: raw } = await traceOf("chain", {
          authenticate: "yes",
          token: "ok",
        });
        const trace = withoutValidators(raw);
        expect(trace).toEqual([
          "edge:ratelimit",
          "edge:auth",
          "global",
          "handler",
        ]);
      },
    },
  ];

  return { project, tests };
};
