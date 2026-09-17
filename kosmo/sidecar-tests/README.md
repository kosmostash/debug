# Sidecar integration tests

Against `kosmojs/kosmo@4cd87b4f` ("feat(sidecar): a source folder that builds a standalone process").

## Contents

```
patches/sidecar-integration-tests.patch   apply to a clean 4cd87b4f
test/integration/sidecar/                 the new suite, as files
test/integration/cli/folders.test.ts      with the sidecar section appended
```

The patch also carries the `integration:sidecar` vitest project, the
`test:integration:sidecar` scripts, and `findFreePort` exported from
`test/integration/setup.ts`. Verified with `git apply --check` against a
pristine `4cd87b4f`. No change to `packages/`.

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

## The skipped case

`serve.test.ts` parks "the restarted service runs the edited source". On one save
the restarted service logs `start:1` - the source as it was before the change.
The watcher handler re-imports the entry before Vite has marked the changed
modules dirty, so the module runner replays its cached transform.

Deterministic (5/5 runs), on a single write - not a burst. Any await between the
change and the re-import hides it, which is why the backend path, with a generator
pass in between, does not show it. A bare `setImmediate` yield is not enough
(3/3 still stale); ~100ms is.

Left skipped rather than fixed: `invalidateModule` is the fix I measured, and it
is deliberately not used here. Unskip if the reload ever orders itself after
Vite's invalidation.

## Verification

```
integration:sidecar     8 passed | 1 skipped
integration:cli        75 passed   (67 before)
integration:backend   437 passed | 46 skipped
unit                  819 passed | 1 skipped
```

Guard-checked: dropping the `run` input from the sidecar build turns 3 of 5
`build.test.ts` tests red.
