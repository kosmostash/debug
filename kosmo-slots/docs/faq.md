---
title: KosmoJS FAQ
description: Frequently asked questions about KosmoJS for developers and LLM agents
outline: [2, 3]
---

**KosmoJS FAQ**

### Getting Started & Project Setup

#### What is KosmoJS and what problem does it solve?
A composable meta-framework for organizing multiple apps in a scalable project.

It avoids the friction of microservices (drifting shared types, separate CI/deploy),
monorepos (workspace/package/build-cache overhead and a `packages/shared` dumping ground),
and DIY glue (hand-rolled scripts that become load-bearing).

Instead it uses a Vite-inspired "source folders" approach: the structure of a monorepo,
the simplicity of a single project, and the independence of separate apps -
without the overhead of any of them.

You keep control of backend, frontend, state, styling, database, and deploy target;
KosmoJS owns routing conventions, the validation pipeline, middleware composition,
dev workflow, and build orchestration.
[Details&nbsp;›](/about)

#### Is KosmoJS a runtime, a bundler, or a framework?
Rather a meta-framework built on top of Vite. There is no proprietary runtime, no custom bundler,
and no framework lock-in - every layer (Vite, Hono/H3/Koa, React/Vue/Solid/Svelte/MDX)
is a tool you can use, debug, and replace independently.
[Details&nbsp;›](/about)

#### How do I create a new KosmoJS project?
Run `npm create kosmo demo` (or `pnpm create kosmo demo` / `yarn create kosmo demo`).
An interactive setup creates the project together with your first source folder,
asking only for the framework and backend - the folder defaults to `app` at base `/`.
Then `cd ./demo` and install dependencies.

Use `.` as the name to bootstrap into the current folder (e.g. a freshly cloned repo).
[Details&nbsp;›](/start)

#### How do I create a project non-interactively?
Choose the framework and backend up front - when flags are present no prompts appear:
`npm create kosmo demo -- --frontend react --backend hono`
(pnpm and yarn forward flags without the extra `--`: `pnpm create kosmo demo --frontend ...`).

Required: `--frontend <name>` or `--no-frontend`, and `--backend <name>` or `--no-backend` -
the choice is always explicit; a missing flag is an error, never a silent default.

Optional: `--ssr`, `--ssg`, `--tsq`, `--overwrite`.
The first folder is always `app`, with pages at `/` and its API at `/api`.
[Full flag reference&nbsp;›](/essentials/cli#cli-mode)

Use `.` as the project name to scaffold into the current folder: `npm create kosmo . -- --frontend ...`
[Details&nbsp;›](/start)

#### How do I add a source folder?
Run `npm run folder` (or `pnpm folder` / `yarn folder`) - interactively, or with flags.
[Details&nbsp;›](/essentials/cli#adding-a-source-folder)

#### What am I prompted for when adding a source folder?
Frontend, backend, SSR, SSG (only if SSR is on) and TanStack Query.
Non-interactive: the name is a positional, plus
`--frontend solid|react|vue|svelte|mdx` or `--no-frontend`,
`--backend hono|h3|koa` or `--no-backend`, `--ssr`, `--ssg`, `--tsq`, `--overwrite`.
Frontend and backend each require a value or its negation flag,
and the name is required here - unlike at project creation, it has no default.
The folder gets pages at `/<name>` and its API at `/<name>/api`.
[Details&nbsp;›](/essentials/cli#adding-a-source-folder)

#### How do I create a backend-only (API) folder, or a frontend-only folder?
A source folder doesn't have to ship both sides - framework and backend are independent, and each is optional.
In interactive mode, choose `None (API-only folder)` in the framework select,
or `None (client-only folder)` in the backend select.

In non-interactive mode, pass the matching negation flag for the side you skip:

```sh
pnpm folder api  --backend hono --no-frontend   # backend-only, no UI
pnpm folder docs --frontend mdx  --no-backend   # frontend-only, no backend
```

The seeded `kosmo.config.ts` contains only the block that side needs.
[Details&nbsp;›](/essentials/cli#adding-a-source-folder)

#### Can I create a project without a source folder?
No - every project starts with its first source folder; omitting the name positional just falls back to the default (`app`, pages at `/`, API at `/api`).
A project without folders has nothing to serve or build - the source folder is the unit of everything in KosmoJS.
Add more folders any time with `npm run folder`.
[Details&nbsp;›](/start)

#### Why install again after adding a source folder?
Adding a folder pulls in framework-specific dependencies that need to be installed.
[Details&nbsp;›](/start)

#### How do I start the dev server and what's the default port?
`pnpm dev` (all folders) or `pnpm dev front` (one folder). Default port is `4556`.
[Details&nbsp;›](/dev-build-run/development-workflow#starting-the-dev-server)

#### How do I change the dev port?
It's the `devPort` value in `package.json`.
[Details&nbsp;›](/dev-build-run/development-workflow#starting-the-dev-server)

#### How does this compare to Next.js / Nuxt / SolidStart / tRPC / a hand-rolled Vite setup?
Unlike Next/Nuxt/SolidStart it doesn't choose your frontend or own your deploy model;
unlike tRPC it's route-based (not procedure-based) and also derives OpenAPI and runtime validators;
unlike a hand-rolled Vite setup it provides directory routing for both sides,
derived validation/clients, an isomorphic fetch client (in-process on the server
during SSR, no network hop), out-of-the-box SSR with an opt-in streaming render mode,
and multi-folder build orchestration without the DIY glue.
[Details&nbsp;›](/features)

### Source Folders

#### What is a source folder?
A self-contained app inside the project with its own framework stack, base URL,
routing, middleware, layouts, config, and build output -
but sharing one `package.json`, one `node_modules`, one database layer, and one set of types.
Example layout:
- `src/app` (React + Hono, base `/`)
- `src/admin` (Vue + H3, base `/admin`)
- `src/marketing` (MDX, no backend, base `/`)

[Details&nbsp;›](/features)

#### How is this different from a monorepo package / microservices / DIY glue?
Folders are not separate packages: no workspaces, no package boundaries,
no internal dependency graph, no publishing, no versioning, no workspace protocols.
You get monorepo-like structure and microservice-like independence with single-project simplicity.
[Details&nbsp;›](/about)

#### Can different folders use different frameworks/backends at the same time?
Yes. Each folder picks its own backend (Hono/H3/Koa) and frontend (React/Vue/SolidJS/Svelte/MDX),
and they coexist in one project.
[Details&nbsp;›](/features)

#### How do folders share types without publishing/versioning?
Import a type directly across folders through the reserved aliases - `@/*` for root-level
imports, `~/*` for source-folder imports, `_/*` for derived code. Change a database model
and every folder sees it immediately. No publishing, no workspace protocols.
[Details&nbsp;›](/essentials/project-structure#path-mappings)

#### Can I build/deploy a single folder?
Yes - `pnpm build front` builds just that folder. Folders develop together as one project,
but can be built all at once or one at a time, and each build is a self-contained entity you
can deploy independently.
[Details&nbsp;›](/dev-build-run/building-for-production)

#### How do I run/build all folders vs one?
`pnpm dev` / `pnpm build` for all; append a folder name (`pnpm dev front`, `pnpm build admin`) for one.
[Details&nbsp;›](/dev-build-run/development-workflow#starting-the-dev-server)

#### Do routes/types leak between folders?
No - derived types and utilities are scoped per folder.
The admin dashboard's navigation types won't include the main app's routes, and vice versa.
[Details&nbsp;›](/essentials/project-structure#path-mappings)

#### When should I split into separate folders?
One folder per distinct concern (main app, admin, marketing).
A useful rule for SSR vs CSR: deploy an SSR folder for marketing content
and a CSR folder for the app rather than mixing SSR/CSR within one folder.
[Details&nbsp;›](/frontend/server-side-render#technical-considerations)

### Configuration

#### Where does configuration live, and is there a `vite.config.ts`?
Per source folder, in `src/<folder>/kosmo.config.ts` -
there is no project-wide kosmo config and **no separate `vite.config.ts`**.
Vite's `UserConfig` goes in `viteConfig`, on the `frontend` and `backend` blocks separately -
`plugins`, `resolve`, `css`, `define`, and the rest.
A few Vite keys are excluded because KosmoJS derives them from the folder layout:
`root`, `base`, `cacheDir`, `mode`, `builder`, `future`, `legacy`.
Project-wide settings (`distDir`, `devPort`, `previewPort`, scripts) live in the root `package.json`.
[Details&nbsp;›](/essentials/config)

#### What options does a source folder config take?
Three optional blocks: `frontend`, `backend`, `validation`.
`frontend` takes `stack`, `base` (required), `fetch`, `ssr`, `ssg`, `tanstack`, `templates` and `viteConfig`.
`backend` takes `stack`, `base` (required), `openapi`, `alias`, `templates` and `viteConfig`.
`stack` is either a name or `{ name, plugin }`, where `plugin` is a Vite plugin instance you construct.
`validation` is `true` or a TypeBox options object.
[Details&nbsp;›](/essentials/config#the-shape)

#### What do I import in `kosmo.config.ts`?
`defineConfig` from `@kosmojs/dev`, and nothing else.
You name a `stack` and flip features on; `defineConfig` assembles the generators for you.
`@kosmojs/dev` also exports the generators themselves, for the `generator` escape hatch
that swaps a built-in generator for your own on any block.
[Details&nbsp;›](/essentials/config#bringing-your-own-generator)

#### What runs, and in what order?
Fixed, and independent of how you write the config:
`core -> backend -> validation -> openapi -> fetch -> frontend -> ssr -> ssg`.
`coreGenerator` always runs first and is never listed.
`validation` and `openapi` only apply when a `backend` is present,
and `fetch` only produces clients when there are backend routes to derive them from.
[Details&nbsp;›](/essentials/config#bringing-your-own-generator)

#### Should I add my stack's Vite plugin to `viteConfig.plugins`?
No - it reaches Vite through `stack`, so listing it in `viteConfig.plugins` runs the transform twice.
To configure it, construct it yourself and pass it as `plugin`:
`frontend: { stack: { name: "react", plugin: react({ jsxRuntime: "classic" }) }, base: "/" }`.
With a bare name KosmoJS builds the plugin with the arguments the current command needs;
an instance you pass is used as written, so set those yourself.
[Details&nbsp;›](/essentials/config#frontend-stack-required)

#### How do I change the `/api` prefix, and where does it come from?
It is `backend.base` in the folder's `kosmo.config.ts`, and it is a **full path** -
not a suffix joined onto `frontend.base`. A route's URL is `backend.base` + route name,
so `backend: { base: "/admin/api" }` serves `users/[id]` at `/admin/api/users/:id`.
The `api/` **directory** name never appears in the URL - it only separates server routes from `pages/` on disk.
[Details&nbsp;›](/essentials/config#backend-base-required)

#### Can I rename `VRefine`?
Yes - set `refineTypeName` inside the `validation` options object.
It stays globally available and import-free under whatever name you choose.
[Details&nbsp;›](/essentials/config#validation)

#### How do I map an extra URL onto an existing route?
The `alias` option in the `backend` block: `backend: { alias: { "/feed.xml": "rss" } }`.
Keys are absolute URLs, not prefixed by the router's base; if a key has dynamic segments,
their names must match the target route's parameters exactly or the request 404s.
[Details&nbsp;›](/backend/aliases)

### Directory-Based Routing

#### How does routing map files to URLs?
Folder names become path segments; `index` files define the endpoint or component:
- `api/users/[id]/index.ts` maps to `/api/users/:id`
- `pages/users/[id]/index.tsx` maps to `/users/:id`.

No separate routing config - your file structure is your route definition.
[Details&nbsp;›](/routing/intro#how-it-works)

#### Why directory-based instead of file-based?
Clarity at scale: only `index.ts` is a route handler; every other file in the folder
is an obviously-colocated helper. File-based routing leaves `schema.ts`/`auth.ts`/`utils.ts` ambiguous -
route or helper? Directory-based removes that ambiguity.
The only cost is creating a folder even when it holds just `index.ts`.
[Details&nbsp;›](/routing/rationale)

#### Why must every route be a folder with an `index` file, even the root?
Consistency - no special cases. The base route uses a folder named `index`
(`pages/index/index.tsx` -> `/`).
[Details&nbsp;›](/routing/intro#how-it-works)

#### How do nested routes work?
Nest folders. `api/users/[id]/posts/index.ts` -> `/api/users/:id/posts`,
as deep as your domain requires, each level colocating its own helpers, types,
and tests without affecting siblings. Nesting also composes vertically: layouts wrap
nested pages, and middleware cascades down the tree, so a parent segment's layout and
middleware apply to everything beneath it.
[Details&nbsp;›](/routing/intro#nested-routes)

#### Why the parallel `api/` and `pages/` structure?
Intentional - a page and its corresponding API endpoint are always one folder apart and easy to find.
[Details&nbsp;›](/routing/intro#how-it-works)

#### How do I create an API route?
Create a folder under `api/` with an `index.ts` file - the folder path becomes the URL
and KosmoJS seeds starter code automatically. For example, `api/products/index.ts`
exposes `/api/products`, and `api/products/[id]/index.ts` exposes `/api/products/:id`.
Inside, default-export a `defineRoute` that returns method handlers,
then replace the seeded placeholder with real logic and visit the URL
(e.g. `http://localhost:4556/api/products`).
[Details&nbsp;›](/routing/intro#route-file-requirements)

#### How do I create a page?
Create a matching folder under `pages/` with an `index` component file for your framework -
`pages/products/index.tsx` (React/SolidJS), `.vue` (Vue), `.svelte` (Svelte), or `.mdx` (MDX) - and it becomes `/products`.
KosmoJS seeds a placeholder component you replace with your own;
the parallel `api/` and `pages/` trees mean a page and its endpoint are always one folder apart.
The two sides are coupled by usage, not by name - you pick the names on each end freely. The
docs mirror api and page names purely for consistency; matching them is a convention, not a
requirement.
Pages typically read data through the fetch client (`fetchClients["products"].GET()`).
[Details&nbsp;›](/routing/intro#route-file-requirements)

#### What does the `_/` prefix and `_/api` map to?
`_/` maps to `lib/` (derived code). `_/api` resolves to `lib/<folder>/api.ts`,
where `<folder>` is your source-folder name.
[Details&nbsp;›](/essentials/project-structure#path-mappings)

#### What do `@/*`, `~/*`, `_/*` mean?

Reserved path mappings:
- `@/*` root-level imports
- `~/*` source-folder imports,
- `_/*` derived-code imports.

Don't reuse these prefixes for your own aliases.
[Details&nbsp;›](/tutorial)

### Route Parameters

#### What are the three parameter types?

- `[id]` required (exactly one segment)
- `{id}` optional (one segment or nothing)
- `{...path}` splat (any number of segments).

Same syntax for API routes and pages.
[Details&nbsp;›](/routing/params)

#### How do I read a splat parameter?
Matched segments come back as an array - for `/docs/guides/deployment/production`,
`ctx.validated.params.path` is `["guides", "deployment", "production"]`.
Useful for doc sites, file browsers, arbitrarily nested paths.
[Details&nbsp;›](/routing/params#splat-parameters)

#### Why can't an optional param precede a required one?
It creates ambiguity; `users/{optional}/[required]` is invalid.
Optional params must not be followed by required ones (`users/{section}/{subsection}` is fine).
[Details&nbsp;›](/routing/params#optional-parameters)

#### Why am I getting an unexpected 404 with an optional param before a static segment?
With `properties/{city}/filters`, visiting `/properties/filters` makes the router match
`{city}="filters"` and then expect another `/filters` segment that isn't there - 404.
Fix it by adding an explicit static route (`properties/filters/index.tsx`), which takes priority.
[Details&nbsp;›](/routing/params#watch-out-for-ambiguous-paths)

#### When does a static route win over a dynamic one?
Always - static routes take priority over dynamic ones.
[Details&nbsp;›](/routing/params#watch-out-for-ambiguous-paths)

#### How does a sibling `index` make `[id]` effectively optional?
A parent `index` provides a fallback to render, so `careers/index.tsx` + `careers/[jobId]/index.tsx`
makes `[jobId]` effectively optional. `{jobId}` communicates that intent more clearly;
both notations work identically here.
[Details&nbsp;›](/routing/params#required-vs-optional-a-subtlety)

#### How do mixed segments work?
Static text + params in one segment: `[category].html`, `[id]-[data].json`, `[name].[ext]`.
The folder is named with the mixed segment and `index.ts` lives inside it like any other route.
[Details&nbsp;›](/routing/params#mixed-segments)

#### Which frontends support mixed segments?
- *Backend*
    - Hono and H3: partial support with caveats.
    - Koa: full support.
- *Frontend*:
    - Vue, Svelte, and MDX: full support.
    - React Router: `.ext` suffix only.
    - SolidJS: not supported.

Prefer simple segments for frontend routes and keep mixed segments to the API side where support is complete.
[Details&nbsp;›](/routing/params#mixed-segments)

#### What is power syntax?
Raw `path-to-regexp v8` patterns passed through directly.
The rule: any param name containing non-alphanumeric characters is treated as a raw pattern.
Examples: `book{-:id}-info`, `locale{-:lang{-:country}}`, `api/{v:version}/users`.

**Koa is the only backend with full support**: Hono matches but renames the params (`_0abc`),
H3 won't match at all, and no frontend supports it - keep power syntax on the API side, on Koa.
Read the path-to-regexp docs before using it in production.
[Details&nbsp;›](/routing/params#power-syntax)

#### How do I make an optional static part (e.g. an optional `.html`)?
e.g. `products/{:category.html}` - matches `/products` and `/products/electronics.html`
but not `/products/electronics`.
[Details&nbsp;›](/routing/params#power-syntax)

#### Does KosmoJS run its own path-to-regexp routing under the hood?
No - path-to-regexp is used only at build time to parse your directory structure into route definitions.
At runtime, those parsed routes are registered with each framework's native router
exactly as you would register them by hand, so you keep the framework's full native routing:
Hono's high-performance router on the backend, and React Router / Solid Router / Vue Router
(with their nested layouts) on the frontend.
KosmoJS is the chassis, not the engine - the engine is whichever framework you chose.
[Details&nbsp;›](/routing/intro#native-routing-under-the-hood)

### Seeded Boilerplate

#### What happens when I create a route file?
KosmoJS detects it and writes appropriate boilerplate -
an API route (`defineRoute`) vs a page component, matched to your framework.
You rarely write the skeleton by hand.
[Details&nbsp;›](/backend/custom-templates)

#### Why doesn't my editor show seeded content immediately?
Some editors load it instantly; others need a brief unfocus/refocus of the file.
[Details&nbsp;›](/backend/custom-templates)

#### Why avoid anonymous arrow functions as default exports?
A page's default export should be a named function (`export default function Page() {...}`) -
an anonymous arrow can break Vite's HMR.
[Details&nbsp;›](/frontend/custom-templates)

#### How do I override the default seeded template?
Pass `templates` in the `frontend` or `backend` block of `kosmo.config.ts`, keyed by route-name glob pattern.
Each value is either a template string or a function of the route returning one.
Both blocks accept it:
[Custom Page Templates&nbsp;›](/frontend/custom-templates#configuration) ·
[Custom Route Templates&nbsp;›](/backend/custom-templates#configuration)

#### Which seeded files can templates override?
Only route files. On the frontend that means `pages/**/index.*` - **not** layouts and **not** the root `index` route,
which always get their built-ins.
On the backend it means `api/**/index.ts` - **not** `use.ts`.
Folder-level files (`app.ts`, `errors.ts`, `dev.ts`) are deployed once at folder creation and are not templatable.
[Frontend&nbsp;›](/frontend/custom-templates) ·
[Backend&nbsp;›](/backend/custom-templates)

#### Why didn't my new template change an existing route file?
Boilerplate is written **only into blank files** - work you have already done is never overwritten,
so changing a template does not retroactively rewrite existing routes.
Empty the file and it will be filled again.
[Details&nbsp;›](/backend/custom-templates)

#### How does glob matching work for templates?
`*` matches exactly one nesting level, `**` matches any depth,
and an exact string targets a single route. Templates work with all parameter types
(`users/[id]`, `products/{category}`, `docs/{...path}`, combined).
[Details&nbsp;›](/frontend/custom-templates#pattern-syntax)

#### When multiple template patterns match, which wins?
The first matching pattern, in the order the keys are written - so order them
most-specific first (`landing/home` before `landing/*` before `**`).
Caveat: JavaScript hoists integer-like keys to the front of an object, so a pattern such
as `"2024/**"` matches before anything written above it; prefix it with `./` to keep your
order. The same applies to `renderMode`, which uses the same resolver.
[Details&nbsp;›](/frontend/custom-templates#resolution-priority)

#### How do templates help with CRUD seeding?
Define one backend route template with the standard boilerplate - method handlers,
validation targets, a declared `response` - and every seeded `api/**/index.ts` across
many tables starts with the right structure instead of the skeleton being retyped N times.
[Details&nbsp;›](/backend/custom-templates#seeding-crud-endpoints)

### Backend

#### Why does `defineRoute` repeat the route path I'm already in?
Because TypeScript can't see the file system. Routing itself never uses the string -
the URL comes from the file's location. The name is the key into the derived `RouteMap`,
and that lookup is what types `ctx.validated.params` and the cascading `use.ts` context
for that route. Since no runtime argument carries it, nothing can be inferred, so the
type argument is required - and the seeded boilerplate already contains it.
It cannot drift silently: `R extends keyof RouteMap`, so a stale name after a folder
rename is a compile error.
[Details&nbsp;›](/backend/intro#the-route-name-type-argument)

#### How do I define an endpoint?
Default-export a `defineRoute` definition; the factory receives HTTP method builders and `use`,
and returns an array of handlers. Import `defineRoute` from `_/api`.
[Details&nbsp;›](/backend/intro#defining-endpoints)

#### Can I define multiple methods in one file?
Yes - return `GET`, `POST`, `PUT`, `DELETE`, etc. in the array.
[Details&nbsp;›](/backend/intro#defining-endpoints)

#### Does handler order matter?
No - dispatch is by HTTP method. Undefined methods return `405 Method Not Allowed` automatically.
[Details&nbsp;›](/backend/intro#defining-endpoints)

#### Which method builders exist?
`HEAD`, `OPTIONS`, `GET`, `POST`, `PUT`, `PATCH`, `DELETE`.
[Details&nbsp;›](/backend/intro#defining-endpoints)

#### What happens to a HEAD request if I only define GET?
It is served by the `GET` handler, validated against its schemas, with the body dropped per the HTTP spec -
`HEAD` is the one method that doesn't fall through to `405`.
Define `HEAD` explicitly only when you want to override that - except on Hono, where you cannot:
its router ignores any `HEAD` handler you define and fallback to `GET` handler.
[Details&nbsp;›](/backend/intro#defining-endpoints)

#### Why method-based routing?
In KosmoJS a single route folder owns one URL, and inside it you declare a handler per HTTP method -
`GET`, `POST`, `PUT`, and so on - rather than branching on `ctx.method` or splitting verbs across files.

This keeps everything about one resource in one place:
the read, create, update, and delete logic for `/users/[id]` all live in that folder's `index.ts`,
each as its own typed handler with its own validation and middleware.

Because dispatch is by method, the handlers are declarative and order-independent -
you list them in any order and the framework routes to the right one,
returning `405 Method Not Allowed` automatically for verbs you didn't define.

The style draws on Sinatra (2007), the Ruby framework that pioneered defining routes as
`get "/path" do ... end` blocks - the same idea of a verb mapping straight to a handler,
brought into a typed, directory-based structure.
[Details&nbsp;›](/backend/intro#defining-endpoints)

#### Is there HMR for the API? Why does my in-memory state reset in dev?
No HMR on backend.

On the frontend, Vite patches modules in place;
on the backend, changes trigger a hot reload: the whole program restarts, and module-level state resets with it.

That's normal for a backend - it should be stateless so it can restart and scale.

Keep persistent state in a real store (a database, even a local SQLite file),
and close connections in `teardownHandler` so they don't leak across reloads.
[Details&nbsp;›](/dev-build-run/development-workflow#hot-reload-vs-hmr)

### Backend: Hono / H3 / Koa

#### Hono/H3/Koa - which should I pick, and when does it matter?
- *Hono*: Maximum performance, run unchanged across runtimes (Node, Deno, Bun, Workers), and prefer a clean, return‑based API.
- *H3*: Similar to Hono in performance and multi‑runtime support, but with a stronger focus on Web standards and framework‑agnostic design.
- *Koa*: Battle-tested, mature ecosystem, Node-focused. Great for traditional Node.js servers where you value stability and a large library ecosystem.

[Details&nbsp;›](/backend/intro)

#### What's identical and what differs between Hono/H3/Koa implementation?
Identical: route organization, middleware patterns, validation,
the `use` API, slots, cascading middleware.
Different: the context API inside handlers (body, params, state, error model).
[Details&nbsp;›](/backend/intro)

#### How do params differ in Hono vs H3 vs Koa?
Raw params: `ctx.req.param()` (Hono), `event.context.params` (H3), `ctx.params` (Koa) - all return untyped strings.

Always prefer `*.validated.params` - the validated, refined type (e.g., number) with runtime validation automatically enforced.
The validation logic is identical across all frameworks.
[Details&nbsp;›](/backend/context#route-parameters)

#### How do I set the response in Hono/H3/Koa implementation?
The native way for every framework:
- *Hono*: `ctx.json(...)` / `ctx.text(...)` (return a Response‑like object)
- *H3*: Return the value directly - an object is serialized as JSON (application/json),
a string is sent as plain text (text/plain). You can also return a Response for full control.
- *Koa*: `ctx.body = ...` (mutate the context)

All three frameworks support setting status codes and headers as well
(e.g., `ctx.res.status = 201` in Hono, `event.res.status = 201` in H3, `ctx.status = 201` in Koa).
[Details&nbsp;›](/backend/intro)

#### How do the error models differ?
- *Hono*: `app.onError()` catches everything (`await next()` does not throw).
It captures any error thrown in handlers; returns a `Response`.
- *H3*: Uses `app.use(onError(errorHandler))` as the global error handler.
It captures any error thrown in handlers; returns a `Response`, plain object or string.
- *Koa*: Errors bubble up through `await next()`. Koa emits an `error` event (for logging),
but doesn't send a response automatically. Use `app.on("error", errorHandler)` to react on `error` event.
Use `try`/`catch` around `await next()` in middleware to set `ctx.status`/`ctx.body`.

[Details&nbsp;›](/backend/error-handling)

### Backend: Context

#### What is `ctx.bodyparser`?
A unified parser API - `.json()`, `.form()`, `.raw()` - identical across frameworks.
Results are cached, so calling the same parser repeatedly doesn't re-parse.
[Details&nbsp;›](/backend/context#unified-bodyparser)

#### Do I usually call bodyparser directly?
Rarely - defining a validation schema runs the appropriate parser automatically
and places the result in `ctx.validated`.
[Details&nbsp;›](/backend/context#unified-bodyparser)

#### What is `ctx.metaparser`?
The same idea for request metadata - `.params()`, `.query()`, `.headers()`, `.cookies()`.
Synchronous, and cached like the body parsers.
`params()` and `query()` come back normalized - splats split into arrays, values coerced to your declared types -
while `headers()` and `cookies()` are plain parses.
[Details&nbsp;›](/backend/context#unified-metaparser)

#### What is `ctx.validated`?
The validated, typed result for each target you defined:
`ctx.validated.json`, `.query`, `.headers`, `.cookies`, `.form`, `.raw`, `.params`.
[Details&nbsp;›](/backend/context#validated-data-access)

#### How do I access normalized data before validation runs?
Through the parsers. The context is extended before any validator runs, so `ctx.metaparser`
and `ctx.bodyparser` are already on it while `ctx.validated` is still empty.
Useful in [edge middleware](/backend/edge-middleware)
and in a [custom validator](/backend/middleware#overriding-validation).
Both are cached, so reading there costs nothing: the validators and your handler reuse the same values,
and the request stream is read once.
[Details&nbsp;›](/backend/context#unified-metaparser)

#### Is normalized the same as validated?
No. Normalizing splits splats and coerces types; it doesn't check anything.
Your refinements run in the validators, and only the checked results land in `ctx.validated`.
So `ctx.metaparser.query()` may hand you a number that your schema would still reject.
[Details&nbsp;›](/backend/context#unified-metaparser)

#### Can I use the parsers in `api/app.ts`?
No - `api/app.ts` runs before the context is extended, so there is no
`ctx.metaparser`, no `ctx.bodyparser` and no `ctx.validated` yet.
Read the request through the framework's own API, or move the check into `api/use.ts`
under an `edge:` slot, which runs just after the context is extended.
[Details&nbsp;›](/backend/middleware#app-middleware)

#### Do the raw params still work?
Yes - `ctx.req.param()` (Hono), `event.context.params` (H3), `ctx.params` (Koa) still return raw strings if you need them.
[Details&nbsp;›](/backend/context#route-parameters)

### Backend: Middleware

#### How do I add route-level middleware?
Use the `use` builder inside `defineRoute`. By default middleware applies to all HTTP methods;
call `next()` to continue, skip it to short-circuit.
[Details&nbsp;›](/backend/middleware#basic-usage)

#### Where does global middleware live?
`api/use.ts`, at the root of a source folder's `api/` directory.
Whatever it default-exports runs for **every route in that folder** - no imports, no registration.
It's seeded with the folder and is an ordinary file you edit; route templates never touch it.
Use it for route-wide concerns (request id, a blanket auth check, permission checks, audit logging);
anything narrower belongs in a subtree `use.ts` or the route's own `use`.
[Details&nbsp;›](/backend/middleware)

#### Where does CORS go?
`api/app.ts`, as [app middleware](/backend/middleware#app-middleware).
Neither global nor edge middleware works for CORS - a preflight `OPTIONS` is answered before any
route chain runs, so anything composed per route never sees it and the browser rejects the request.
[Details&nbsp;›](/backend/middleware#app-middleware)

#### How do I return 401 instead of 400 when a token is bad?
Give the auth middleware an `edge:` slot - `edge:auth`, say - and it runs ahead of validation,
so an unauthenticated request is rejected before any schema is consulted.
Declare it in `api/use.ts`, a cascading `use.ts` or the route itself;
the file decides reach, the slot decides position.
[Details&nbsp;›](/backend/edge-middleware)

#### So, where do I add my auth?
Depends on whether any route needs to opt out.
Same rules everywhere - put it directly in `api/app.ts`: one middleware, no slots,
nothing downstream can replace it by accident, and it also covers unmatched URLs, preflights and `405`s.
Some routes authenticating differently - a signature-verifying webhook, a public health check -
use an `edge:` slot, so any route or subtree can substitute its own check.
[Details&nbsp;›](/backend/edge-middleware#so-where-do-i-add-my-auth)

#### Can I have more than one edge middleware?
As many as you like - give each its own name. `edge:auth`, `edge:ratelimit`, and so on:
they run at the edge in declaration order, and each is its own slot, independently overridable.
[Details&nbsp;›](/backend/edge-middleware#name-your-slots)

#### Do `edge:*` slots need a `UseSlots` declaration?
No. Every `edge:` prefixed name is reserved, like the validation slots - nothing to add to `api/env.d.ts`.
Typos are still caught, though: `edge-auth` is not a slot.
[Details&nbsp;›](/backend/edge-middleware#name-your-slots)

#### What is the bare `edge` slot, and can I use it?
It holds the built-in middleware that extends the context -
the one that puts `ctx.metaparser` and `ctx.bodyparser` on it.
Claim `edge` and you replace that, so nothing downstream has those helpers and validators, middleware and handlers all break.
Always prefix your own: `edge:auth`, not `edge`.
[Details&nbsp;›](/backend/edge-middleware#name-your-slots)

#### I put auth in `api/app.ts` and a route still declares `slot: "edge:auth"` - which one wins?
Both run. An `edge:auth` slot substitutes an `edge:auth` entry declared above it;
it can't replace anything in `api/app.ts`, because that layer isn't composed by KosmoJS at all.
The route ends up authenticating twice, by two different rules - pick either one.
[Details&nbsp;›](/backend/edge-middleware#so-where-do-i-add-my-auth)

#### Is `api/use.ts` the same as Express's `app.use()`?
No - it runs **per route, not per request**. Global middleware is composed into each route's chain,
so a request matching no route never reaches it, and it never sees requests outside this folder's `backend.base`.
For work that must happen on every request regardless of routing,
use the framework's own app instance in `api/app.ts`, where `appFactory`'s callback hands you `{ app }`.
[Details&nbsp;›](/backend/middleware)

#### Can a route override or skip global middleware?
Only if the global entry declares a `slot`. A route (or a cascading `use.ts`) declaring the same slot substitutes it -
and the replacement runs **in the global one's position** in the chain, so surrounding order is preserved.
A global middleware **without** a slot always runs and cannot be overridden or skipped, which is what you want for a security check.
[Details&nbsp;›](/backend/middleware#slot-composition)

#### How does the onion model work?
Middleware runs in definition order going in, then unwinds in reverse after the handler.
Global `api/use.ts` runs first, then route-level `use`, then the handler, then back out.
[Details&nbsp;›](/backend/middleware#execution-order-onion-model)

#### Why do `use` calls run before handlers regardless of array position?
This is intentional, not a quirk of how you order the array. `use` registers middleware
and the method builders (`GET`, `POST`, ...) register handlers;
the framework always runs the middleware chain first, then the matched handler -
so a `use` written after a handler in the array still runs before it.
If you need logic to run *after* the handler, put it after `await next()` inside a middleware:
code before `await next()` runs on the way in, code after it runs on the way back out (the onion model).
[Details&nbsp;›](/backend/middleware#execution-order-onion-model)

#### How do I restrict middleware to specific methods?
Pass the `on` option to `use`, listing the methods the middleware should run for.
Handlers for other methods skip it:
```ts
use(async (ctx, next) => {
  ctx.state.user = await verifyToken(ctx.headers.authorization);
  return next();
}, { on: ["POST", "PUT", "DELETE"] })
```
The same `on` option works in cascading `use.ts` files.
[Details&nbsp;›](/backend/middleware#method-specific-middleware)

#### What are middleware slots?
Named positions in the middleware chain - middleware with the same slot name
replaces earlier middleware at that position, letting you override global defaults per-route
without bypassing everything else.
[Details&nbsp;›](/backend/middleware#slot-composition)

#### How do I register a custom slot name?
Extend the `UseSlots` interface in `api/env.d.ts`, then use `{ slot: "yourName" }` anywhere.
[Details&nbsp;›](/backend/middleware#slot-composition)

#### When I override via slot, does `on` inherit from what I'm replacing?
No - `on` doesn't inherit; set it explicitly if needed.
[Details&nbsp;›](/backend/middleware#slot-composition)

#### How do `use.ts` files wrap subtrees?
Place `use.ts` in a folder and it automatically wraps all routes in that folder and its subfolders -
no imports or wiring. `api/users/use.ts` wraps everything under `/api/users`;
`api/users/account/use.ts` wraps only `/api/users/account`.
[Details&nbsp;›](/backend/cascading-middleware#how-it-works)

#### What's the execution order across levels?
Global `api/use.ts` -> parent folder `use.ts` -> current folder `use.ts` -> route handler.
Parent always runs before child; children cannot skip parent middleware.
[Details&nbsp;›](/backend/cascading-middleware#how-it-works)

#### What is `UseT`?
A type every folder-level `use.ts` exports (even when empty) describing
what the middleware adds to context. These are merged so every route underneath
is typed automatically - no imports, no type args on `defineRoute`.
Inner definitions override outer ones, mirroring runtime.
[Details&nbsp;›](/backend/cascading-middleware#type-safe-context-extension)

#### How do I extend `UseT` from a parent?
Import the parent's `UseT`, intersect it, and re-export -
avoiding duplicate definitions across the hierarchy.
[Details&nbsp;›](/backend/cascading-middleware#type-safe-context-extension)

#### Why can some params be undefined in cascading middleware?
A `use.ts` runs for every route in its subtree, including ones that don't define a given param -
so the `id` param is present for `/users/[id]` but undefined for the `/users` route
under the same `use.ts`. That's expected, not a bug. Keep cascading middleware generic -
auth, logging, rate limiting; put param-specific logic in the route handler,
where the param is guaranteed to exist.
[Details&nbsp;›](/backend/cascading-middleware#parameter-availability)

#### How do I implement auth / logging / rate limiting?
However your framework already does it - KosmoJS imposes nothing here and stays fully transparent.
Any Hono/H3/Koa middleware package works unchanged, wired the native way for your framework.
You can wire it directly in a route's `index.ts` via `use(...)`, or in a folder-level `use.ts` to cascade it over a subtree.
Nothing is KosmoJS-specific about the middleware itself; it's plain Hono/H3/Koa.
[Details&nbsp;›](/backend/cascading-middleware#common-use-cases)

### Backend: Error Handling

#### Where is the default error handler?
`api/errors.ts`, seeded per source folder - a regular file you can customize freely.
[Details&nbsp;›](/backend/error-handling#default-error-handler)

#### How do I distinguish a ValidationError?
`error instanceof ValidationError` (from `@kosmojs/core/errors`) -> respond 400 with field detail;
otherwise use `error.statusCode || 500`.
[Details&nbsp;›](/backend/error-handling#default-error-handler)

#### How do I do route-level error overrides?
The default error handler lives in `api/errors.ts`, the same across all frameworks.
The approach is uniform too: branch on the request path or context.
[Details&nbsp;›](/backend/error-handling)

#### Why shouldn't I wrap handler logic in try-catch?
Let errors propagate to the central error handler instead of swallowing them per-route.
[Details&nbsp;›](/backend/error-handling#let-handlers-fail)

### Validation

#### What is runtype validation?
TypeScript types are automatically converted to JSON Schema and validated at runtime -
no separate schema language, no schemas drifting out of sync.
One type definition is the source of truth for server validation,
client (fetch) validation, and the OpenAPI spec.
[Details&nbsp;›](/validation/intro#understanding-runtype-validation)

#### How does one type give both compile-time and runtime safety?
The same definition that gives compile-time checking (autocomplete, refactor safety)
also produces the runtime validator that runs when real requests arrive -
closing the gap TypeScript can't cover at runtime.
[Details&nbsp;›](/validation/intro#understanding-runtype-validation)

#### How are validators derived?
AST parsing (via ts-morph / TFusion) extracts types and traces referenced files;
AOT compilation produces high-performance validators in `lib` via TypeBox -
direct property checks, not a generic JSON Schema interpreter.
[Details&nbsp;›](/validation/intro#how-derivation-works)

#### Why is double (client + server) validation a performance gain, not a cost?
Invalid requests are caught client-side before they leave the browser,
saving bandwidth/compute and giving users instant feedback;
server validation still runs for direct API calls.
[Details&nbsp;›](/validation/intro#end-to-end-validation)

#### How do I refine params?
Pass a tuple as the second type argument to `defineRoute`;
each position maps to a param in path order (e.g. `<"users/[id]", [number]>`).
A request to `/api/users/abc` is rejected with 400 before the handler runs.
Refinements are positional, not name-based - renaming `[id]` to `[userId]` needs no change here.
[Details&nbsp;›](/validation/params#params-refinements)

#### If URL params are strings, how does a `number` param validate?
KosmoJS coerces the value before validation: type a param as `number` and `"123"` becomes `123`,
while a non-numeric `"abc"` stays a string and fails the check with a clean 400.
So you write `number` (or a numeric `VRefine`) and read a real number from `ctx.validated.params`, no manual coercing.
[Details&nbsp;›](/validation/params#params-refinements)

#### Why must the params tuple be written inline?
A pre-defined tuple *alias* loses the structural info needed to emit a schema.
Individual type aliases used *inside* the inline tuple are fine -
it's only extracting the whole tuple to a named type that breaks.
[Details&nbsp;›](/validation/params#params-refinements)

#### What validation targets exist?
Metadata (any method): `query`, `headers`, `cookies`. Body (POST/PUT/PATCH): `json`, `form`, `raw`.
`form` covers both URL-encoded and multipart form data (so file uploads go here);
`raw` accepts plain text, binary data, `Buffer`, `ArrayBuffer`, or `Blob`.
[Details&nbsp;›](/validation/payload#validation-targets)

#### Can validation targets hold numbers?
Only the `query` target will coerce numbers before validation:

```ts
GET<{ query: { page: number } }>((ctx) => {
  const { page } = ctx.validated.query // page is a number
});
```

`headers`/`cookies`/`form`/`raw` never coerce numbers.

::: warning will never pass validation
`POST<{ form: { age: number } }>`
:::

`json` carries numbers natively, no coercion needed.
[Details&nbsp;›](/validation/payload#validation-targets)

#### Can validation targets hold booleans?
Only the `query` target will coerce booleans before validation - `"true"`/`"false"` become `true`/`false`:

```ts
GET<{ query: { draft?: boolean } }>((ctx) => {
  const { draft } = ctx.validated.query // draft is a boolean (or undefined)
});
```

`params` (path segments, where a boolean is meaningless), `headers`/`cookies`/`form`/`raw` never coerce booleans.

::: warning will never pass validation
`POST<{ form: { consented: boolean } }>`
:::

`json` carries booleans natively, no coercion needed.

For a non-`query` target, use a string union instead:
```ts
POST<{ form: { consented: "true" | "false" | "on" | "off" } }>
```

#### Why one body target but multiple metadata targets?
Body targets are mutually exclusive (one per handler - you can't have both `json` and `form`);
metadata targets can be combined freely. A body target on GET, or two body targets,
is flagged at dev time and the affected schema is disabled.
[Details&nbsp;›](/validation/payload#validation-targets)

#### How do I handle file uploads?
Use the `form` body target on a POST/PUT/PATCH handler - it accepts multipart form data,
so the uploaded file and any accompanying text fields are validated together as one payload.
Type the file field alongside the metadata fields (e.g. `form: { file: ..., title: string }`),
and the parsed result is available on `ctx.validated.form` like any other validated body.
[Details&nbsp;›](/validation/payload#validation-targets)

#### How do I validate responses, and why bother?
The `response` property as a positional tuple: `[status, contentType, Schema]`,
e.g. `[200, "json", User]`.
It validates before sending (catching handlers that return incomplete objects
or drifted DB/third-party shapes) and enables automatic OpenAPI derivation.
[Details&nbsp;›](/validation/response)

#### Does response validation run in production?
Not by default: in production, response validation is disabled by default.
To enable, set `runtimeValidation: true` on the response target.
There is no global switch: each handler enables its own response validation.
[Details&nbsp;›](/validation/response#development-vs-production)

#### Can I use referenced types and generics?
Fully supported - import shared types, use generic wrappers like `Payload<User>`.
Generics are resolved and every referenced type traced,
and rebuilds the schema when a shared type changes.
[Details&nbsp;›](/validation/payload#referenced-types)

#### Inline object type vs `Payload<T>` for the `json` target - are they equivalent?
Yes. An inline literal (`json: { email: VRefine<string,{format:"email"}> }`)
and a named wrapper (`json: Payload<CreateUser>`) express the same thing -
the validated body schema. Use inline for one-off shapes and a named type to reuse a domain model.
[Details&nbsp;›](/validation/payload#referenced-types)

#### What is VRefine?
It adds JSON Schema constraints to the target type - globally available, no import.
`VRefine<number, { minimum: 1, multipleOf: 1 }>`. The first argument is the base type,
the second is any valid JSON Schema validation keyword.
[Details&nbsp;›](/validation/refine)

#### Which constraints apply where?

- Strings: `minLength`, `maxLength`, `pattern`, `format`
- Numbers: `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `multipleOf`
- Arrays: `minItems`, `maxItems`, `uniqueItems`.

The second VRefine argument accepts any valid JSON Schema validation keyword,
so the underlying keyword family is broader than the constraints listed here.
[Details&nbsp;›](/validation/refine)

#### Why does `number` allow decimals, and how do I get integers?
Plain `number` permits floats. Use `multipleOf: 1` for true integers -
critical for DB IDs, where a float passes validation but gets rejected at the query level,
turning a clear validation error into a confusing DB error.
[Details&nbsp;›](/validation/refine)

#### How do I validate emails / date-times / patterns?
`format: "email"`, `format: "date-time"`, or a `pattern` regex via VRefine.
[Details&nbsp;›](/validation/refine)

#### What does a ValidationError expose?
`target` (which request part failed: `params`/`query`/`headers`/`cookies`/`json`/`form`/`raw`/`response`),
`errors` (array of `ValidationErrorEntry` with `keyword`/`path`/`message`/`params`/`code`),
`errorMessage` (all errors as one string), `errorSummary` (e.g. "2 validation errors found across 2 fields"),
`route`, and `data` (the data that failed).
[Details&nbsp;›](/validation/error-handling#validationerror-properties)

#### How do I surface field-level form errors?
Map `error.errors` to `{path, message}` pairs; `target` tells you which request part failed.
Nested field paths use arrow notation (`customer > address > city`) -
match them with word-boundary regex to avoid false positives.
[Details&nbsp;›](/validation/error-handling#validationerror-properties)

#### How do I set custom per-field error messages?
The second type argument to the handler accepts a per-target message set:
an `error` fallback plus `"error.fieldName"` overrides (dot notation for nested fields,
e.g. `"error.order.shipping.address.postalCode"`).
KosmoJS picks the most specific message; it appears in each entry's `message`.
[Details&nbsp;›](/validation/error-handling#custom-error-messages)

#### Why must I avoid built-in type names?
Names like `Event`, `Response`, `Request`, `Error`, `Date`, `Partial`, `Record`, `Buffer`
are referenced as-is during type flattening, so the validator sees the built-in,
not your custom type - a silent runtime failure with no compile error.
Use a consistent `T` suffix/prefix (`EventT`, `TResponse`).
The full list is in the TFusion builtins reference.
[Details&nbsp;›](/validation/naming-conventions#why-this-matters)

#### How do I skip runtime validation but keep types?
Per-target `runtimeValidation: false` in the second type argument (works for payload and response).
You then read the body via the bodyparser directly.

Param validation cannot be skipped - params are part of the URL structure.

For response targets the same flag is also the production opt-in:
response validation only runs in production when set to `true`.

Use sparingly: runtime validation is what catches mismatched DB responses,
unexpected payloads, and API drift.
[Details&nbsp;›](/validation/skip-validation)

#### Can I replace the default validator with my own?
Yes - every target is middleware in a reserved slot, so claiming that slot runs your check instead:
`validate:params`, `validate:query`, `validate:headers`, `validate:cookies`,
`validate:json`, `validate:form`, `validate:raw`, `validate:response`.
Declare it globally in `api/use.ts`, in a cascading `use.ts` for a subtree,
or in the route itself for one endpoint. Reserved slots need no `UseSlots` declaration.
[Details&nbsp;›](/backend/middleware#overriding-validation)

#### If I override one target, do the others still validate?
Yes - slots are per target. Overriding `validate:json` replaces the JSON validator and nothing else;
`ctx.validated.params`, `.query`, `.headers` and `.cookies` are still filled in by their own validators.
[Details&nbsp;›](/backend/middleware#what-you-take-over)

#### What do I lose by overriding a validator?
That target's entry in `ctx.validated`. The built-in validator loads the data,
checks it and publishes the result; yours is only expected to check -
so `ctx.validated.json` stays unset and the handler reads the body itself.
Which costs nothing: `ctx.bodyparser.<target>()` and `ctx.metaparser.<target>()` are lazy loaded and cached,
so your validator and your handler can both call them and the request stream is read once either way.
[Details&nbsp;›](/backend/middleware#what-you-take-over)

#### `runtimeValidation: false` or a custom validator - which do I want?
`runtimeValidation: false` turns checking off for that target and keeps the types.
A slotted validator keeps checking, on your terms - the way in for a body format no schema describes,
or a check that has to hit the database.
[Details&nbsp;›](/backend/middleware#overriding-validation)

### Type Safety

#### What type arguments does defineRoute accept?
- RouteName (required)
- Params refinements tuple
- Types unique to this specific route
    - Variables and Bindings for Hono
    - Context for H3
    - State and Context for Koa

[Details&nbsp;›](/backend/type-safety#typing-state-context)

#### How do I type Cloudflare bindings (e.g. D1) in Hono?
The 4th type argument (`{ DB: D1Database }`) for a single route,
or `DefaultBindings` in `api/env.d.ts` globally; read via `ctx.env.DB`.
[Details&nbsp;›](/backend/type-safety#typing-state-context)

#### How do I add global context/state types?
Declare them in `api/env.d.ts` via module augmentation:
- `DefaultVariables`/`DefaultBindings` (Hono)
- `DefaultContext` (H3)
- `DefaultState`/`DefaultContext` (Koa)

[Details&nbsp;›](/backend/type-safety#global-context-types-api-env-d-ts)

#### Can I relax TypeScript strictness, e.g. `exactOptionalPropertyTypes`?
Yes, per source folder - the folder's `tsconfig.json` (`src/<folder>/tsconfig.json`)
extends the derived base config, so anything you set in its `compilerOptions` wins:

```json [src/front/tsconfig.json]
{
  "extends": "../../lib/front/tsconfig.json",
  "compilerOptions": { // [!code ++:3]
    "exactOptionalPropertyTypes": false
  }
}
```

`exactOptionalPropertyTypes: true` is the deliberate default:
validated optional params round-trip exactly as declared (`status?: T` means *absent*, not `status: undefined`),
which most codebases coming from looser configs notice immediately.
Relaxing it - or any other strictness flag - is a per-folder choice and only affects that folder's typecheck.

#### How do I typecheck?
`pnpm typecheck` - same shape as `dev` and `build`: no arguments checks every source folder,
folder names check just those (`pnpm typecheck admin front`).

Each folder is checked against its own `tsconfig.json` - that's where JSX and framework settings live.

There is no project-level typecheck because there is no project-level deliverable:
source folders are what you build and deploy, so they are also the unit of typechecking.
[Details&nbsp;›](/essentials/cli#typecheck-kosmo-typecheck)

### Fetch Clients

#### How are fetch clients derived?
Automatically for every API route, derived from the same type definitions -
change the API and the client updates, no manual sync.
Output lands in `lib` alongside validators and the OpenAPI spec.
[Details&nbsp;›](/fetch/intro)

#### How do I call a client?
`import fetchClients from "_/fetch"`, then `fetchClients["users/[id]"].GET([123])`.
[Details&nbsp;›](/fetch/start#method-signatures)

#### What's the method signature?
First argument is a params array in path order; second is the optional payload
(`{ query }`, `{ json }`, etc.). Every type is inferred from the route definition -
params, payload, and response alike.
[Details&nbsp;›](/fetch/start#method-signatures)

#### How do I call a route with no params or no payload?
No params: call with no array (`fetchClients["users"].GET()`).
Payload but no params: pass `[]` for params (`GET([], { query: {...} })`).
If the route defines no payload, the second argument isn't required.
[Details&nbsp;›](/fetch/start#routes-without-parameters-or-payloads)

#### Are requests validated before they leave the browser?
Yes - clients validate params and payload before any network request,
using the exact same TypeBox schemas as the server.
Invalid data throws immediately, no round trip.
[Details&nbsp;›](/fetch/validation)

#### What are validationSchemas, and how do I use them in forms?
Each client exposes `validationSchemas` (`params`, `json.POST`, etc.) for real-time UI feedback.
Four methods: `check(data)` (cheap boolean, safe per keystroke), `errors(data)`
(field-level array, only after `check` fails), `errorMessage(data)` (one string),
`errorSummary(data)` (brief overview). Gate the heavy three behind `check`.
[Details&nbsp;›](/fetch/validation#validation-schemas)

#### How do I do performant per-field validation as users type?
Schemas validate whole objects, so on a partially-filled form `check` fails
for *all* missing required fields, not just the one under test.
Fix: merge the field under test into a fully-valid placeholder payload
(`{ ...validPayload, name: e.target.value }`) so `check` only fails for that field.
On submit, always validate the real payload. Most forms don't need this -
it matters for complex forms validating in real time.
[Details&nbsp;›](/fetch/validation#per-field-validation-performance)

#### How do I build URLs without making a request?
`path([123])` -> `/api/users/123`; `path([123], { query: { include: "posts" } })` adds a query string;
`href("https://api.example.com", [123])` builds an absolute URL.
Multiple params follow path order.
[Details&nbsp;›](/fetch/utilities)

#### How do I distinguish ValidationError from network errors on the client?
`import fetchClients, { ValidationError } from "_/fetch"`;
`error instanceof ValidationError` means data failed validation and no request was made
(it carries `target`/`errors`/`errorMessage`/`errorSummary`);
anything else is a network or server error.
[Details&nbsp;›](/fetch/error-handling#catching-errors)

#### How does it integrate with framework data patterns?
Clients return standard promises, so they drop into SolidJS `createResource`,
React Router `loader`/`useLoaderData`, TanStack Query `queryFn`, or a `useEffect`
hook. Types flow through these abstractions automatically. Render-time patterns
(loader, resource) also run during SSR in-process; a `useEffect` fetch only runs
on the client.
[Details&nbsp;›](/fetch/integration)

#### How do I get a route's response type on the client?
You usually don't need to - awaiting a method already gives a typed result
(`const user = await fetchClients["users"].GET([123])` types `user` from the route's response).
For out-of-band typing - a `createAsync` accessor, a `useLoaderData()` result,
a prop, a shared helper - import `ResponseT` from `_/fetch`, keyed by route name then method:
`ResponseT["users"]["GET"]`.
[Details&nbsp;›](/fetch/type-safety#response-types)

#### What does a fetch client return if the handler declares no `response`?
`Promise<unknown>`. Params and payload are always typed from the route definition,
but the **return** value is opt-in: declare `response` on the handler and you get the typed result,
response validation and the OpenAPI response schema together.
`unknown` rather than `any` is deliberate - nothing was declared, so nothing is claimed.
[Details&nbsp;›](/fetch/type-safety#without-a-response-the-result-is-unknown)

#### Why is my route missing from `ResponseT`?
`ResponseT` is opt-in: an entry exists only for routes whose handler declares a `response` type.
A route with no `response` has no `ResponseT` entry - the same reason it has no response validation.
Add a `response` to the handler and the entry (and validation) appear together.
[Details&nbsp;›](/fetch/type-safety#response-types)

#### What's the response type when a handler returns multiple responses?
A handler can declare a union of responses; `ResponseT` collapses to a union of their body types,
dropping any variant with no body (no third tuple element, like a bare `[409]`).
So `[201, "json", User] | [202, "json", { queued: true }] | [409]` yields `User | { queued: true }`.
[Details&nbsp;›](/fetch/type-safety#multiple-responses)

### Frontend

#### Which frontend frameworks are supported?
React, SolidJS, Vue, Svelte, and MDX - directory routing bridges to each framework's
native router and reactive model.
[Details&nbsp;›](/essentials/frameworks)

#### How do I add a frontend or backend to an existing folder?
Add the block to the folder's `kosmo.config.ts` - `frontend: { stack: "react", base: "/front" }` -
then restart the dev server.
The framework's Vite plugin is inserted for you - don't add the plugin yourself, or it runs twice.
[Details&nbsp;›](/essentials/config#the-shape)

#### What `jsxImportSource` does each framework need?
React `"react"`, SolidJS `"solid-js"`, Vue `"vue"` (only when using JSX), MDX `"preact"`.
Mixing frameworks needs per-folder tsconfig - KosmoJS derives a `tsconfig.json`
per folder in `lib/` for your folder's `tsconfig.json` to extend from.
[Details&nbsp;›](/frontend/intro#typescript-configuration)

#### What foundation files does a source folder get?
A root App component (your app shell), a router config (`routerFactory`),
and a client entry point (`entry/client`). SSR adds a server entry.
[Details&nbsp;›](/frontend/intro#foundation-files)

#### What is routerFactory?
It wires your App + derived routes to the native router.
Its callback returns `clientRouter()` (browser navigation) and `serverRouter(url)` (SSR routing).
Derived routes are always wrapped inside your App, establishing the layout hierarchy,
and use the folder's `baseurl`.
[Details&nbsp;›](/frontend/application#router-configuration)

#### What is renderFactory?
It orchestrates `mount()` (fresh client mount) vs `hydrate()` (hydrate SSR HTML),
choosing automatically via `__KOSMO_HYDRATION_BOOL__` global var.
Referenced from `index.html` through `entry/client`.
[Details&nbsp;›](/frontend/application#application-entry)

#### Are page components lazy-loaded?
Yes - all page components are lazy-loaded by default and fetched on demand,
keeping the initial bundle small. The derived route shape differs slightly
per framework's router format.
[Details&nbsp;›](/frontend/routing#lazy-loading)

### Layouts

#### How do layout files work?
A `layout` file in any `pages/` folder wraps every route in that folder and its subfolders;
nest layouts by nesting folders. No imports or config - the file system defines the hierarchy,
and child routes cannot escape parent layouts.
[Details&nbsp;›](/frontend/layouts#define-a-layout)

#### What's the nested render order?
Outermost App -> each layout in path order -> the page. E.g. for `/dashboard/settings/profile`:
`App` -> `dashboard/layout` -> `dashboard/settings/layout` -> page.
[Details&nbsp;›](/frontend/layouts#define-a-layout)

#### What's the recognized layout filename per framework, and is it case-sensitive?
`layout.tsx` (React/SolidJS), `layout.vue` (Vue), `layout.svelte` (Svelte), `layout.mdx` (MDX) - lowercase only.
Other casings are treated as regular components.
Each folder runs one framework and ignores other frameworks' files (a Vue folder ignores `.tsx`, etc.).
[Details&nbsp;›](/frontend/layouts#layout-file-naming)

#### Why isn't my pages/layout.* file loaded?
Layout files only apply inside route folders.
A layout outside a route folder is not picked up. `pages/layout.*` files are simply ignored.
If you look for a global layout that wraps every route, that's the `src/<folder>/app.*` file.
[Details&nbsp;›](/frontend/layouts#global-layout-via-app-file)

#### What does the root app file wrap, and how is it different from a layout?
`src/<folder>/app.*` at the source-folder root wraps every route -
the place for truly global concerns (auth checks, analytics, error boundaries).
A `layout` file only works inside a route folder, wrapping the whole subtree.
Place it outside a route folder and it does nothing.
[Details&nbsp;›](/frontend/layouts#global-layout-via-app-file)

#### How does each framework render the child route?
React `<Outlet/>`, Vue `<RouterView/>`, SolidJS and MDX `props.children`, Svelte `{@render children()}`.
[Details&nbsp;›](/frontend/layouts#layout-implementation)

#### How do I load data in a layout?
Layouts are route-level, so a `layout.tsx` uses the same loader/preload a page does.
React (`loader` + `useLoaderData`), Solid (`preload` + `query`/`createAsync`),
Vue, Svelte, and MDX (all `loader` + `useLoaderData`) all load
at the layout level, fetching shared data once for everything beneath it.
For Vue, Svelte, and MDX a layout passes its path-qualified name to `useLoaderData`
(e.g. `useLoaderData("dashboard/layout")`) to read its own data rather than the
page's; React and Solid scope per route automatically.
[Details&nbsp;›](/frontend/layouts#data-loading-in-layouts)

### Navigation (typed Link)

#### How does the typed Link component work?
The `Link` component is seeded at `components/Link.{tsx,vue,svelte}` with compile-time route validation.
The `to` prop takes a typed tuple `[routeName, ...params]` (e.g. `["users/[id]", 123]`), plus an optional `query` prop.
Typing the route name triggers IntelliSense; parameterized routes require their params.
[Details&nbsp;›](/frontend/link-navigation#usage)

#### What's the refactor-safety benefit?
Renaming a route directory produces TypeScript errors at every `Link` referencing the old name -
turning refactors into an automated checklist.
[Details&nbsp;›](/frontend/link-navigation#linkprops-type)

### Data Preload

#### How does route-level preloading work per framework?

`GET` here is a method off the fetch client for the route
(`const { GET } = fetchClients["users/data"]`) - exported under the name the framework's
router expects.

- React: `export { GET as loader }` - React Router calls it before render;
`useLoaderData<ResponseT[...]>()` retrieves the typed result with no duplicate request
(runs on load, hover, navigation).

- SolidJS: wrap the fetch in `query()` and export it as `preload` - called on
hover/intent; `createAsync` calling the same `query`-wrapped function reuses the
cached result. The raw client `GET` isn't cached, so the `query()` wrapper is
what makes preload and `createAsync` share one fetch.

- Vue: `export const loader` in a plain `<script>` block (a `<script setup>`
can't hold ES exports) - the router runs it before render, and the page reads
the result with `useLoaderData()`.

- MDX: `export const loader` too - runs before render, and the page reads the
result with the `useLoaderData()` hook (`props` stays yours).

[Details&nbsp;›](/frontend/data-preload#page-integration)

#### Do I need a Suspense boundary for data fetching?
For SolidJS, yes - `createAsync` (like `createResource`) suspends, reporting pending state
to the nearest `<Suspense>` and errors to the nearest `<ErrorBoundary>`. KosmoJS
ships no boundary: the seeded `App` renders children directly, on purpose -
one app-wide `<Suspense>` is an anti-pattern (any pending fetch collapses the
whole page to a single fallback). Scope a boundary to the data component or a
subtree yourself. React, Vue, Svelte, and MDX loaders resolve before render and
don't suspend, so they need none unless you reach for something like `React.lazy`,
`use()`, or an async `<script setup>`.
Wrapping the whole app works if you accept the tradeoff - your call, not a default.
[Details&nbsp;›](/frontend/data-preload#suspense-is-your-responsibility)

### MDX

#### When should I use MDX over React/Vue/Solid/Svelte?
MDX for content-primary folders (documentation, blogs, marketing) -
rendered to static HTML with Preact, minimal client JS by default.
React/Vue/Solid/Svelte for interactivity-primary folders (dashboards, client-side state, real-time forms).
Rule of thumb: primarily content with occasional interactivity -> MDX;
primarily interactive with occasional content -> a framework.
[Details&nbsp;›](/frontend/mdx#when-to-use-mdx-vs-frameworks)

#### How do I write MDX pages?
`.mdx`/`.md` files in `pages/`, mixing markdown and JSX, with YAML frontmatter between `---` fences.
Import Preact components directly.
[Details&nbsp;›](/frontend/mdx#writing-pages)

#### Is `_/use` available in my framework?
Only in **Vue, Svelte and MDX** folders. React and SolidJS folders get no `_/use` -
use `react-router` / `@solidjs/router` hooks instead.
Vue's `_/use` exports `useLoaderData` **only**; Svelte and MDX also export `useRoute`, `useParams`, `useParamsEntries`
and `useSearchParams`, and MDX adds `useFrontmatter`.
[Details&nbsp;›](/frontend/hooks)

#### How do I access the current route inside a component?
Call the `useRoute()` hook from `_/use`. It returns the route `name`, the validated `params`,
and the page's `frontmatter` together, so a shared component (a breadcrumb, a title bar) can
read where it is without receiving props from the page. This is distinct from a framework's
own `useParams` - `useRoute()` also carries the route name and frontmatter, not just params.
[Details&nbsp;›](/frontend/mdx#route-parameters)

#### How do I fetch data in MDX?
Export a `loader` function from the page. It runs before the page renders,
through the same fetch client used elsewhere in the project.
[Details&nbsp;›](/frontend/mdx#data-fetching)

#### How do I access fetched data in MDX?
Read it with the `useLoaderData()` hook inside a component - `props` stays yours.
Because a hook must run during render, wrap the read in a small component
(`export const Msg = () => { const data = useLoaderData(); return <p>{data.msg}</p>; }`)
and place `<Msg />` in the markdown.
[Details&nbsp;›](/frontend/mdx#data-fetching)

#### How do I use route name/params inside an MDX loader?
`loader` runs before the component tree exists, so hooks (`useParams()`, `useRoute()`) aren't available there -
they only work while Preact is actually rendering a component.
Instead, `loader` receives the resolved `Route` object as its argument, including `paramsEntries` -
a `[keys, values]` tuple in the same order the route declares its parameters,
ready to pass straight to a parametrized endpoint (`GET(params)`).
[Details&nbsp;›](/frontend/mdx#loaders-with-route-parameters)

#### Why can't I write TypeScript in MDX?
MDX only supports plain JavaScript expressions.
Keep typed code (props, hooks, types) in `.tsx` files and import them into the MDX page.
[Details&nbsp;›](/frontend/mdx#common-pitfalls)

#### How do I override markdown elements globally?
The component map in `components/mdx.ts` (applied through `MDXProvider`) -
override `h1`, `pre`, links, etc. for all pages. Individual pages can still import additional components.
[Details&nbsp;›](/frontend/mdx#using-components)

#### How does frontmatter drive the head?
`title`, `description`, and a `head` array in frontmatter inject `<head>` content automatically -
the same convention as VitePress, no new syntax.
[Details&nbsp;›](/frontend/mdx#frontmatter-head-injection)

#### What are the common MDX pitfalls?
No TypeScript in MDX (keep it in `.tsx`); hooks must be called inside components,
not at module scope (`export const x = useParams()` runs on import and fails);
`loader` can't use hooks either, since it runs before the tree exists - use the `Route`
argument instead; curly braces in prose are parsed as JSX - wrap in backticks;
layouts must be `.mdx` not `.md` (`.md` can't render `{props.children}`).
[Details&nbsp;›](/frontend/mdx#common-pitfalls)

### SSR

#### Is SSR on by default?
No - folders default to client-side rendering (with Vite's dev server and HMR in dev). Enable
SSR when you create the folder (choose it in the interactive prompt, or pass `--ssr` in CLI mode),
or add it later by setting `frontend.ssr: true` in `kosmo.config.ts` and restarting dev.
[Details&nbsp;›](/frontend/server-side-render#adding-ssr-support)

#### Does SSR run in dev?
No - in dev, Vite handles all requests with HMR and CSR for immediate feedback.
SSR activates exclusively in production builds.
(This commonly surprises Next/TanStack migrators who expect dev to mirror prod rendering.)
To see server-rendered output locally, run `pnpm preview`.
[Details&nbsp;›](/frontend/server-side-render#development-experience)

#### renderToString vs renderToStream?
Both return `{ head, html }` - `renderToString` resolves `html` to a string (full page rendered before sending),
`renderToStream` resolves it to a `ReadableStream` (progressive flushing, better TTFB).
Framework folders implement both; which one runs per route is chosen by `renderMode`, not by precedence.
**Svelte and MDX are the exceptions** - both render to string only and implement no `renderToStream`.
[Details&nbsp;›](/frontend/server-side-render#server-entry-point)

#### What do the render methods receive?
Both share the same first two arguments - the requested URL plus `SSROptions`:
`template` (client `index.html` with `<!--app-html-->` placeholder),
`manifest` (Vite's dependency graph),
and `assets` (SSR assets you inject manually, each offering `kind`/`tag`/`content`/`size`,
plus an optional `path` - content-only assets like inlined scripts have no URL).
`renderToStream` also receives the stream as a third argument for custom flushing control.
[Details&nbsp;›](/frontend/server-side-render#render-factory-arguments)

#### Why must I inject SSR assets manually but not CSR assets?
CSR's index.html already carries the client asset tags.
For SSR, the server asks your renderer for `{ head, html }` and builds the document from them -
so composing assets into head is just your side of that handoff, not a Vite workaround.
[Details&nbsp;›](/frontend/server-side-render#render-factory-arguments)

#### How does streaming work across runtimes?
`renderToStream` (imported from `_/entry/server`) returns a web-standard `ReadableStream`
for every framework, so streaming behaves the same on Node, Bun, and Deno. You return the
stream as `html`; the server handles writing it into the response. Enable it per route via
`renderMode`.
[Details&nbsp;›](/frontend/server-side-render#stream-rendering)

#### How do I use a different render mode per route or group of routes?
`renderMode` in the `frontend.ssr` options controls string vs stream per route.
Every route defaults to `"string"`; set `"stream"` to stream all routes, or pass a map of glob patterns to opt in selectively.
When patterns overlap, the first match wins, so order them specific to general.
Streaming a route needs the folder's renderer to implement `renderToStream`;
**NOTE:** Svelte and MDX folders render to string only and don't accept the streaming mode.
[Details&nbsp;›](/frontend/server-side-render#selecting-the-render-mode)

#### How do I build and run the SSR bundle, and on which runtimes?
`pnpm build` produces `dist/<folder>/ssr/server.js`, and `dist/run.js` if you'd rather run every folder from one entry.
Both work with `node`, `bun`, or `deno run -A` (`... -p 4556`); Unix sockets are supported across all three (`-s /tmp/app.sock`).
They use `node:http`, natively supported by all three runtimes.
[Details&nbsp;›](/frontend/server-side-render#runtime)

#### Can I serve the SSR static assets so they don't hit the SSR server?
Yes. In-memory serving of `dist/<folder>/ssr/assets/` can't be turned off, but you can put a
reverse proxy or CDN in front to serve that folder directly, so asset requests never reach the
SSR process.
[Details&nbsp;›](/frontend/server-side-render#static-asset-handling)

#### How do I deploy behind Nginx/Caddy?
Reverse-proxy to the SSR port (or a Unix socket). The SSR bundle includes the API, so it serves
API requests on the same port seamlessly - no separate API process needed alongside it.
[Details&nbsp;›](/frontend/server-side-render#production-deployment)

#### What breaks during SSR?
Browser APIs (`window`, `document`, browser-only APIs) are unavailable server-side.
Coordinate async data so it's ready before render, plan state serialization for hydration,
and remember the hydration bundle still ships to clients (size still matters).
Use error boundaries so a server error doesn't terminate the process.
[Details&nbsp;›](/frontend/server-side-render#technical-considerations)

#### How do I fetch data during SSR?
Use your framework's render-time data path - a `loader` (React, Vue, Svelte, MDX), a
`preload` (Solid), or a Solid `createResource`/Suspense resource - and call the
fetch client inside it. During
SSR the client dispatches to the API route in-process (the API server is bundled into the SSR
bundle), so there's no network hop, just the full validation/handler chain. A fetch in
`useEffect`/`onMounted` won't run on the server - those fire only after hydration.
[Details&nbsp;›](/fetch/isomorphic-clients)

#### What happens if a fetch fails during SSR?
The SSR output is discarded and the client shell is served instead,
so the page re-renders in the browser where your own error boundaries handle the failure.
Server-side boundaries behave too differently across frameworks to rely on.
The server logs `WARN: SSR failed, fallback to CSR` along with the error.

This recovery needs an untouched response, so it covers **string-rendered** routes (the default).
A streamed route has already flushed its shell and cannot be replaced - it must handle fetch failures in the page itself.

To see these without watching logs, pass an [onError hook](/frontend/server-side-render#onerror-hook) to the renderers.

The page still works; it just isn't server-rendered any more.
If a page unexpectedly arrives as an empty shell in production, check the server log before the client.

All of this is about serving a live request. SSG has no such fallback: nobody is waiting on a build, so a page that fails there fails the build.
[Details&nbsp;›](/frontend/static-site-generation#error-handling)

#### How do I log or report SSR render errors?
Both `renderToString` and `renderToStream` accept an [onError hook](/frontend/server-side-render#onerror-hook) in `entry/server.ts`,
called with the error that ended the render. Use it to log, count, trace or alert.

It reports only - it cannot change the response or the markup. A string-rendered route still falls back to CSR,
and a streamed route's shell is still on the wire.
Don't throw from it, and keep it cheap: it runs on the request path.
It also fires during SSG pre-rendering, inside the build.
[Details&nbsp;›](/frontend/server-side-render#onerror-hook)

#### Does client-side validation run during SSR?
No - it's disabled automatically. The pre-flight check exists to avoid a round trip,
and there is no round trip during SSR, so validation runs on the API endpoint only.
[Details&nbsp;›](/fetch/isomorphic-clients#client-side-validation-is-skipped-under-ssr)

### SSG

#### What is SSG, and when do I want it over SSR?
SSG renders pages to static HTML **at build time**, so the result deploys to a CDN or any static host with no running server.
Reach for it when the content is known at build time - docs, blogs, marketing, changelogs.
Use SSR instead when a page depends on the request (a signed-in user, live data, anything per-visitor).
[Details&nbsp;›](/frontend/static-site-generation)

#### How do I enable SSG?
Choose it when creating the source folder (the interactive prompt asks, or pass `--ssg`),
or set `frontend.ssg: true` in an existing folder's `kosmo.config.ts`.

It requires **SSR enabled** on that folder - pages are rendered at build time by the folder's own SSR server -
which is why the creation prompt only offers SSG once you've chosen SSR.
[Details&nbsp;›](/frontend/static-site-generation#adding-ssg-support)

#### How does SSG handle dynamic routes?
Static routes render automatically.
A dynamic route renders once per parameter set it declares through `staticParams` - one HTML file per entry.
A dynamic route **without** `staticParams` is skipped entirely: no file is written for it.
[Details&nbsp;›](/frontend/static-site-generation#declaring-staticparams)

#### Where do I declare `staticParams`?
Wherever the framework exposes named exports from a page module - the value is the same list of positional parameter sets everywhere:

- **React / SolidJS**: `export const staticParams = defineStaticParams<"...">([...])`, importing `defineStaticParams` from `_/core`
- **Vue**: the same, in a plain `<script>` block (`<script setup>` can't hold named exports)
- **Svelte**: the same, in a `<script module>` block
- **MDX**: a `staticParams` list in the page's frontmatter

[Details&nbsp;›](/frontend/static-site-generation#declaring-staticparams)

#### How do I fetch data for pre-rendered pages?
The same `loader` (React, Vue, Svelte, MDX) or `preload` (SolidJS) export you'd use otherwise,
combined with `staticParams`: it runs **once per declared entry**,
receiving that entry's own params, and the fetched data is baked into that entry's pre-rendered HTML.

Those calls take the in-process path, inside the build: SSG starts a disposable SSR server and requests each route from it.
So the build needs the access production has - the real database, the CMS, whatever the routes read.
The usual shape is a CI workflow that ships the sources to the production environment (or a runner with the same credentials and network reach) and builds there.

A route that can't be rendered is never emitted as a client shell.
Pre-rendering carries on through the rest, then either writes the whole set or - if anything failed - writes nothing and throws a summary.
[Details&nbsp;›](/frontend/static-site-generation#error-handling)

#### Where does the SSG output go, and what do I deploy?
`dist/<folder>/ssg/` - a complete static site: one `index.html` per route, the hashed `assets/`,
and your `public/` files copied to the root.
The tree is rooted at the folder's `base`, so a folder with `base: "/admin"` is deployed at `/admin/` on the host.
Nothing in it depends on the `ssr/` or `client/` directories at serve time.
[Details&nbsp;›](/frontend/static-site-generation#output)

#### Is a 404 page included in the SSG output?
No - nothing is pre-rendered for unmatched paths, so point your host's own not-found setting at whatever it expects
(`404.html` on GitHub Pages and Netlify, `error_page` in Nginx).
[Details&nbsp;›](/frontend/error-pages)

#### How do I turn SSG off?
Set `frontend.ssg: false` in that folder's `kosmo.config.ts`.
The folder keeps rendering normally, it just stops emitting static routes.
[Details&nbsp;›](/frontend/static-site-generation)

### Build & Deployment

#### How do I build all folders vs one?
`pnpm build` (all) or `pnpm build front` (one).
[Details&nbsp;›](/dev-build-run/building-for-production)

#### How do I run the production build locally?
`pnpm preview` (all) or `pnpm preview front` (one). It builds, serves the result through `dist/run.js`,
and rebuilds on every change.
Server-rendered pages, bundled assets and the production validation policy - the real thing, not the dev server.
[Details&nbsp;›](/dev-build-run/production-preview)

#### Does preview have HMR?
No. A change triggers a full rebuild and a full page reload.
HMR patches modules in a running graph, which a production bundle doesn't have -
and a preview you can't trust is worse than none.
Use `pnpm dev` to iterate, `pnpm preview` to verify.
[Details&nbsp;›](/dev-build-run/production-preview#hot-reload-not-hmr)

#### Can I run preview and the dev server at the same time?
Yes - preview listens on `previewPort` (`4558` by default), separate from `devPort`.
[Details&nbsp;›](/dev-build-run/production-preview)

#### What's the build output layout?
`dist/run.js` (dispatcher over every folder) plus one directory per folder:
`api/` (`app.js` factory + `server.js` bundled server), `client/` (`assets/` + `index.html`),
and `ssr/` (`app.js` + `server.js` + `assets/` folder, only when SSR is enabled).
[Details&nbsp;›](/dev-build-run/building-for-production#build-output)

#### What's the simplest way to run my app in production?
`node dist/run.js -p 4556` - one process serving every source folder, dispatched by each folder's `frontend.base` and `backend.base`.
It's built on `node:http`, so `bun` and `deno run -A` work too.
[Details&nbsp;›](/dev-build-run/building-for-production#one-entry-point-for-the-whole-project)

#### Can I run a single folder's API instead?
Yes - `node dist/front/api/server.js`. For more control, use the app factory at `dist/<folder>/api/app.js`.
Useful when folders have separate lifecycles.
[Details&nbsp;›](/dev-build-run/building-for-production#running-the-api-server)

#### How do I mount the app factory per runtime?
- *Hono*: `app.fetch` is a Web Fetch handler - on Node use `getRequestListener` from `@hono/node-server`.
Deno via `Deno.serve`, Bun via `Bun.serve`.
- *H3*: `app.fetch` is a Web Fetch handler - on Node use `toNodeHandler` from `h3/node` (then createServer).
Deno via `Deno.serve`, Bun via `Bun.serve`.
- *Koa*: On Node use `app.listen()`. On Deno/Bun use `app.callback()` via a compat layer, not their native serve APIs.
[Details&nbsp;›](/dev-build-run/building-for-production#running-the-api-server)

#### Why are the API and SSR servers separate?
They're built as separate bundles so you can deploy, scale, and run them independently. But the
SSR bundle already includes the API and serves it on the same port, so an SSR deployment doesn't
need a separate API process. Running the API server on its own is only needed for CSR folders,
where there's no SSR bundle to carry it.
[Details&nbsp;›](/dev-build-run/building-for-production#build-output)

### OpenAPI

#### Does it derive OpenAPI automatically?
Yes - OpenAPI 3.1 directly from route definitions, TypeScript types, `VRefine` constraints,
parameters, and responses. No manual schema authoring or annotation layers.
[Details&nbsp;›](/openapi)

#### How do I enable and configure it?
Add an `openapi` block under `backend` in `kosmo.config.ts`. Required: `outfile`, `openapi` (e.g. `"3.1.0"`),
`info` (`title` + `version`), `servers` (each `url` + optional `description`).
Optional `info`: `summary`, `description` (markdown), `termsOfService`, `contact`, `license`.
[Details&nbsp;›](/openapi#configuration)

#### Why does one route with an optional param produce two paths?
OpenAPI requires all path params to be mandatory, so a route like `users/[id]/posts/{postId}`
emits both `/users/{id}/posts/{postId}` and `/users/{id}/posts` -
both referencing the same handlers and schemas.
[Details&nbsp;›](/openapi#derived-specification)

#### Does the spec update automatically?
Yes - it is recomputed in the background whenever you change routes, types, or schemas, alongside validation and fetch clients.
[Details&nbsp;›](/openapi#derived-specification)

#### How do I serve the spec?
Point Swagger UI, Redoc, or Stoplight Elements at the derived file.
[Details&nbsp;›](/openapi#derived-specification)

### Dev Workflow & Internals

#### What happens when the dev server starts?
Vite compiles `api/app.ts`; the dev server serves both client pages and your API routes;
requests are routed between Vite and your API; a file watcher monitors API files for changes.
[Details&nbsp;›](/dev-build-run/development-workflow#what-happens-on-start)

#### What are the api/dev.ts hooks?
`requestHandler` (returns the API request handler) and `teardownHandler`
(runs before each API reload).
[Details&nbsp;›](/dev-build-run/development-workflow#api-dev-ts)

#### How do I add custom request routing (e.g. WebSockets)?
Override `requestHandler` in `api/dev.ts` for custom dispatch, WebSocket handling,
multi-handler setups, etc.
[Details&nbsp;›](/dev-build-run/development-workflow#api-dev-ts)

#### Why are my DB connections leaking during development?
Frequent rebuilds can exhaust connections. Close connections and release resources
in `teardownHandler`, which runs before each reload.
[Details&nbsp;›](/dev-build-run/development-workflow#api-dev-ts)

#### How do I inspect registered routes and their middleware?
Pass the `debug` option to `appFactory` in `api/app.ts`:
`debug: true` prints each route's path, methods, middleware chain (by slot), and handler.
For targeted output pass one of `"headline"` / `"methods"` / `"middleware"` / `"handler"`,
or pass a function `debug(log, route)` for a custom logger - `log` carries all four parts plus `full`.
[Details&nbsp;›](/dev-build-run/development-workflow#inspecting-api-routes)

#### Why should I name my middleware functions?
Named functions print by name in the debug output; anonymous ones print only their first line,
which is much harder to read.
[Details&nbsp;›](/dev-build-run/development-workflow#inspecting-api-routes)

#### How does schema derivation performance scale?
With type complexity - simple routes are near-instant, deep hierarchies with many dependencies
take a few seconds. Derivation runs in parallel with the Vite dev server and is cached per file,
so schemas are recomputed only when the route file or a type dependency changes.
By the time you switch to the browser, the schema is ready.
[Details&nbsp;›](/validation/performance)

#### When does a slow full rebuild happen?
Deleting the `lib` folder manually, or a KosmoJS update bumping the cache version.
On large projects this can take minutes - the same category as clearing `node_modules`
or regenerating a Prisma client, not part of the normal edit-test cycle.
[Details&nbsp;›](/validation/performance#when-it-becomes-noticeable)

#### How does this compare to Zod/Yup on performance vs maintenance?
Zod/Yup have zero derivation overhead because you hand-write the schemas -
eliminating derivation time but adding ongoing maintenance and drift risk.
KosmoJS trades a few seconds of machine time for eliminating that manual work entirely.
[Details&nbsp;›](/validation/performance#machine-time-vs-human-time)

#### Where does derived code live?
In `lib`, kept out of your source directories and bundled like any other dependency
at production build time. Treat it as a build artifact - you don't need to read it.
[Details&nbsp;›](/validation/intro#how-derivation-works)

### Mental Model & Positioning

#### What is KosmoJS the equivalent of?
A meta-framework that owns routing conventions, the validation pipeline, middleware composition,
dev workflow, and build orchestration - while you keep control of backend, frontend,
state, styling, database, and deploy target.
[Details&nbsp;›](/about)

#### Is it full-stack like Next, or just router + build orchestrator?
Both sides, but with an explicit client/server boundary rather than a unified Server Components model.
You get directory routing for `api/` and `pages/`, plus typed validation, derived fetch clients,
OpenAPI, opt-in SSR, and build orchestration.
[Details&nbsp;›](/features)

#### Does it pick a frontend for me like Next?
No - you choose React, Vue, SolidJS, Svelte, or MDX per source folder, and can mix them across folders.
[Details&nbsp;›](/frontend/intro)

#### Does the Svelte support require SvelteKit?
No - KosmoJS uses only Svelte's UI layer (component compilation, `mount`/`hydrate`),
not SvelteKit. Routing, data loading, and SSR come from KosmoJS itself, so a Svelte
page uses the same `loader` export + `useLoaderData()` hook as MDX, not SvelteKit's
`load` function or `+page` files.
[Details&nbsp;›](/frontend/intro)

#### How does it compare to TanStack's "bring your own everything"?
Similar spirit on the app layer - unopinionated about state/styling/data libraries -
but it adds conventions for routing, validation, and build that TanStack leaves to you,
and it enforces type safety at runtime (derived validators), not only at compile time.
[Details&nbsp;›](/about)

#### Is it opinionated about state/styling/data fetching?
No - you keep full control. KosmoJS handles infrastructure, not your app stack.
[Details&nbsp;›](/about)

#### Does it own deployment like Next/Vercel?
No platform lock-in. It's a standard Node/Vite app -
deploy the bundled servers to Node/Bun/Deno/edge yourself.
You can still deploy to Vercel as a Node app, but there are no Vercel-specific features
(and no dependence on them).
[Details&nbsp;›](/dev-build-run/building-for-production#running-the-api-server)

#### What does it give me over Vite + React Router + Hono wired by hand?
Directory routing for both sides, derived runtime validators from TS types,
derived typed fetch clients, automatic OpenAPI, multi-folder orchestration,
and per-folder build/deploy - without the DIY glue that becomes load-bearing.
[Details&nbsp;›](/features)

#### Is it a meta-framework or monorepo tooling?
A meta-framework using source folders - monorepo structure and independence without workspaces,
package boundaries, internal dependency graphs, or build-cache configs.
[Details&nbsp;›](/about)

### Routing

#### What's the equivalent of Next's `app/page.tsx`?
A folder with an `index` file: `pages/users/[id]/index.tsx` -> `/users/:id`.
(TanStack file-based plugin users: same idea, folder-driven.)
[Details&nbsp;›](/routing/intro#how-it-works)

#### Why folders-with-`index` instead of `page.tsx`?
Only `index` is the route; siblings are colocated helpers - unambiguous at scale.
[Details&nbsp;›](/routing/rationale)

#### How do params map to Next's / TanStack's?

- `[id]` <-> Next `[id]` / TanStack `$id` (required)
- `{id}` <-> optional
- `{...path}` <-> Next `[...slug]` (splat/catch-all)

Different sigils, same concepts.
[Details&nbsp;›](/routing/params)

#### Catch-all / optional catch-all (`[[...slug]]`)?
Splat `{...path}` covers both. It matches any number of segments including zero,
so it behaves like Next's optional catch-all `[[...slug]]` - `docs/{...path}` matches `/docs`
as well as `/docs/a/b/c`. There's no separate required-vs-optional catch-all distinction to manage.
[Details&nbsp;›](/routing/params#splat-parameters)

#### Type-safe params like TanStack Router?
Yes - refine params via the inline tuple type arg to `defineRoute`;
`ctx.validated.params` carries the refined type, validated at runtime
(stronger than TanStack's compile-time-only route typing,
which doesn't validate request bodies by itself).
[Details&nbsp;›](/backend/type-safety#typing-params)

#### Where's the central route tree (TanStack `routeTree.gen.ts`) / route config object?
There isn't one you register. Routing is filesystem-driven;
route configs are derived per source folder into `lib/` for the native router to consume.
Treat derived code as a build artifact.
[Details&nbsp;›](/frontend/routing#routes)

#### Route groups like Next's `(group)`?
There's no route-group syntax, and it isn't needed. Next's `(group)` is a lightweight way
to organize routes without affecting the URL - a workaround for separating concerns inside one app.
KosmoJS separates concerns at a higher level: source folders are independent apps
with their own framework, base URL, middleware, and build,
so the separation route groups gesture at is structural here, not a naming convention.
[Details&nbsp;›](/routing/intro)

#### Parallel / intercepting routes (`@slot`, `(.)`)?
These are Next App Router features with no KosmoJS equivalent.

Parallel routes (`@slot`) render several independent pages into named slots of the same layout at once -
e.g. a dashboard showing a feed and an analytics panel side by side,
each with its own loading and error state.

Intercepting routes (`(.)`, `(..)`) show a route in a different context depending on how you arrive:
the classic case is clicking a photo to open it in a modal over the current page,
while loading the same URL directly renders the full photo page.

KosmoJS has neither convention - it maps one folder to one route.
You'd build the same UX with your framework's own tools:
render multiple components in a layout and fetch their data independently for the parallel case,
and use client-side modal state (or your router's modal patterns) for the intercepting case.
[Details&nbsp;›](/routing/intro)

#### Nested layouts vs Next `layout.tsx` / TanStack `_layout`?
Same idea - a `layout` file wraps its folder and subfolders, nesting by folders,
rendered outward-in via `<Outlet/>` (React), `<RouterView/>` (Vue), `props.children` (Solid/MDX), or `{@render children()}` (Svelte).
[Details&nbsp;›](/frontend/layouts#define-a-layout)

#### Do layouts persist state across navigation like App Router?
Yes, in the normal case. When you navigate between sibling routes under the same layout,
only the child swaps in - the layout component stays mounted,
so it doesn't re-render and its state is preserved.
This is the standard behavior of the underlying routers (React Router, Vue Router, Solid Router)
that KosmoJS registers routes with. A layout only remounts when navigation moves outside its subtree.
[Details&nbsp;›](/frontend/layouts)

#### `loading.tsx` / `error.tsx` / `not-found.tsx`?
There are no per-route special files for these, because they're handled with each framework's
own primitives rather than a KosmoJS file convention.

Global loading, suspense, and error boundaries live at the `app.*` level,
using the native principles of your chosen framework.

Not-found has a built-in: a `pages/404.*` component is rendered for unmatched routes.
Backend errors are separate - they centralize in `api/errors.ts`.
[Details&nbsp;›](/frontend/layouts#global-layout-via-app-file)

#### `beforeLoad` / search-param validation hook?
KosmoJS doesn't add a proprietary `beforeLoad`-style hook - it leaves your framework's
primitives untouched, so you use the native pattern directly:

- React Router's `loader`
- Solid Router's `preload`
- Vue's `loader` export for data; Vue Router's navigation guards remain available
for pre-load checks and redirects

For the data contract itself, search params are validated via the `query` target
on handlers (with VRefine constraints) and surfaced through the derived,
client-side-validating fetch clients.
[Details&nbsp;›](/frontend/data-preload#page-integration)

#### Typed/validated search params like TanStack search schemas?
Not implemented yet - it's a considered feature.
KosmoJS validates query params on the API contract
(the `query` target gives full types and constraints, surfaced through the fetch clients),
but there's no router-level `validateSearch` that types `useSearch()` on the *page route*
the way TanStack does - query typing centers on the API/fetch boundary,
not page-route search state. For now, read and parse search params with your framework's native router.
[Details&nbsp;›](/validation/payload#validation-targets)

### Data Fetching

#### React Server Components / `"use server"` boundary?
No RSC, and no `"use client"`/`"use server"` directive boundary - by design, not omission.
KosmoJS keeps the battle-tested industry standard: server code in `api/`,
client code in `pages/`, and a plain HTTP API between them with typed fetch clients across the wire.
There's no interleaving of server and client code in one file and no new mental model to learn -
the boundary is the network call. Boring, as in 2015 - and boring is a feature here. And with
the isomorphic fetch client that boundary costs nothing on the server: during SSR the call runs
in-process, so there's no network layer at all.
[Details&nbsp;›](/frontend/intro)

#### How about server functions?
There aren't any, and you don't need them. A server function exists to run server-only code from
the client without hand-writing an endpoint; KosmoJS gives you that through the API route plus its
derived typed client. The same client is isomorphic - during SSR it calls the route in-process
(no network hop), on the client it's a same-origin request - so one typed call covers both sides
without a separate server-function primitive.
[Details&nbsp;›](/fetch/isomorphic-clients)

#### Can a page fetch from the database server-side without an API hop?
Not the RSC way - data flows through the API layer, not direct DB access in the page.
But during SSR that isn't a network hop: the isomorphic fetch client dispatches to the
API route in-process (no socket), so you get the API boundary without the round-trip cost.
The de-facto model is API routes + fetch clients + framework loader.
[Details&nbsp;›](/fetch/isomorphic-clients)

#### Loaders like TanStack Start/Router?
Yes, every framework uses own pattern - `export loader` on React / Vue / Svelte / MDX, `export preload` on SolidJS.
The loader is simply your fetch client's method exported as `loader`/`preload`,
so the typed response flows into `useLoaderData`/`createAsync`.
[Details&nbsp;›](/frontend/data-preload#page-integration)

#### Is there loader caching / staleness / `loaderDeps`?
No built-in loader cache - React/Solid reuse the in-flight/cached result for that navigation;
SolidJS `preload` results are cached/reused by `createAsync`.
For real caching, enable TanStack Query (a first-class option).
[Details&nbsp;›](/frontend/tanstack-query)

#### How do I enable TanStack Query?
Turn it on when you create the source folder - interactive mode asks,
or pass `--tsq` non-interactively (`pnpm folder front --frontend react --tsq`).

To add it later, set `tanstack` in the `frontend` block of `kosmo.config.ts`
(`frontend: { tanstack: { query: true } }`).

Once it's on, everything is wired - no setup, no provider to place - you just start using it in your components.
[Details&nbsp;›](/frontend/tanstack-query#enabling-and-using-it)

#### How do I read data with TanStack Query once it's enabled?
Just write the read: `useQuery` against a fetch client (`queryKey` + `queryFn: () => GET([id])`) in a component.
Frameworks differ only at the hook: React and Vue take the options object directly;
Solid and Svelte take a thunk (`() => (...)`) to stay reactive;
and Svelte's hook is `createQuery`, not `useQuery`.
[Details&nbsp;›](/frontend/tanstack-query#basic-usage)

#### How do I warm TanStack Query on the server (SSR)?
To render a page's data on the server and hydrate it warm, you wire it yourself with TanStack's own primitives -
`dehydrate` on the server, `HydrationBoundary`/`hydrate` on the client - following your framework's official SSR guide.

The one KosmoJS-specific detail: get the request-scoped client from `getQueryClient()` in your loader,
so you prefetch into the same client the render reads, and share one query-options
helper between loader and component so the `queryKey` matches.

(Solid needs no boundary - its `generateHydrationScript()` carries the cache automatically.)
[Details&nbsp;›](/frontend/tanstack-query#ssr-warmup-advanced)

#### How do I do mutations with TanStack Query?
Exactly as TanStack documents - no KosmoJS-specific wiring.
`mutationFn` calls the fetch client's `POST`/`PUT`/etc.,
and `queryClient.invalidateQueries({ queryKey })` in `onSuccess` refetches the affected queries in place -
the thing a loader alone can't do without re-navigating.
Mutations are client-side, so SSR doesn't affect them.
[Details&nbsp;›](/frontend/tanstack-query#mutations-and-invalidation)

#### How do I get a Query client, or configure one?
`_/query` provides two exports: `getQueryClient()` and `createQueryClient(options)`.

Use `createQueryClient(options)` when you need a custom staleTime, retry policy, etc.
Create the custom client in your `app.{tsx,vue,svelte}` and provide it as a prop to `AppProvider`.
[Details&nbsp;›](/frontend/tanstack-query#configuring-a-custom-client)

#### Does SSR data fetching work without extra plumbing?
Yes - the fetch client is isomorphic.

During SSR a render-time fetch (a `loader` or `createAsync`) dispatches to the API route in-process,
and the framework's own hydration carries the result to the client:
every framework reuses the server-rendered data without re-fetching.

React and Solid do it through their built-in hydration;
Vue, Svelte, and MDX serialize the loader result into the page
and read it on the client before the loader would fetch.
You don't wire dehydrate/hydrate for that.

TanStack Query is an optional opt-in layer - if you enable it and want its cache serialized across SSR,
that plumbing is on you (via TanStack's own dehydrate/hydrate),
but it isn't required for fetch-client data to survive hydration.
[Details&nbsp;›](/fetch/isomorphic-clients)

#### fetch caching / `revalidatePath` / `revalidateTag` / ISR?
No fetch cache extensions, no tag/path revalidation, no ISR. Cache at the CDN/proxy layer;
SSG is full static generation. After a mutation, refetch or invalidate your own client cache.
[Details&nbsp;›](/openapi)

#### Preload on link hover/intent - which frameworks?
React `loader` runs on load/hover/navigation; SolidJS `preload` runs on hover/intent
(cached by `query`/`createAsync`); Vue, Svelte, and MDX run their `loader` before render.
Loader (React/Vue/Svelte/MDX) and preload (SolidJS) make data ready before render, eliminating route-level spinners.
[Details&nbsp;›](/frontend/data-preload#how-it-works)

### Server Actions / Mutations / RPC

#### Server Actions (`"use server"`) / Start server functions (`createServerFn`)?
No server actions and no RPC-style server functions.
Do mutations by defining a normal API route (`POST`/`PUT`/`DELETE`)
and calling its derived typed client, validated client-side first.
(There's no progressive-enhancement no-JS form submit as a first-class feature,
and no `useFormState`/`useActionState` equivalent -
use your framework's form state plus the client's `validationSchemas` for field errors.)
[Details&nbsp;›](/fetch/start#method-signatures)

#### End-to-end RPC type safety like tRPC?
Effectively yes via fetch clients - params, payload, and response types derive from the same route definition,
with client-side validation before the request.
The difference: it's route-based (path keys + HTTP methods) rather than procedure-based,
and backed by derived TypeBox validators plus automatic OpenAPI.
[Details&nbsp;›](/fetch/intro)

#### Client-side input validation like a tRPC input schema?
Yes - the client validates params/payload before sending, using the same server schemas,
so client-valid and server-accepted stay in sync.
[Details&nbsp;›](/fetch/validation#validation-schemas)

### Backend / API

#### Next Route Handlers (`route.ts`) / Start `createAPIFileRoute` equivalent?
`defineRoute` returning an array of method handlers in `api/.../index.ts` - same idea,
plus validation and a fetch client for free. You don't write `Response.json()`.
There's no `NextRequest`/`NextResponse` - it's the native Hono/H3/Koa context.
[Details&nbsp;›](/backend/intro#defining-endpoints)

#### Why an array instead of named method exports?
The factory yields method builders + `use`; returning an array lets you compose middleware
and methods together with shared types.
[Details&nbsp;›](/backend/intro#defining-endpoints)

#### Run on the edge / Cloudflare / Deno / Bun?
With Hono and H3 the API runs on Node/Deno/Bun/Cloudflare Workers and edge platforms unchanged (`app.fetch`).
Koa runs via the `node:http` compat layer. There's no automatic serverless/edge function packaging like Next -
you run the bundled server or wire `app.fetch` into an edge runtime yourself.
[Details&nbsp;›](/dev-build-run/building-for-production#running-the-api-server)

#### Edge middleware (`middleware.ts`) vs cascading `use.ts`?
There's no global edge-middleware file or client-route interception layer.
API middleware is per-subtree via auto-wrapping `use.ts` plus slots;
to gate a subtree behind auth, drop a `use.ts` in its folder (typed context via `UseT`).
For the client side, use the global `App.*` wrapper or a layout.
[Details&nbsp;›](/backend/cascading-middleware#how-it-works)

#### Bring Hono ecosystem middleware?
Yes - e.g. `hono-rate-limiter` is shown wired through `use`.
There's no bundled auth (no NextAuth integration) - wire your own in middleware:
verify token, set `ctx.state.user` / `ctx.set("user")`.
[Details&nbsp;›](/backend/cascading-middleware#common-use-cases)

#### Typed env/bindings (e.g. D1)?
Hono bindings are typed via `defineRoute`'s 4th type arg or `DefaultBindings` in `api/env.d.ts`
(e.g. `DB: D1Database`), read via `ctx.env.DB`.
[Details&nbsp;›](/backend/type-safety#typing-state-context)

### Validation & Types

#### Does it use Zod like TanStack often does?
No - "runtype" validation: TS types -> JSON Schema -> TypeBox validators, derived automatically.
You write TS types once; validators are derived, eliminating hand-written schemas
and type/schema drift. One source of truth drives compile-time types, runtime validation,
client validation, and OpenAPI.
[Details&nbsp;›](/validation/intro#understanding-runtype-validation)

#### Do I lose flexibility without Zod?
Constraints come via `VRefine` (JSON Schema keywords like `minLength`, `pattern`,
`format`, `minimum`, `multipleOf`, `minItems`);
for trusted endpoints set `runtimeValidation: false` to keep types only.
The fetch clients validate with the exact server schemas,
so client and server stay in sync with nothing to keep aligned by hand.
[Details&nbsp;›](/validation/skip-validation)

#### Can I alias the types used in a `VRefine` constraint, a params tuple or a response tuple?
The contents, yes. The wrapping brackets, no.

**The rule: `[]` and `{}` must be written literally; anything inside them can be aliased**,
local or imported. So `VRefine<string, { pattern: Pattern }>`,
`defineRoute<"users/[id]", [UserID]>` and `response: [200, "json", User]` are all fine -
but hiding the brackets themselves (`defineRoute<"users/[id]", Params>`, `response: ResponseT`) is not.

Those positions are read structurally from the source - which tuple slot is which parameter,
which slot is the status versus the body - so an alias gives it an identifier where it expected a shape.
Both forms typecheck; the failure is silent.
`VRefine`'s base type (first argument) is unrestricted either way.
[Details&nbsp;›](/validation/refine#keep-the-wrapping-brackets-literal)

#### Is type safety runtime-enforced or compile-only?
Both - the same TS type drives compile-time checks and derived runtime validators.
This is stronger than TanStack's compile-time route typing,
which doesn't validate request bodies on its own.
[Details&nbsp;›](/validation/intro#understanding-runtype-validation)

#### Why is there a codegen/generation step at all?
Validators are AOT-compiled from types (TanStack users used to instant route typing
should expect a brief generation pass, cached per file, running alongside Vite).
A slow full rebuild only happens when you delete `lib/` or a cache-version bump occurs -
akin to regenerating `routeTree.gen.ts` from scratch, but heavier.
Treat derived code as a build artifact, like the generated route tree.
[Details&nbsp;›](/validation/performance#machine-time-vs-human-time)

#### Isn't generated code a red flag?
Usually, yes - but the bad reputation belongs to *scaffolding*: code generated once that
you then edit and own, so it drifts from its input.
KosmoJS's `lib/` output is *derivation* - recomputed from a single source on every change, never edited,
in the same category as what `tsc`, the JSX transform and Vite already generate for you.
The `src/` boilerplate it does seed is written **only into blank files**,
so re-seeding can never overwrite your work.
And nothing generated is proprietary: `lib/` holds ordinary Hono/React/TypeBox code you could walk away with.
[Details&nbsp;›](/essentials/why-codegen)

#### Is derived code committed to git?
Mostly no. `lib/.gitignore` ignores everything except `cache.json` and `types.ts`,
so derived output is treated as a build artifact. What *is* committed is the per-route
derivation cache (`cache.json`, keyed by content hashes of the route and its type dependencies)
so a fresh clone or CI run skips a full rebuild.
Don't add `lib/` to the root `.gitignore` - that would drop the cache and make every clone slow.
[Details&nbsp;›](/essentials/project-structure#inside-lib)

### Rendering & SSR

#### What decides whether a folder renders on the server or the client?
You do, per folder - set `frontend.ssr` (or pass `--ssr` at creation),
and that folder's production build renders on the server.
A project can mix freely: an SSR marketing folder next to a CSR app folder.

Dev is the exception, and not a choice: `pnpm dev` is always Vite with HMR and client-side rendering,
whatever the folder is configured for. The SSR path is exercised by kosmo preview and in production.
To see server-rendered output during dev, run `pnpm preview`.
[Details&nbsp;›](/frontend/server-side-render#adding-ssr-support)

#### ISR / on-demand revalidation / PPR?
No ISR/revalidation and no partial prerendering.
[Details&nbsp;›](/frontend/server-side-render)

#### SSG / static export vs `output: export`?
Closest equivalent, and it works on every frontend: each route renders to static HTML at build time
(`staticParams` supplying the entries for dynamic routes), output to `dist/<folder>/ssg/`.
An MDX folder additionally gets frontmatter-driven head, layouts and typed nav - comparable to Next + MDX/Contentlayer, but built in.
[Details&nbsp;›](#ssg) · [Migration&nbsp;Tips&nbsp;›](/essentials/migration-tips)

#### Can I use SSG with React, Vue, SolidJS or Svelte?
Yes - SSG works with any frontend. The folder needs SSR enabled, since pages are rendered at build time by its own SSR server.
[Details&nbsp;›](#ssg)

#### Islands / partial hydration?
Not offered as a named feature. MDX delivers minimal client JS by default and hydrates;
React/Solid/Vue hydrate the app via `renderFactory`.
[Details&nbsp;›](/frontend/server-side-render)

#### `metadata` / `generateMetadata` / `<head>` management?
MDX frontmatter drives `<head>` (title/description/head array);
for app frameworks you set head in the SSR entry's returned `head` and in components.
No `metadata` export convention.
[Details&nbsp;›](/frontend/mdx#frontmatter-head-injection)

### Project Structure, Tooling & Config

#### Different framework per folder, sharing types without `packages/shared`?
Yes - e.g. MDX marketing, React app, Vue admin in one project,
importing types directly across folders with no publishing or workspace protocols.
Folders develop together as one project and deploy independently while sharing infrastructure.
[Details&nbsp;›](/features)

#### Is Vite exposed/configurable? What replaces `next.config.js`?
It's built on Vite (no proprietary runtime/bundler).
Configure per folder via `kosmo.config.ts` with the `frontend` / `backend` / `validation` blocks,
plus standard Vite config including `plugins`.
There's no `app/` vs `pages/` debate - you're in `src/<folder>/{api,pages}`.
[Details&nbsp;›](/frontend/intro)

#### Output vs `.next/`, and a `next start` equivalent?
`dist/<folder>/` with `api/`, `client/`, and `ssr/`.
Run `node dist/run.js -p 4556` for the whole project, or a single folder's bundled server:
`node dist/front/api/server.js` (API) or `node dist/front/ssr/server.js -p 4556` (SSR).
No adapter system - Hono/H3 via native runtime servers, Koa via `node:http`.
[Details&nbsp;›](/dev-build-run/building-for-production#build-output)

#### `next/image` / `next/font` / `next/link` / `next/head` equivalents?
A seeded typed `Link` exists. Head injection is via MDX frontmatter and the SSR `head`.
There's no `next/image` (image optimization) or `next/font` equivalent - bring your own.
[Details&nbsp;›](/frontend/link-navigation)

#### Vs Next multi-zone?
The source-folder model is the multi-app story: per-folder base URLs, frameworks,
and builds within one project, sharing types and a database layer -
so where Next stitches separate deployments together with multi-zone,
KosmoJS keeps the apps in one codebase with no zone configuration.
[Details&nbsp;›](/features)

### OpenAPI

#### Does it really derive OpenAPI automatically, and how does it compare to hand-written / tRPC-OpenAPI?
Yes - OpenAPI 3.1 from routes, types, VRefine constraints, params, and responses,
with no manual authoring, kept live as routes change (TanStack has no built-in equivalent).
Serve it with Swagger UI, Redoc, or Stoplight Elements.
[Details&nbsp;›](/openapi)

---

### Agents

#### Is there guidance for LLM agents writing KosmoJS code?
Yes - [Notes for LLM Agents](/agents) collects what an agent must check before emitting code:
how to tell which frameworks a folder runs, why boilerplate should never be hand-written,
the four validation mistakes that typecheck but fail at runtime, middleware placement,
and why the dev server never shows the SSR path.

Agents should also prefer `https://kosmojs.dev/llms-full.txt` over recall for exact config options,
the full `VRefine` keyword set and scaffold flags.
[Details&nbsp;›](/agents)
