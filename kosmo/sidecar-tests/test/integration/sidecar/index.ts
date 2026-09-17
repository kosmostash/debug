import child_process from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

import { createProject } from "create-kosmo";
import { createJiti } from "jiti";

import { createHTTPFolder, createSidecarFolder } from "@kosmojs/cli";
import type { ProjectSettings, SourceFolder } from "@kosmojs/core";
import chassis from "@kosmojs/dev/chassis";
import { pathResolver, render, renderToFile } from "@kosmojs/lib";

import {
  buildProject,
  env,
  execFile,
  findFreePort,
  installDependencies,
  pkgsDir,
} from "..";
import * as templates from "../@fixtures/sidecar";

type SidecarConfig = {
  entry?: string;
  run?: string;
  serve?: boolean;
  typecheck?: boolean;
};

/**
 * A sidecar project driven the way a user drives one - scaffolded by the CLI,
 * installed, then either built (`pnpm build`) or served (chassis in-process).
 *
 * Deliberately not `setupTestProject`: that one is built around a folder that
 * serves HTTP - pages, api routes, a browser - and a sidecar has none of it.
 * */
export const setupSidecarProject = async ({
  name = "worker",
  sidecarFolder = {},
  httpFolder,
}: {
  name?: string;
  sidecarFolder?: SidecarConfig;
  // a second, HTTP-serving folder - the layout the docs recommend
  httpFolder?: { name: string; base: string };
} = {}) => {
  const devPort = await findFreePort();
  const tempDir = await mkdtemp(resolve(tmpdir(), ".kosmojs-sidecar-"));
  const projectRoot = resolve(tempDir, "app");

  const sourceFolder: SourceFolder = {
    root: projectRoot,
    name,
    config: {},
    generators: [],
    distDir: "dist",
  };

  const { createPath } = pathResolver(sourceFolder);
  const jiti = createJiti(projectRoot);

  let closeServer: (() => Promise<void>) | undefined;
  const children = new Set<child_process.ChildProcess>();

  /**
   * The service logs to a file rather than to a variable:
   * under `kosmo serve` the entry is evaluated inside Vite's module runner,
   * and every reload produces a fresh module instance.
   * A file is the one channel the test and every instance of the service agree on.
   * */
  const logFile = resolve(tempDir, "service.log");

  // the templates place it as a literal, so it survives any path
  const logFileLiteral = JSON.stringify(logFile);

  return {
    devPort,
    projectRoot,
    logFile,
    createPath,

    async bootstrap() {
      await createProject(
        projectRoot,
        { name: "app", devPort },
        {
          dependencies: { "@kosmojs/core": `${pkgsDir}/core` },
          devDependencies: {
            "@kosmojs/dev": `${pkgsDir}/dev`,
            "@kosmojs/cli": `${pkgsDir}/cli`,
          },
        },
      );

      if (httpFolder) {
        await createHTTPFolder(
          projectRoot,
          { name: httpFolder.name, backend: "hono" },
          { backend: { base: httpFolder.base } },
        );
      }

      await createSidecarFolder(projectRoot, { name, sidecar: true });

      // the seeded config is the default one; tests state what they need
      await this.writeConfig(sidecarFolder);

      await installDependencies(projectRoot);
    },

    /** Rewrite the folder's kosmo.config.ts - `run: undefined` drops the key. */
    async writeConfig({
      entry = "./entry.ts",
      run,
      serve,
      typecheck,
    }: SidecarConfig) {
      await renderToFile(createPath.src("kosmo.config.ts"), templates.config, {
        entry,
        run,
        serve: JSON.stringify(serve ?? false),
        typecheck: JSON.stringify(typecheck === undefined ? true : typecheck),
      });
    },

    /** Write any file inside the source folder, e.g. "entry.ts", "lib/tick.ts". */
    async writeSource(file: string, content: string) {
      const path = createPath.src(file);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content, "utf8");
    },

    /**
     * An entry that logs every lifecycle call and holds the event loop open,
     * so the process behaves like a service rather than exiting at once.
     * `tick` is imported, not inlined, so a test can edit the dependency
     * and see whether the reloaded service picked the new source up.
     * */
    serviceEntry() {
      return render(templates.entry, { logFile: logFileLiteral });
    },

    /**
     * The same service, but holding a listening socket - `close()` awaits real
     * I/O and throws if called twice, which is what a reload has to avoid
     * doing after one that failed. Binds an ephemeral port: nothing in the
     * test talks to it, only the lifecycle matters.
     *
     * `failStartOn` makes `start()` throw for one tick value, so a test can
     * provoke the other way a reload fails.
     * */
    servingEntry({ failStartOn }: { failStartOn?: string } = {}) {
      return render(templates.servingEntry, {
        logFile: logFileLiteral,
        ...(failStartOn === undefined
          ? {}
          : { failStartOn: JSON.stringify(failStartOn) }),
      });
    },

    /**
     * The same service as plain ESM - no `defineService`, no types, relative
     * imports carrying their extension. What a sidecar wrapping third-party
     * JavaScript looks like, and what `typecheck: false` is for.
     * */
    mjsEntry() {
      return render(templates.mjsEntry, { logFile: logFileLiteral });
    },

    /** Its runner, the same shape `kosmo sidecar` seeds. */
    mjsRunner() {
      return templates.mjsRunner;
    },

    tickModule(value: string) {
      return render(templates.tick, { value: JSON.stringify(value) });
    },

    /** Truncate the log so a test reads only what it provoked. */
    async resetLog() {
      await writeFile(logFile, "", "utf8");
    },

    async readLog(): Promise<Array<string>> {
      const { readFile } = await import("node:fs/promises");
      const content = await readFile(logFile, "utf8").catch(() => "");
      return content.split("\n").filter(Boolean);
    },

    /** Wait until the log reaches `count` lines, or give up. */
    async waitForLog(count: number, timeout = 5000): Promise<Array<string>> {
      const deadline = Date.now() + timeout;
      let lines = await this.readLog();
      while (lines.length < count && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 50));
        lines = await this.readLog();
      }
      return lines;
    },

    build() {
      return buildProject(projectRoot);
    },

    /**
     * The CLI itself, run against the project -
     * the shared `exec` exits the whole process on a non-zero code,
     * and a skipped typecheck is something a test wants to read rather than die on.
     * */
    async runKosmo(args: Array<string>) {
      const bin = resolve(pkgsDir, "cli/pkg/cli.js");
      try {
        const { stdout, stderr } = await execFile(
          process.execPath,
          [bin, ...args],
          { cwd: projectRoot, env },
        );
        return { code: 0, stdout, stderr };
      } catch (error) {
        const { code, stdout, stderr } = error as {
          code?: unknown;
          stdout?: unknown;
          stderr?: unknown;
        };
        return {
          code: typeof code === "number" ? code : 1,
          stdout: String(stdout || ""),
          stderr: String(stderr || ""),
        };
      }
    },

    async distEntries(...path: Array<string>) {
      return readdir(createPath.distDir(...path)).catch(() => []);
    },

    /** `kosmo serve`, in this process - the same call `kosmo serve` makes. */
    async startDevServer() {
      const { config, generators } = await jiti.import<
        Pick<SourceFolder, "config" | "generators">
      >(createPath.src("kosmo.config.ts"), { default: true });

      const projectSettings: ProjectSettings = {
        root: projectRoot,
        sourceFolders: [{ ...sourceFolder, config, generators }],
        command: "serve",
        distDir: sourceFolder.distDir,
        devPort,
        previewPort: devPort + 1,
      };

      closeServer = await chassis(projectSettings);
    },

    /** Spawn a built artifact, e.g. dist/<name>/sidecar/run.js. */
    spawnDist(file: string) {
      const child = child_process.spawn(
        process.execPath,
        [createPath.distDir(file)],
        { cwd: projectRoot, env },
      );

      children.add(child);

      let output = "";
      child.stdout?.on("data", (d) => (output += d));
      child.stderr?.on("data", (d) => (output += d));

      return {
        child,
        output: () => output,
        get running() {
          return child.exitCode === null && child.signalCode === null;
        },
        /** Resolves with how it ended, or "running" if it outlived the wait. */
        exit(timeout = 5000): Promise<string> {
          if (child.exitCode !== null || child.signalCode !== null) {
            return Promise.resolve(
              `exit ${child.signalCode ?? child.exitCode}`,
            );
          }
          return Promise.race([
            new Promise<string>((r) => {
              child.once("exit", (code, signal) => r(`exit ${signal ?? code}`));
            }),
            new Promise<string>((r) => setTimeout(() => r("running"), timeout)),
          ]);
        },
      };
    },

    async teardown() {
      await closeServer?.();
      for (const child of children) {
        child.kill("SIGKILL");
      }
      if (!process.env.KEEP_PROJECT) {
        await rm(tempDir, { recursive: true, force: true });
      }
    },
  };
};
