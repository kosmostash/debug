---
title: Cascading Middleware
description: Organize middleware hierarchically using use.ts files that wrap route subtrees.
    Apply authentication, logging, and custom parsers to folders and their descendants
    without cluttering individual route definitions.
head:
  - - meta
    - name: keywords
      content: use.ts files, middleware organization, hierarchical middleware,
        automatic middleware, middleware composition, authentication middleware
---

Place a `use.ts` file in any folder, and its middleware automatically wraps all routes
in that folder and its subfolders - no imports or wiring required.

## How it Works

```txt
api/users/
├── about/
│   └── index.ts
├── account/
│   ├── index.ts
│   └── use.ts
├── index.ts
└── use.ts
```

- `users/use.ts` wraps all routes under `/api/users`
- `users/account/use.ts` wraps only routes under `/api/users/account`

Execution order for a request to `/api/users/account`:

```txt
api/use.ts               -> global middleware
users/use.ts             -> parent folder
users/account/use.ts     -> current folder
users/account/index.ts   -> route handler
```

Parent middleware always runs before child middleware.

> Child routes can't skip parent `use.ts`

The seeded boilerplate when you create a new `use.ts`:

```ts [api/users/use.ts]
import { use } from "_/api";

export type UseT = {};

export default [
  use<UseT>(async (ctx, next) => {
    return next();
  })
];
```

> Some editors load the seeded content immediately, others require a brief unfocus/refocus.

Beside the default exported middleware, every `use.ts` exports the `UseT` type - even if empty.
This type extends the context for all routes underneath, giving you
automatic type safety for anything the middleware adds.

## Type-Safe Context Extension

The whole point of cascading middleware is to avoid manual wiring.
That applies to types too - if your auth middleware adds `user` to the context,
every route underneath should know about it without importing or declaring anything.

`UseT` makes this work. Define what your middleware adds:

:::tabs key:backend variant:code
== Hono
```ts
import { use } from "_/api";

export type UseT = {
  user: { id: number; role: "admin" | "user" };
};

export default [
  use<UseT>(async (ctx, next) => {
    const token = ctx.req.header("authorization")?.replace("Bearer ", "");
    // validate before adding to context - UseT promises this property exists
    if (!token) throw new HTTPException(401, { message: "Authentication required" });
    ctx.set("user", await verifyToken(token));
    return next();
  })
];
```

== H3
```ts
import { use } from "_/api";

export type UseT = {
  user: { id: number; role: "admin" | "user" };
};

export default [
  use<UseT>(async (event, next) => {
    const token = event.req.headers.get("authorization")?.replace("Bearer ", "");
    // validate before adding to context - UseT promises this property exists
    if (!token) throw new HTTPError({ status: 401, message: "Authentication required" });
    event.context.user = await verifyToken(token);
    return next();
  })
];
```

== Koa
```ts
import { use } from "_/api";

export type UseT = {
  user: { id: number; role: "admin" | "user" };
};

export default [
  use<UseT>(async (ctx, next) => {
    const token = ctx.headers.authorization?.replace("Bearer ", "");
    // validate before adding to state - UseT promises this property exists
    ctx.assert(token, 401, "Authentication required");
    ctx.state.user = await verifyToken(token);
    return next();
  })
];
```
:::

Now every route under `/api/admin` has `user` typed on the context automatically -
no imports, no type arguments on `defineRoute`:

:::tabs key:backend variant:code
== Hono
```ts
export default defineRoute<"admin/dashboard">(({ GET }) => [
  GET(async (ctx) => {
    const user = ctx.get("user");  // typed as { id: number; role: "admin" | "user" }
  }),
]);
```

== H3
```ts
export default defineRoute<"admin/dashboard">(({ GET }) => [
  GET(async (event) => {
    const { user } = event.context;  // typed as { id: number; role: "admin" | "user" }
  }),
]);
```

== Koa
```ts
export default defineRoute<"admin/dashboard">(({ GET }) => [
  GET(async (ctx) => {
    const { user } = ctx.state;  // typed as { id: number; role: "admin" | "user" }
  }),
]);
```
:::

`UseT` is imported from each `use.ts` in the hierarchy and merged into the context type for `defineRoute`.
Inner definitions override outer ones - just like at runtime,
where inner middleware runs after outer middleware and can overwrite context values.

> The global `api/use.ts` does not need to export `UseT`.
Even if it does, the export is ignored - global middleware operates on types defined in `api/env.d.ts`.
`UseT` is for folder-level `use.ts` files only, where the types cascade
alongside the middleware itself.

**Tip:** inner `use.ts` files can import `UseT` from outer ones, extend it, and re-export -
avoiding duplicate type definitions across the hierarchy:

```ts [api/admin/settings/use.ts]
import type { UseT as ParentT } from "../use";

export type UseT = ParentT & {
  settingsAccess: "read" | "write";
};
```

## Parameter Availability

Cascading middleware runs for all routes in the hierarchy, including ones that don't
define the parameters you might expect:

```txt
api/users/
├── [id]/index.ts    ← has 'id' param
├── index.ts         ← NO 'id' param
└── use.ts
```

`ctx.params.id` is undefined for `/users`. Keep cascading middleware generic -
authentication, logging, rate limiting. Parameter-specific logic belongs in the route handler.

## Multiple Middleware + Method Filtering

A single `use.ts` can define multiple functions, and each supports the `on` option
to run only on specific request method(s):

```ts
import { use } from "_/api";

export type UseT = {
  user: { id: number; name: string };
};

export default [
  use<UseT>(async (ctx, next) => {
    // will run on ANY request method
    return next();
  }),

  use<UseT>(
    async (ctx, next) => {
      // will run only on POST
    },
    { on: ["POST"] },
  ),
];
```

## Common Use Cases

Cascading middleware is where subtree-wide concerns belong: authentication, permission checks,
audit logging, per-section rate limiting.

KosmoJS imposes nothing here - `use` accepts your framework's own middleware signature,
so **any Hono/H3/Koa middleware package works unchanged**.
There is nothing KosmoJS-specific about the middleware itself.

### Third-party middleware

Add middleware to `use.ts` and it will run on every route underneath:

:::tabs key:backend variant:code
== Hono
```ts
import { rateLimiter } from "hono-rate-limiter";

import { use } from "_/api";

export default [
  use(
    rateLimiter({
      windowMs: 15 * 60 * 1000,
      limit: 100,
      keyGenerator: (ctx) => ctx.req.header("x-forwarded-for") ?? "anonymous",
    }),
  ),
];
```

== H3
```ts
import { use } from "_/api";

export default [
  use(async function noStore(event, next) {
    event.res.headers.set("cache-control", "no-store");
    return next();
  }),
];
```

== Koa
```ts
import ratelimit from "koa-ratelimit";

import { use } from "_/api";

const db = new Map();

export default [
  use(ratelimit({ driver: "memory", db, duration: 15 * 60 * 1000, max: 100 })),
];
```
:::

::: warning Not CORS, though
A `use.ts` is composed into each route's chain, so it only runs once a route has matched.
A preflight `OPTIONS` is answered before that, and never reaches it.
CORS belongs in `api/app.ts`, as [app&nbsp;middleware](/backend/middleware#app-middleware).
:::

### Authentication for a subtree

Gate a whole section of the API by dropping a `use.ts` into its folder.
Everything under `/api/admin` is now behind the check,
and every route beneath it gets `user` typed on the context through [UseT](#type-safe-context-extension) -
no imports, no type arguments:

```txt
api/
├── use.ts              -> global: request id, auth, rate limit
└── admin/
    ├── use.ts          -> auth: everything under /api/admin
    ├── index.ts
    └── users/
        └── index.ts
```

```ts [api/admin/use.ts]
import { use } from "_/api";

export type UseT = {
  user: { id: number; role: "admin" | "user" };
};

export default [
  use<UseT>(async function requireAdmin(ctx, next) {
    // verify, then populate - UseT promises the property exists downstream
    return next();
  }),
];
```

There is no bundled auth solution and no NextAuth-style integration:
you verify the token and populate the context yourself, the native way for your framework
(`ctx.set("user", ...)` on Hono, `event.context.user = ...` on H3, `ctx.state.user = ...` on Koa).

### Choosing between `use.ts` and route-level `use`

| | Use a cascading `use.ts` | Use an inline `use` |
|---|---|---|
| Scope | a folder and everything beneath it | one route file |
| Wiring | automatic - no imports | explicit, inside `defineRoute` |
| Context types | cascade via `UseT` | via `defineRoute` type arguments |
| Good for | auth, audit logging, rate limiting | one-off concerns for a single endpoint |

Keep cascading middleware **generic**. It runs for sibling routes too,
so a param like `id` may be undefined there - see [Parameter Availability](#parameter-availability).
Parameter-specific logic belongs in the route handler.
