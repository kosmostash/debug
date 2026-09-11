---
title: Configuration
description: Complete reference for kosmo.config.ts - the frontend, backend and validation
    blocks, base URLs, stack plugins and vite options, and the project-level settings in package.json.
head:
  - - meta
    - name: keywords
      content: kosmo.config.ts, defineConfig, frontend stack, backend stack, base url, devPort,
        previewPort, distDir, stack plugin, viteConfig, validation, openapi, ssr, ssg, tanstack query
---

Every source folder owns a `kosmo.config.ts`. It is the one file that decides what that folder *is* -
which frameworks it runs, where it is served from, and what gets built for it.

```txt
my-app/
├── package.json                    <- project-level settings
└── src/
    ├── front/
    │   └── kosmo.config.ts         <- this folder's config
    └── admin/
        └── kosmo.config.ts         <- independent of front's
```

There is no project-wide `kosmo.config.ts`, and no `vite.config.ts`:
each side of the folder carries its own [viteConfig](#frontend-viteconfig).

## The Shape

The config is declarative - you describe what the folder has:

```ts [src/vue/kosmo.config.ts]
import { defineConfig } from "@kosmojs/dev";

export default defineConfig({
  frontend: {
    stack: "vue",
    base: "/vue",
    fetch: true,
    ssr: true,
    ssg: false,
    tanstack: { query: false },
  },
  backend: {
    stack: "hono",
    base: "/vue/api",
  },
  validation: true,
});
```

Three top-level keys, all optional: `frontend`, `backend`, `validation`.
A folder can have both sides, or just one.

Every feature key follows the same pattern: a plain value turns it on with defaults,
or an object turns it on and hands KosmoJS the instance to use -
`stack` takes a `plugin`, `ssr` / `ssg` / `fetch` / `validation` take a `generator`.

`defineConfig` turns that description into the right set of generators, in the right order,
and is the only import a folder config needs.

## frontend

### frontend.stack - required

`"react"` · `"solid"` · `"vue"` · `"svelte"` · `"mdx"`

A bare name runs that stack's Vite plugin with defaults:

```ts
stack: "react"
```

To configure it, construct the plugin yourself and pass it alongside the name:

```ts
import react from "@vitejs/plugin-react";

stack: {
  name: "react",
  plugin: react({ jsxRuntime: "automatic" }),
}
```

`name` is what KosmoJS routes on - which stack runs, which page extensions it watches,
the `jsxImportSource` it writes into your tsconfig.
`plugin` is handed to Vite as you built it, alongside anything KosmoJS adds for that stack.

The default plugin each stack resolves to:

| stack | default plugin |
|---|---|
| react | `@vitejs/plugin-react` |
| vue | `@vitejs/plugin-vue`
| solid | `vite-plugin-solid`
| svelte | `@sveltejs/vite-plugin-svelte`
| mdx   | `@mdx-js/rollup`, with a basic set of `remarkPlugins` |

Bring your own plugin instance:

```ts
import mdx from "@mdx-js/rollup";

stack: {
  name: "mdx",
  plugin: mdx({
    remarkPlugins: [frontmatterPlugin, mdxFrontmatterPlugin],
    rehypePlugins: [rehypeSlug],
  }),
}
```

::: warning Don't also list the plugin in `viteConfig.plugins`
Whichever form you use, the plugin reaches Vite through `stack`.
Adding it to `viteConfig.plugins` as well runs the transform twice.
:::

### frontend.base - required

The URL prefix this folder's pages are served from. Must be absolute:

```ts
base: "/"          // app at the root
base: "/admin"     // admin dashboard under /admin
```

Duplicate slashes are collapsed and a trailing slash is stripped,
so `"/admin/"` and `"//admin"` both resolve to `"/admin"`.
Path traversal segments (`../`, `/./`) are rejected at startup.

### frontend.fetch

Typed [fetch clients](/fetch/intro) in `_/fetch`.

```ts
fetch: true
```

Clients are derived from the backend's routes, so this only produces anything
when the folder also has a `backend`.

### frontend.ssr

[Server-side rendering](/frontend/server-side-render).
Accepts `true`, or an options object:

```ts
ssr: true

ssr: {
  renderMode: {
    "docs/**": "stream",
  },
}
```

**`renderMode`** - `"string"` (default), `"stream"`, or a glob map for per-route selection.
[Details&nbsp;›](/frontend/server-side-render#selecting-the-render-mode)

### frontend.ssg

[Static site generation](/frontend/static-site-generation).

```ts
ssg: true
```

Renders routes to static HTML at build time. Requires `ssr: true` -
the scaffolder turns SSR on for you when you ask for SSG.
Dynamic routes declare their variants with `staticParams`.

### frontend.tanstack

```ts
tanstack: { query: true }
```

Deploys the `_/query` runtime, swaps `_/app` for a provider that supplies the query client,
and gives each SSR request its own client. [Details&nbsp;›](/frontend/tanstack-query)

### frontend.templates

Overrides seeded page boilerplate by route pattern:

```ts
templates: {
  "landing/*": landingTemplate,
  "marketing/**": landingTemplate,
}
```

[Custom Page Templates&nbsp;›](/frontend/custom-templates)

### frontend.viteConfig

Vite's `UserConfig` for the client build - `plugins`, `resolve`, `css`, `server`, `define`, `optimizeDeps`, and the rest:

```ts
frontend: {
  stack: "react",
  base: "/",
  viteConfig: {
    plugins: [tailwindcss()],
    resolve: {
      alias: { "#shared": "/src/shared" },
    },
    css: {
      preprocessorOptions: { scss: { api: "modern" } },
    },
  },
}
```

A handful of Vite keys are **not** accepted, because KosmoJS derives them from the source-folder layout:
`root`, `base` (the folder's prefixes come from `frontend.base` / `backend.base`),
`cacheDir`, `mode`, `builder`, `future`, `legacy`.

## backend

### backend.stack - required

`"hono"` · `"h3"` · `"koa"`

A bare name, or the same object form the frontend takes.
The backend stacks have no Vite plugin, so the object carries only `name` today and the bare name is the usual form.
Vite settings for the API build go in [viteConfig](#backend-viteconfig).

### backend.base - required

The URL prefix this folder's API routes are served from - a **full path**,
resolved on its own rather than against `frontend.base`:

```ts
frontend: { base: "/vue" },
backend:  { base: "/vue/api" },   // routes at /vue/api/<route name>
```

Nesting it under the frontend base is the convention the scaffolder follows,
but nothing requires it - the two prefixes are independent:

```ts
frontend: { base: "/admin" },
backend:  { base: "/api/v2" },    // routes at /api/v2/<route name>
```

A route's final URL is `backend.base` + route name:

```
base "/api"        route "users/[id]"  ->  /api/users/:id
base "/admin/api"  route "users/[id]"  ->  /admin/api/users/:id
base "/v1"         route "users/[id]"  ->  /v1/users/:id
```

The `api/` directory name never appears in the URL - it separates server routes from `pages/` on disk, nothing more.

### backend.openapi

Derives an [OpenAPI 3.1 spec](/openapi) from this folder's routes. Options are required:

```ts
backend: {
  stack: "hono",
  base: "/api",
  openapi: {
    outfile: "openapi.json",
    openapi: "3.1.0",
    info: { title: "My API", version: "1.0.0" },
    servers: [{ url: "https://api.example.com/api" }],
  },
}
```

[Details&nbsp;›](/openapi#configuration)

### backend.alias

Maps a public URL to an existing named route:

```ts
alias: {
  "/feed.xml": "rss",             // /feed.xml handled by the "rss" route
  "/members/[id]": "users/[id]",  // param names must match exactly
}
```

The key is absolute and is *not* prefixed by the router's base.
If it carries dynamic segments, their names must match the target route's parameters exactly, or the request 404s.

[Details&nbsp;›](/backend/aliases)

### backend.templates

Overrides the seeded route boilerplate by route-name pattern -
the route file (`defineRoute(...)`), not a page component.
This is what makes it useful for seeding CRUD endpoints across many tables at once.

```ts
templates: {
  "admin/**": adminRouteTemplate,
}
```

[Details&nbsp;›](/backend/custom-templates)

### backend.viteConfig

Vite's `UserConfig` for the API build, with the same exclusions as the frontend's:

```ts
backend: {
  stack: "hono",
  base: "/api",
  viteConfig: {
    define: { __API_BUILD__: true },
  },
}
```

The two sides are built separately, so `frontend.viteConfig` and `backend.viteConfig` are independent.

## validation

Runtime [validators derived from your types](/validation/intro).
Only meaningful alongside a `backend` - it validates incoming requests.

```ts
validation: true
```

For anything beyond on/off, pass an options object instead:

```ts
validation: {
  // override validation messages - node:util.format placeholders
  validationMessages: {
    STRING_MIN_LENGTH: "must be at least %d character%s long",
    NUMBER_MULTIPLE_OF: "must be a multiple of %s",
  },

  // file whose default export maps custom TypeBox types
  customTypesImport: "@/validation/types.ts",

  // identifier used for runtime refinements, default "VRefine"
  refineTypeName: "Refine",

  settings: {
    maxErrors: 8,                     // cap buffered diagnostics (DoS guard)
    useEval: true,                    // disable where unsafe-eval is blocked by CSP
    exactOptionalPropertyTypes: false,
    immutableTypes: false,
  },
}
```

- **`validationMessages`** is the place for i18n or project wording -
it changes every message globally, unlike the per-field [custom error messages](/validation/error-handling#custom-error-messages) you set on a handler.
- **`refineTypeName`** renames `VRefine` if it collides with something in your codebase.
The name is global and import-free either way. [Details&nbsp;›](/validation/refine)
- **`settings.useEval: false`** is the option to reach for when a strict Content Security Policy forbids `unsafe-eval`;
validation falls back to dynamic checking.
- **`settings.exactOptionalPropertyTypes: true`** aligns runtime check semantics with the TypeScript flag of the same name.

## What the scaffolder writes

Rather than assembling this by hand,
[kosmo folder](/essentials/cli#adding-a-source-folder) writes the right config for your answers - interactively, or from flags.
It names the bases after the folder: `/<folder>` for the frontend, `/<folder>/api` for the backend.

For reference, these are the configs it produces for a folder named `front`:

:::tabs variant:code
== React + Hono
```ts
import { defineConfig } from "@kosmojs/dev";

export default defineConfig({
  frontend: {
    stack: "react",
    base: "/front",
    fetch: true,
    ssr: false,
    ssg: false,
    tanstack: { query: false },
  },
  backend: {
    stack: "hono",
    base: "/front/api",
  },
  validation: true,
});
```

== Frontend only
```ts
import { defineConfig } from "@kosmojs/dev";

export default defineConfig({
  frontend: {
    stack: "react",
    base: "/front",
    fetch: true,
    ssr: false,
    ssg: false,
    tanstack: { query: false },
  },
});
```

== Backend only
```ts
import { defineConfig } from "@kosmojs/dev";

export default defineConfig({
  backend: {
    stack: "koa",
    base: "/front/api",
  },
  validation: true,
});
```

== MDX docs
```ts
import { defineConfig } from "@kosmojs/dev";

export default defineConfig({
  frontend: {
    stack: "mdx",
    base: "/docs",
    fetch: true,
    ssr: true,
    ssg: true,
  },
});
```
:::

> Changing what a folder has - adding `ssr`, a `backend`, `validation` - requires a
**dev server restart**. The config is read once at startup.

## Bringing your own generator

Each block accepts a `generator` key that replaces the built-in one for that slot.
This is the escape hatch for a framework or a validator KosmoJS does not ship:

```ts
frontend: {
  stack: "react",
  base: "/",
  generator: myReactGenerator(),
  fetch: { generator: myFetchGenerator() },
  ssr: { generator: mySSRGenerator() },
},
backend: {
  stack: "hono",
  base: "/api",
  generator: myHonoGenerator(),
  openapi: { generator: myOpenapiGenerator() },
},
validation: { generator: myValidationGenerator() },
```

The order generators run in is fixed and does not depend on how you write the config:

```txt
core  ->  backend  ->  validation  ->  openapi  ->  fetch  ->  frontend  ->  ssr  ->  ssg
```

`coreGenerator` always runs first and is never listed.

## Project Settings - `package.json`

A few settings are project-wide rather than per-folder, and live in the root `package.json`:

```json [package.json]
{
  "type": "module",
  "distDir": "dist", // [!code hl:3]
  "devPort": 4556,
  "previewPort": 4558,
  "scripts": {
    "dev": "kosmo serve",
    "build": "kosmo build",
    "preview": "kosmo preview",
    "typecheck": "kosmo typecheck",
    "folder": "kosmo folder"
  }
}
```

| Field | Default | Meaning |
|---|---|---|
| `distDir` | `"dist"` | Build output directory for every folder |
| `devPort` | `4556` | Port the dev server listens on |
| `previewPort` | `4558` | Port [kosmo preview](/dev-build-run/production-preview) listens on |

> Changing `distDir` also means updating `.gitignore`, which the scaffolder points at the default `/dist/`.

Four scripts take optional folder names -
`pnpm dev front`, `pnpm build admin`, `pnpm preview front`, `pnpm typecheck admin front` -
and act on every source folder when given none.

`previewPort` is separate from `devPort` so preview and the dev server can run at the same time.

## TypeScript Config

Each source folder has its own `tsconfig.json` extending a derived base in lib dir:

```json [src/front/tsconfig.json]
{ "extends": "../../lib/front/tsconfig.json" }
```

The derived base supplies the framework's `jsxImportSource`, the reserved path mappings, and strict compiler settings.
Anything you add in your own `compilerOptions` wins, and applies to that folder only:

```json [src/front/tsconfig.json]
{
  "extends": "../../lib/front/tsconfig.json",
  "compilerOptions": {
    "exactOptionalPropertyTypes": false
  }
}
```

[Details&nbsp;›](/essentials/project-structure)
