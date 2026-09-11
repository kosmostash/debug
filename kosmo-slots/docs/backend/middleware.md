---
title: Middleware
description: Middleware chains and the Hono/H3/Koa onion model.
    Global middleware in api/use.ts that runs for every route in a source folder,
    method restrictions, and overriding defaults through slots.
head:
  - - meta
    - name: keywords
      content: hono middleware, h3 middleware, koa middleware, use function, middleware chain,
        onion model, middleware composition, middleware slots, global middleware, api/use.ts,
        folder-wide middleware, env.d.ts context types.
---

Beyond the standard HTTP method handlers, you often need to run custom middleware -
code that executes before your main handler to perform tasks like authentication,
logging, or data transformation.

## Basic Usage

KosmoJS provides the `use` function for applying middleware.
The same API applies identically to all frameworks, only the middleware internals slightly differs by framework:

```ts [api/example/index.ts]
export default defineRoute<"example">(({ GET, POST, use }) => [
  use(async (ctx, next) => {
    // runs for both GET and POST
    return next();
  }),

  GET(async (ctx) => { /* ... */ }),
  POST(async (ctx) => { /* ... */ }),
]);
```

Middleware must call `next()` to pass control to the next layer.
Skipping `next()` short-circuits the chain - useful for early rejections.

## Execution Order (Onion Model)

Middleware runs in definition order going in, then unwinds in reverse after the handler.

Consider this example:

```ts [api/example/index.ts]
export default defineRoute<"example">(({ POST, use }) => [
  use(async (ctx, next) => {
    console.log("First middleware");
    await next();
    console.log("First middleware after next");
  }),

  use(async (ctx, next) => {
    console.log("Second middleware");
    await next();
    console.log("Second middleware after next");
  }),

  POST(async (ctx) => {
    console.log("POST handler");
    // ...
  }),
]);
```

When a POST request arrives, the execution order is like:

```
First middleware
Second middleware
POST handler
Second middleware after next
First middleware after next
```

> **Positioning note:** All `use` calls run before method handlers regardless of where they appear in the array.
Defining `use` after a handler doesn't change this:

```ts
export default defineRoute<"example">(({ use, GET, POST }) => [
  use(firstMiddleware),
  GET(async (ctx) => { /* ... */ }),
  POST(async (ctx) => { /* ... */ }),
  use(secondMiddleware), // still runs BEFORE handlers [!code hl]
]);
```

## Global Middleware

Wiring same middleware into every route is tedious and dangerous.

Use **global middleware** instead - add middleware to `api/use.ts` and it runs for **every route** - no imports, no registration, nothing to wire:

```ts [api/use.ts]
import { use } from "_/api";

export default [
  // will run on every route
  use(async function requestId(ctx, next) {
    ctx.set("requestId", crypto.randomUUID());
    return next();
  }),
];
```

This is the place for work that belongs to **routes**: loading the current user onto the context,
permission checks, audit logging of writes - things that need a route to exist,
and that want the request already validated.

Anything narrower belongs in a [cascading&nbsp;use.ts](/backend/cascading-middleware) for a subtree, or in the route's own `use`.

::: warning `api/use.ts` is skipped for non-route responses
A preflight `OPTIONS`, or a `405` for a method the route doesn't implement,
is answered before any route chain runs - so global middleware never sees it:
Which makes this the wrong home for **CORS**: the preflight would never reach your middleware,
and the browser would reject the request before it ever sent the real one.
[Edge&nbsp;middleware](/backend/edge-middleware) is no better here - it runs first *inside* a matched
route's chain, so an unmatched preflight never reaches it either.
CORS - and anything else that must appear on *every* response - belongs to
[app&nbsp;middleware](#app-middleware) in `api/app.ts`.
:::

## Method-Specific Middleware

Use the `on` option to restrict middleware to specific HTTP methods:

```ts [api/example/index.ts]
export default defineRoute<"example">(({ GET, POST, use }) => [
  use(async (ctx, next) => {
    ctx.state.user = await verifyToken(ctx.headers.authorization);
    return next();
  }, {
    on: ["POST"], // [!code hl]
  }),

  GET(async (ctx) => {
    // no auth required
  }),

  POST(async (ctx) => {
    // ctx.state.user is available
  }),
]);
```

## Slot Composition

Slots are named positions in the middleware chain. Middleware with the same slot name
replaces earlier middleware at that position - useful for overriding global defaults per-route.

A global logger defined in `api/use.ts`:

```ts [api/use.ts]
export default [
  use(
    async (ctx, next) => { /* global logger */ },
    { slot: "logger" },
  ),
];
```

Override it for a specific route:

```ts [api/upload/index.ts]
export default defineRoute<"upload">(({ POST, use }) => [
  use(
    async (ctx, next) => {
      // custom logger for this route only
    },
    { slot: "logger" },
  ),
  POST(async (ctx) => { /* ... */ }),
]);
```

> When overriding via slot, explicitly set [on](#method-specific-middleware) option if needed -
it doesn't inherit from the middleware being replaced.

Custom slot names, like `logger`, should be added to `api/env.d.ts`:

```ts [api/env.d.ts]
export declare module "@kosmojs/core/api" {
  interface UseSlots {
    logger: string; // [!code hl]
  }
}
```

Then use it anywhere:

```ts
use(async (ctx, next) => { /* ... */ }, { slot: "logger" })
```

Some slot names are reserved and already positioned in the chain -
the [`edge:`](/backend/edge-middleware) family is the one you are likely to reach for.

---

### Promoting to the Route Edge

Any `use()` entry claiming an `edge:` prefixed slot in `api/use.ts`, in a cascading `use.ts`, or in the route itself -
is lifted out of its usual position and run first in the matched route's chain instead, ahead of validation.
That is [edge middleware](/backend/edge-middleware).

## Overriding Validation

Validation is middleware too, and every target sits in a reserved slot -
so any of them can be replaced exactly the way you replace a `logger`:

```ts
export interface UseSlots {
  "validate:params": string;
  "validate:query": string;
  "validate:headers": string;
  "validate:cookies": string;
  "validate:json": string;
  "validate:form": string;
  "validate:raw": string;
  "validate:response": string;
}
```

> These are reserved slots - no `UseSlots` declaration in `api/env.d.ts` needed.

Claim one and your middleware runs **instead of** the built-in validator for that target,
say an endpoint accepts a body no schema can describe:

```ts [api/import/index.ts]
export default defineRoute<"import">(({ POST, use }) => [
  use(async (ctx, next) => {
    // NDJSON - one JSON document per line
    const body = await ctx.bodyparser.raw<string>();
    // ...
    return next();
  }, {
    slot: "validate:json", // [!code hl]
  }),

  POST(async (ctx) => { /* ... */ }),
]);
```

Everything else about slots still applies: declare it in `api/use.ts` to replace validation
folder-wide, in a [cascading&nbsp;use.ts](/backend/cascading-middleware) for a subtree,
or in the route itself for one endpoint.

### What You Take Over

One target, and only that one. Overriding `validate:json` replaces the JSON validator and
nothing else - `ctx.validated.params`, `.query`, `.headers` and `.cookies` are still filled
in by their own validators, still before your handler runs.

What you give up is that target's entry in `ctx.validated`. The built-in validator loads the
data, checks it, and publishes the result; yours is only expected to check. So
`ctx.validated.json` stays unset, and the handler reads the body itself.

Which costs nothing, because the parsers are shared:

::: tip Parsers are lazy and cached
`ctx.bodyparser.<target>()` and `ctx.metaparser.<target>()` each run at most once per
request and return the cached result afterwards. Call them wherever you like - in your
validator, in the handler, in both. The request stream is read once no matter how many
times you ask for it.
:::

So the handler above just asks again, and gets the body your validator already parsed:

```ts [api/import/index.ts]
  POST(async (ctx) => {
    const records = await ctx.bodyparser.raw<string>()
    // ...
  }),
```

Overriding `validate:response` works the same way in reverse: your middleware decides what
a valid response looks like, and the built-in check no longer runs.

## App Middleware

The outermost layer, and the only one KosmoJS doesn't compose for you.
`api/app.ts` hands you the `Hono` / `H3` / `Koa` instance itself, so anything the framework can do at app level,
you do here - written exactly as that framework's own docs describe:

:::tabs key:backend variant:code
== Hono
```ts
export default appFactory(routes, ({ app }) => {
  app.onError(defaultErrorHandler);

  app.use(async (c, next) => {
    const started = performance.now();
    await next();
    console.log([ c.req.method, c.req.path, performance.now() - started ]);
  });
});
```

== H3
```ts
export default appFactory(routes, ({ app }) => {
  app.use(onError(defaultErrorHandler));

  app.use(async (event, next) => {
    const started = performance.now();
    await next();
    console.log([ event.req.method, event.url.pathname, performance.now() - started ]);
  });
});
```

== Koa
```ts
export default appFactory(routes, ({ app }) => {
  app.use(defaultErrorHandler);

  app.use(async (ctx, next) => {
    const started = performance.now();
    await next();
    console.log([ ctx.method, ctx.path, performance.now() - started ]);
  });
});
```
:::

This layer runs **first, on every request**, whether or not a route matched -
so it is the only place that can answer a 404, or see traffic for URLs your `api/` tree knows nothing about.

It is also the bluntest layer. There are no slots here and nothing downstream can replace it,
and KosmoJS doesn't compose it.

It runs before any route chain, so the KosmoJS helpers aren't on the context yet:
no `ctx.validated`, no `ctx.metaparser`, no `ctx.bodyparser`.

Read the request through the framework's own API - or move the check into [edge middleware](/backend/edge-middleware),
which runs inside the route's chain and has them.

Request logging, CORS, tracing, rate limiting by IP: things that are true of the connection rather than of the route.
