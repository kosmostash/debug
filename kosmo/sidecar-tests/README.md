# Sidecar integration tests

Against `kosmojs/kosmo@4cd87b4f` ("feat(sidecar): a source folder that builds a standalone process").

## Patches

| file | what |
|---|---|
| `patches/01-sidecar-integration-tests.patch` | the tests: new `test/integration/sidecar/`, a `sidecar:` section in `test/integration/cli/folders.test.ts`, the `integration:sidecar` vitest project and its scripts, and `findFreePort` exported from `test/integration/setup.ts` |
| `patches/02-chassis-invalidate-module.patch` | the reload fix `serve.test.ts` caught - invalidate the changed modules before re-importing the entry |

Both verified with `git apply --check` against a pristine `4cd87b4f`.

## Suites

`integration:sidecar` - 9 tests, two projects, each scaffolded by the CLI and installed.

- `build.test.ts` (5) builds a sidecar folder beside an HTTP folder, the layout
  `docs/sidecar/intro.md` recommends: output shape under `dist/<folder>/sidecar/`,
  the runner starting the service and staying up, `SIGINT` draining it through
  `teardown` then the close function, `dist/run.js` skipping a folder with no
  `kosmo.json`, and `run` omitted emitting the entry alone.
- `serve.test.ts` (4) runs chassis in-process with `serve: true`: start on boot,
  restart on a change in the entry's graph in the documented order, the restarted
  service running the *edited* source, and no restart for a file outside the graph.

`integration:cli` - 8 added tests covering `kosmo sidecar <name>`: what it seeds,
that it seeds no route folders, the config block it writes, and the error paths
(missing name, existing dir, `--overwrite`, unknown option).

The service logs lifecycle calls to a file rather than a variable: under `kosmo serve`
the entry is evaluated inside Vite's module runner and every reload produces a fresh
module instance, so a file is the one channel the test and every instance agree on.

## Verification

```
integration:sidecar     9 passed
integration:cli        75 passed   (67 before)
integration:backend   437 passed | 46 skipped
unit                  819 passed | 1 skipped
```

Both suites were guard-checked - reverted the code they cover and confirmed red:

- drop `invalidateModule` -> `serve.test.ts` "the restarted service runs the edited source" fails with `start:1`
- drop the `run` input from the sidecar build -> 3 of 5 `build.test.ts` tests fail
