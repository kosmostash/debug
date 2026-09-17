import child_process from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

import { createJiti } from "jiti";

import { createSidecarFolder, createSourceFolder } from "@kosmojs/cli";
import type { ProjectSettings, SourceFolder } from "@kosmojs/core";
import chassis from "@kosmojs/dev/chassis";
import { pathResolver } from "@kosmojs/lib";
import { createProject } from "create-kosmo";

import { env, exec, execFile } from "..";
import { findFreePort } from "../setup";

const pnpmDir = resolve(tmpdir(), ".kosmojs/pnpm-store");

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
  sidecar = {},
  webFolder,
}: {
  name?: string;
  sidecar?: SidecarConfig;
  // a second, HTTP-serving folder - the layout the docs recommend
  webFolder?: { name: string; base: string };
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
   * The service logs to a file rather than to a variable: under `kosmo serve`
   * the entry is evaluated inside Vite's module runner, and every reload
   * produces a fresh module instance. A file is the one channel the test and
   * every instance of the service agree on.
   * */
  const logFile = resolve(tempDir, "service.log");

  const writeFile_ = async (path: string, content: string) => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, "utf8");
  };

  return {
    devPort,
    projectRoot,
    logFile,
    createPath,

    async bootstrap() {
      const pkgsDir = resolve(import.meta.dirname, "../../../packages");

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

      if (webFolder) {
        await createSourceFolder(
          projectRoot,
          { name: webFolder.name, backend: "hono" },
          { backend: { base: webFolder.base } },
        );
      }

      await createSidecarFolder(projectRoot, { name, sidecar: true });

      // the seeded config is the default one; tests state what they need
      await this.writeConfig(sidecar);

      await exec(
        "pnpm",
        [
          "install",
          "--store-dir",
          pnpmDir,
          "--no-frozen-lockfile",
          "--prefer-offline",
        ],
        { cwd: projectRoot, env },
      );
    },

    /** Rewrite the folder's kosmo.config.ts - `run: undefined` drops the key. */
    async writeConfig({ entry = "./entry.ts", run, serve, typecheck }: SidecarConfig) {
      await writeFile_(
        createPath.src("kosmo.config.ts"),
        [
          `import { defineConfig } from "@kosmojs/dev";`,
          ``,
          `export default defineConfig({`,
          `  sidecar: {`,
          `    entry: ${JSON.stringify(entry)},`,
          ...(run === undefined ? [] : [`    run: ${JSON.stringify(run)},`]),
          ...(serve === undefined ? [] : [`    serve: ${serve},`]),
          `  },`,
          ...(typecheck === undefined
            ? []
            : [`  typecheck: ${typecheck},`]),
          `});`,
          ``,
        ].join("\n"),
      );
    },

    /** Write any file inside the source folder, e.g. "entry.ts", "lib/tick.ts". */
    writeSource(file: string, content: string) {
      return writeFile_(createPath.src(file), content);
    },

    /**
     * An entry that logs every lifecycle call and holds the event loop open,
     * so the process behaves like a service rather than exiting at once.
     * `tick` is imported, not inlined, so a test can edit the dependency
     * and see whether the reloaded service picked the new source up.
     * */
    serviceEntry() {
      return [
        `import { appendFileSync } from "node:fs";`,
        ``,
        `import { defineService } from "_/sidecar";`,
        ``,
        `import { tick } from "./tick";`,
        ``,
        `const log = (event: string) => {`,
        `  appendFileSync(${JSON.stringify(logFile)}, \`\${event}:\${tick}\\n\`);`,
        `};`,
        ``,
        `export default defineService({`,
        `  async start() {`,
        `    const timer = setInterval(() => {}, 1000);`,
        `    log("start");`,
        `    return async () => {`,
        `      clearInterval(timer);`,
        `      log("close");`,
        `    };`,
        `  },`,
        `  async teardown() {`,
        `    log("teardown");`,
        `  },`,
        `});`,
        ``,
      ].join("\n");
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
      return [
        `import { appendFileSync } from "node:fs";`,
        `import { createServer } from "node:http";`,
        ``,
        `import { defineService } from "_/sidecar";`,
        ``,
        `import { tick } from "./tick";`,
        ``,
        `const log = (event: string) => {`,
        `  appendFileSync(${JSON.stringify(logFile)}, \`\${event}:\${tick}\\n\`);`,
        `};`,
        ``,
        `export default defineService({`,
        `  async start() {`,
        ...(failStartOn
          ? [
              `    if (tick === ${JSON.stringify(failStartOn)}) {`,
              `      throw new Error("start failed");`,
              `    }`,
            ]
          : []),
        `    const server = createServer((_req, res) => res.end(tick));`,
        `    await new Promise<void>((resolve) => {`,
        `      server.listen(0, () => resolve());`,
        `    });`,
        `    log("start");`,
        `    return async () => {`,
        `      await new Promise<void>((resolve, reject) => {`,
        `        server.close((error) => (error ? reject(error) : resolve()));`,
        `      });`,
        `      log("close");`,
        `    };`,
        `  },`,
        `});`,
        ``,
      ].join("\n");
    },

    /**
     * The same service as plain ESM - no `defineService`, no types, relative
     * imports carrying their extension. What a sidecar wrapping third-party
     * JavaScript looks like, and what `typecheck: false` is for.
     * */
    mjsEntry() {
      return [
        `import { appendFileSync } from "node:fs";`,
        ``,
        `import { tick } from "./tick.mjs";`,
        ``,
        `const log = (event) => {`,
        `  appendFileSync(${JSON.stringify(logFile)}, \`\${event}:\${tick}\\n\`);`,
        `};`,
        ``,
        `export default {`,
        `  async start() {`,
        `    const timer = setInterval(() => {}, 1000);`,
        `    log("start");`,
        `    return async () => {`,
        `      clearInterval(timer);`,
        `      log("close");`,
        `    };`,
        `  },`,
        `};`,
        ``,
      ].join("\n");
    },

    mjsRunner() {
      return [
        `import service from "./entry.mjs";`,
        ``,
        `const close = await service.start();`,
        ``,
        `for (const signal of ["SIGINT", "SIGTERM"]) {`,
        `  process.on(signal, async () => {`,
        `    await service.teardown?.();`,
        `    await close();`,
        `    process.exit(0);`,
        `  });`,
        `}`,
        ``,
      ].join("\n");
    },

    tickModule(value: string) {
      return `export const tick = ${JSON.stringify(value)};\n`;
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
      return exec("pnpm", ["build"], { cwd: projectRoot, env });
    },

    /**
     * The CLI itself, run against the project - the shared `exec` exits the
     * whole process on a non-zero code, and a skipped typecheck is something
     * a test wants to read rather than die on.
     * */
    async runKosmo(args: Array<string>) {
      const bin = resolve(import.meta.dirname, "../../../packages/cli/pkg/cli.js");
      try {
        const { stdout, stderr } = await execFile(process.execPath, [bin, ...args], {
          cwd: projectRoot,
          env,
        });
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

    distEntries(...path: Array<string>) {
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
            return Promise.resolve(`exit ${child.signalCode ?? child.exitCode}`);
          }
          return Promise.race([
            new Promise<string>((r) => {
              child.once("exit", (code, signal) =>
                r(`exit ${signal ?? code}`),
              );
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
