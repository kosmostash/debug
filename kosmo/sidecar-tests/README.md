# Sidecar reload fix + integration tests

Against `kosmojs/kosmo@4cd87b4f` ("feat(sidecar): a source folder that builds a standalone process").

## Contents

```
patches/sidecar-reload-tests-and-docs.patch   apply to a clean 4cd87b4f
packages/dev/src/chassis.ts                   the changed file, whole
test/integration/sidecar/                     the new suite
test/integration/cli/folders.test.ts          with the sidecar section appended
docs/sidecar/development.md                   with the reload sequence corrected
```

Verified with `git apply --check` against a pristine `4cd87b4f`.

## Two fixes in `chassis.ts`

**1. Reload on `hotUpdate`, not on the watcher.** A raw `watcher.on("change")`
re-imports the entry before Vite has invalidated the graph, so the service
restarts on the source as it was before the save. `hotUpdate` is called *after*
that invalidation, so the ordering is structural rather than a matter of how long
anything takes. Needs `hmr: true` (the hook is part of that pipeline); the server
is never listened on, so nothing binds - measured `listening: false addr: null`.

Ruled out on the way: `invalidateModule` (works, deliberately unused upstream),
`awaitWriteFinish` at 10/50ms and `true` (no effect - it moves when the event
fires, not who receives it first; chokidar confirmed to have received the option),
and a `setImmediate` yield (not enough).

**2. Load before tearing down.** The old order closed the service, then imported.
A save that could not compile therefore closed the sidecar and left it closed -
and because a real close function cannot run twice (`server.close()` on a closed
server throws), *every* later save failed too. The sidecar stayed dead until the
dev server was restarted. Measured, before the fix:

```
after break: ["start:1","close:1"]
after fix:   ["start:1","close:1"]      <- never came back
```

after:

```
after break: ["start:1"]                     <- untouched
after fix:   ["start:1","close:1","start:2"] <- reloaded
```

Starting still happens after closing, so a port-holding service frees its port
before the new instance binds.

## Suites

`integration:sidecar` - 11 tests, three CLI-scaffolded projects.

- `build.test.ts` (5) builds a sidecar folder beside an HTTP folder: output shape
  under `dist/<folder>/sidecar/`, the runner starting the service and staying up,
  `SIGINT` draining it through `teardown` then the close function, `dist/run.js`
  skipping a folder with no `kosmo.json`, and `run` omitted emitting the entry alone.
- `serve.test.ts` (4) chassis in-process with `serve: true`: start on boot, restart
  in the documented order, **the restarted service running the edited source**, and
  no restart for a file outside the graph.
- `reload-failure.test.ts` (2) a service holding a socket: a save that cannot
  compile leaves it untouched, and the next good save reloads it.

`integration:cli` - 8 added tests covering `kosmo sidecar <name>`.

The service logs lifecycle calls to a file rather than a variable: under `kosmo serve`
the entry is evaluated inside Vite's module runner and every reload produces a fresh
module instance, so a file is the one channel the test and every instance agree on.

## Verification

```
integration:sidecar     11 passed    (3/3 runs)
integration:cli + backend  503 passed | 46 skipped
unit                   819 passed | 1 skipped
```

Guard-checked, each reverted and confirmed red:

- raw `watcher.on("change")` instead of `hotUpdate` -> `serve.test.ts` fails, `start:1`
- close-then-load instead of load-then-close -> both `reload-failure.test.ts` tests fail
- `run` input dropped from the sidecar build -> 3 of 5 `build.test.ts` tests fail

One thing the suite does not cover: the `this.environment.name === "sidecar"` check
in the hook. Removing it keeps all 11 green, because nothing but that environment
resolves a module on this server today. Kept as a guard, not because anything trips it.
