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
 * state between requests - and proves the metaparser is usable at the edge.
 *
 * NOTE: parsing a target here also makes `ctx.validated[target]` non-empty -
 * the two share one per-request cache - so probe an untouched target when
 * asserting that validation has not run.
 * */
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
          q.validatedAtEdge = String(${ctx}.validated.headers);
          if (q.token !== "ok" && q.authenticate === "yes") {
            ${deny(401, "Authentication required")}
          }
          return next();
        }, { slot: "edge:auth" }),
        ${use("global")},
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

  const tests: Array<{ name: string; runner: TestFunction }> = [
    {
      name: "edge slots run first, in declaration order, exactly once",
      async runner({ expect }) {
        const { trace } = await traceOf("chain");
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
        const { trace } = await traceOf("chain/route-edge");
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
        const { trace } = await traceOf("guarded/subtree");
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
        expect(sibling.trace).toContain("edge:auth");
      },
    },

    {
      name: "a route-only edge slot runs at the edge with nothing to replace",
      async runner({ expect }) {
        const { trace } = await traceOf("audited");
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
      name: "an unparsed ctx.validated target is empty at the edge",
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
      name: "an edge slot that passes leaves the chain intact",
      async runner({ expect }) {
        const { trace } = await traceOf("chain", {
          authenticate: "yes",
          token: "ok",
        });
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
