# Sidecar reload fix + integration tests

Baseline `kosmojs/kosmo@4cd87b4f`, with the suite adapted to your local refactor.

## What applies where

The patches are self-contained against `4cd87b4f` (both `git apply --check` clean):

```
patches/chassis-reload-fix-and-docs.patch   packages/dev/src/chassis.ts + docs/sidecar/development.md
patches/wiring-and-cli-tests.patch          vitest project, scripts, cli/folders.test.ts sidecar section
```

**The sidecar suite is shipped as files, not as a patch**, because it now targets
your refactored tree rather than `4cd87b4f`: it imports `buildProject`, `env`,
`execFile`, `findFreePort`, `installDependencies` and `pkgsDir` from
`test/integration`, and `createHTTPFolder` from `@kosmojs/cli`.

```
test/integration/@fixtures/sidecar/     the service fixtures
test/integration/sidecar/               the harness and the four test files
```

The four test files needed one change for the refactor: `sidecar:` -> `sidecarFolder:`
and `webFolder:` -> `httpFolder:` in each `setupSidecarProject` call. Nothing else.

## Fixtures

Following the `@fixtures/*/templates` convention - `.hbs` sources, an `index.ts`
re-exporting them with `?raw`:

```
@fixtures/sidecar/
├── index.ts
├── entry.hbs             defineService, a timer, logs every lifecycle call
├── serving-entry.hbs     the same holding a socket; {{#if failStartOn}} makes start() throw
├── tick.hbs              the dependency a test edits to provoke a reload
└── mjs/
    ├── entry.hbs         plain ESM - no defineService, no types
    └── run.hbs           its runner, the shape `kosmo sidecar` seeds
```

`render` from `@kosmojs/lib` defaults to `noEscape: true`. `logFile` and the tick
`value` arrive JSON-serialized, so a path or a value lands as a valid literal
whatever it carries - which is why they appear unquoted in the templates.

Rendered output was checked by eye under `KEEP_PROJECT=1`, including the
`failStartOn` branch: handlebars strips the standalone block lines, so indentation
comes out as written.

## Two fixes in `chassis.ts`

**1. Reload from `hotUpdate`, not from the watcher.** A raw `watcher.on("change")`
re-imports the entry before Vite has invalidated the graph, so the service restarts
on the source as it was before the save. `hotUpdate` is called *after* that
invalidation, so the ordering is structural rather than a matter of how long
anything takes. Needs `hmr: true` (the hook is part of that pipeline); the server
is never listened on, so nothing binds - measured `listening: false addr: null`.

Ruled out on the way: `invalidateModule` (works, deliberately unused upstream),
`awaitWriteFinish` at `true` / 10ms / 50ms (no effect - it moves when the event
fires, not who receives it first; chokidar confirmed to have received the option),
and a `setImmediate` yield (not enough).

**2. Nothing is mutated until the new source is known good.** The old reload closed
the service, then imported. A save that could not compile therefore closed the
sidecar and left it closed - and because a real close function cannot run twice
(`server.close()` on a closed server throws), *every* later save failed in `close()`
too. The sidecar stayed dead until the dev server was restarted.

```ts
const next = await loadService();   // throws on a bad save - nothing has changed yet
await service.teardown?.();
await close();
close = async () => {};             // nothing is running now
service = next;
close = await service.start();      // throws -> no stale closer left behind
```

| failure | before | after |
|---|---|---|
| the save cannot compile | closed, then wedged - every later save threw in `close()` | untouched; the next good save reloads |
| `start()` throws | old closed, stale closer kept - every later save threw in `close()` | old closed, closer dropped; the next good save reloads |

Starting still follows closing, so a port-holding service frees its port before
the new instance binds.

## Suites

`integration:sidecar` - 18 tests, four CLI-scaffolded projects.

- `build.test.ts` (5) builds a sidecar folder beside an HTTP folder: output shape
  under `dist/<folder>/sidecar/`, the runner starting the service and staying up,
  `SIGINT` draining it through `teardown` then the close function, `dist/run.js`
  skipping a folder with no `kosmo.json`, and `run` omitted emitting the entry alone.
- `serve.test.ts` (5) chassis in-process with `serve: true`: start on boot, restart
  in the documented order, **the restarted service running the edited source**, a
  restart when the entry itself is edited, and no restart for a file outside the graph.
- `reload-failure.test.ts` (4) a service holding a socket, driven through both
  failure modes in order: a save that cannot compile leaves it untouched and the
  next good save reloads it; then a `start()` that throws leaves nothing running,
  and the next good save still reloads it.
- `mjs-entry.test.ts` (4) a plain-JavaScript sidecar - `entry.mjs`, `run.mjs`, no
  `defineService`, `typecheck: false`: the dev server starts it, reloads it on a
  change to what it imports, `kosmo typecheck` skips the folder, and it builds to
  the same place a TypeScript one does.

`integration:cli` - 8 added tests covering `kosmo sidecar <name>`.

Two notes on how these are written:

- The service logs lifecycle calls to a file rather than a variable: under
  `kosmo serve` the entry is evaluated inside Vite's module runner and every reload
  produces a fresh module instance, so a file is the one channel the test and every
  instance agree on.
- `reload-failure.test.ts` captures `console.error` and asserts on it. Both cases
  make chassis report a failed reload, and a suite that prints expected stack traces
  buries the unexpected ones.
- The typecheck case asserts exit codes, not the printed `SKIP`: `spinnerFactory`
  stubs itself out when stdout is not a TTY, so nothing is printed under vitest.

## Verification

```
integration:sidecar        18 passed   (no stderr)
integration:cli + backend  503 passed | 46 skipped
unit                       819 passed | 1 skipped
```

Guard-checked, each reverted and confirmed red:

- raw `watcher.on("change")` instead of `hotUpdate` -> `serve.test.ts` fails, `start:1`
- close-then-load instead of load-then-close -> both compile-failure tests fail
- the `close = async () => {}` reset dropped -> the start-failure recovery test fails
- chassis not reporting a failed reload -> both `console.error` assertions fail
- `run` input dropped from the sidecar build -> 3 of 5 `build.test.ts` tests fail

One thing the suite does not cover: the `this.environment.name === "sidecar"` check
in the hook. Removing it keeps all 18 green, because nothing but that environment
resolves a module on this server today. Kept as a guard, not because anything trips it.
