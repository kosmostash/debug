---
title: Sidecars in development
description: Running a sidecar under kosmo serve - how the reload works, why the close
    function is what frees the port, and when not to set serve at all.
head:
  - - meta
    - name: keywords
      content: sidecar serve, dev server, reload, EADDRINUSE, vite environment, hot reload,
        build-only sidecar, close function
---

In dev mode, `kosmo serve` can run a sidecar alongside your app, so a worker is up while you work on the routes that feed it.
Whether it does is the `serve` key.

Without `serve`, a sidecar is built and left alone - it is a build artifact like any other, and starting it is yours.
With `serve: true`, `kosmo serve` imports the entry into its own Vite environment and calls `start()`.

On a change to anything the entry imports it re-imports the module, calls `teardown()`,
then the close function `start()` returned, and calls `start()` again on what it loaded.

It is one process, so there is no signal to catch and nothing to wait for on exit -
but that also means the close function is the only thing that frees a port.

Return one that actually closes the server,
or the next reload hits `EADDRINUSE` and keeps hitting it until you restart the dev server.

A reload that throws leaves the running service untouched - the new source is loaded before
anything is torn down - and is reported; the next good save retries.

::: warning Development only
`kosmo preview` and `dist/run.js` build sidecars but never start them.
[Details&nbsp;›](/sidecar/production)
:::

---

### When not to set it

`serve` earns its keep when the service holds something open between edits -
a socket bound, a consumer subscribed, a pool connected.
That is what makes a restart worth doing, and the close function is what releases it.

A sidecar whose `start()` holds nothing has none of that.
There is no socket to rebind, nothing for the reload to free,
and no state that being up between saves preserves -
the dev server is only re-running a function that returns.

Leave `serve` off and let it be a build artifact:

```ts [src/mailer/kosmo.config.ts]
export default defineConfig({
  sidecar: {
    entry: "./entry.ts",
    run: "./run.ts",
    // nothing to keep alive between edits - build it, start it yourself
    serve: false,
  },
});
```

An empty close function is the tell.
If there is nothing to put in it, there is nothing `serve: true` is keeping alive for you.

---

### Typechecking

Nothing to configure. A sidecar lives inside a source folder,
and a folder's `tsconfig.json` already covers everything under it,
so `pnpm typecheck mailer` checks it like any other file in the folder.

A sidecar that wraps third-party JavaScript, or one you simply do not want checked,
opts out with the folder-level `typecheck` key:

```ts [kosmo.config.ts]
defineConfig({
  // ...
  sidecar: { entry: "./entry.mjs" },
  typecheck: false,
});
```
