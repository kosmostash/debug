# Sidecar integration tests + docs

Against `kosmojs/kosmo@4cd87b4f` ("feat(sidecar): a source folder that builds a standalone process").

## Contents

```
patches/sidecar-tests-and-docs.patch      apply to a clean 4cd87b4f
test/integration/sidecar/                 the new suite, as files
test/integration/cli/folders.test.ts      with the sidecar section appended
docs/sidecar/development.md               with the "When not to set it" section
```

The patch also carries the `integration:sidecar` vitest project, the
`test:integration:sidecar` scripts, and `findFreePort` exported from
`test/integration/setup.ts`. Verified with `git apply --check` against a
pristine `4cd87b4f`. No change under `packages/`.

## Suites

`integration:sidecar` - two projects, each scaffolded by the CLI and installed.

- `build.test.ts` (5) builds a sidecar folder beside an HTTP folder, the layout
  `docs/sidecar/intro.md` recommends: output shape under `dist/<folder>/sidecar/`,
  the runner starting the service and staying up, `SIGINT` draining it through
  `teardown` then the close function, `dist/run.js` skipping a folder with no
  `kosmo.json`, and `run` omitted emitting the entry alone.
- `serve.test.ts` (3 + 1 skipped) runs chassis in-process with `serve: true`:
  start on boot, restart on a change in the entry's graph in the documented
  order, and no restart for a file outside the graph.

`integration:cli` - 8 added tests covering `kosmo sidecar <name>`: what it seeds,
that it seeds no route folders, the config block it writes, and the error paths
(missing name, existing dir, `--overwrite`, unknown option).

The service logs lifecycle calls to a file rather than a variable: under `kosmo serve`
the entry is evaluated inside Vite's module runner and every reload produces a fresh
module instance, so a file is the one channel the test and every instance agree on.

## The skipped case, and what it is not

`serve.test.ts` parks "the restarted service runs the edited source". On one save
the restarted service logs `start:1` - the source as it was before the change.

Measured, so the docs do not have to guess:

| condition | gap before re-import | result |
|---|---|---|
| no-op close | 0.08ms | stale, 5/5 runs |
| close awaiting `server.close()` on a live socket | ~1 tick | stale, 5/5 - and the server serves the stale body over HTTP |
| `setImmediate` yield | ~0ms | stale, 3/3 |
| `setTimeout` 1ms | 1.14ms | **fresh** |
| `setTimeout` 2 / 5 / 10 / 25 / 50ms | 2.3 - 49.9ms | fresh |

So the line sits just above one tick - but it is the *kind* of yield that matters,
not the duration: `setImmediate` and a socket-close callback both clear less than
a timer does and both stay stale. Only `invalidateModule` made it deterministic,
and that is deliberately unused upstream - hence skipped rather than fixed.

### The backend path is not affected

Measured the same way: five edits under `kosmo serve` - three to a module a route
imports, two to the route file itself - all served the edited source. Its reload
puts the generator pass between the change and the re-import, worth **21-34ms**
of real fs work, well clear of the ~1ms line.

Safe by margin rather than by design, but a 20x one.

## The docs change

`docs/sidecar/development.md` gains a "When not to set it" section: `serve` is for a
service that holds something open between edits, and a sidecar whose `start()` holds
nothing gains nothing from it - leave `serve` off and build it.

That argument stands on its own. It deliberately does **not** claim that a close
function doing real work gives Vite time to register the change; the table above is
why.

## Verification

```
integration:sidecar     8 passed | 1 skipped
integration:cli        75 passed   (67 before)
integration:backend   437 passed | 46 skipped
unit                  819 passed | 1 skipped
```

Guard-checked: dropping the `run` input from the sidecar build turns 3 of 5
`build.test.ts` tests red.
