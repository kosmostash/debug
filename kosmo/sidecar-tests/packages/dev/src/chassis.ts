import http, { type IncomingMessage, type ServerResponse } from "node:http";
import net from "node:net";
import { join, posix, resolve } from "node:path";
import { styleText } from "node:util";

import { pathToRegexp } from "path-to-regexp";
import {
  build,
  createServer,
  type Plugin,
  type RunnableDevEnvironment,
} from "vite";

import {
  defaults,
  type GeneratorFactory,
  type ProjectSettings,
  type ResolvedEntry,
  type SidecarService,
  type SourceFolder,
  type WatcherEvent,
} from "@kosmojs/core";
import type { DevSetup } from "@kosmojs/core/api";
import {
  createAliasPatterns,
  mergeConfigs,
  pathResolver,
  routesFactory,
  spinnerFactory,
  vitePlugins,
} from "@kosmojs/lib";

import { cacheFactory } from "./cache";
import { previewFactory } from "./preview";
import { deployRunner, writeFolderManifest } from "./runner";

export default async (
  projectSettings: ProjectSettings,
): Promise<() => Promise<void>> => {
  const { devPort, command } = projectSettings;

  // NOTE: seed before anything else, regardless command
  for (const sourceFolder of projectSettings.sourceFolders) {
    for (const generator of sourceFolder.generators) {
      if (!generator.meta?.name || typeof generator.factory !== "function") {
        throw new Error(
          `${sourceFolder.name}: Unrecognized generator - must be created via defineGenerator()`,
        );
      }
      try {
        await generator.factory(sourceFolder).seed();
      } catch (error) {
        console.error(
          styleText(
            "red",
            `${sourceFolder.name}: ${generator.meta.name} generator failed to seed`,
          ),
        );
        throw error;
      }
    }
  }

  if (command === "build" || command === "preview") {
    for (const sourceFolder of projectSettings.sourceFolders) {
      await buildSourceFolder(sourceFolder);
      if (sourceFolder.config.frontend || sourceFolder.config.backend) {
        await writeFolderManifest(sourceFolder);
      }
    }

    await deployRunner(projectSettings);

    if (command === "build") {
      return async () => {};
    }

    return previewFactory(projectSettings, buildSourceFolder);
  }

  type RequestMatcher = (req: IncomingMessage) => boolean;
  type RequestHandler = (req: IncomingMessage, res: ServerResponse) => void;

  const requestHandlers: Array<
    [
      path: string,
      matcherFactory: () => RequestMatcher,
      handlerFactory: () => RequestHandler,
    ]
  > = [];

  const teardownHandlers: Array<() => Promise<unknown>> = [];

  const eventMap: Record<string, Awaited<ReturnType<typeof eventFactory>>> = {};

  // WARN: call this before starting any server!
  for (const sourceFolder of projectSettings.sourceFolders) {
    if (sourceFolder.config.frontend || sourceFolder.config.backend) {
      eventMap[sourceFolder.name] = await eventFactory(sourceFolder);
    }
  }

  let port = await findFreePort(devPort);

  for (const sourceFolder of projectSettings.sourceFolders) {
    const { createPath } = pathResolver(sourceFolder);
    const { frontend, backend, sidecar } = sourceFolder.config;

    const requestMatchers = matchersFactory(sourceFolder);

    const plugins = [
      vitePlugins.tsconfigPaths(sourceFolder),
      vitePlugins.nodePrefix(),
      vitePlugins.virtualModules(sourceFolder, {
        // The dev server is always a CSR graph - SSR runs in production builds only -
        // so env-sensitive modules resolve to their client variants here,
        // whatever a concurrent build is doing.
        kind: "csr",
        command,
      }),
    ];

    if (frontend) {
      // INFO: === start client server ===

      const generator = sourceFolder.generators.find(
        (e) => e.meta.slot === "frontend",
      );

      const viteServer = await createServer(
        mergeConfigs(
          // user-provided config - lowest priority
          frontend?.viteConfig,
          // generator config - higher priority
          generator
            ?.factory(sourceFolder)
            .viteConfig?.({ kind: "frontend", command }),
          // main config - highest priority
          {
            base: frontend.base,
            root: createPath.src(),
            cacheDir: cacheDir(sourceFolder, command, "client"),
            plugins,
            server: {
              port: port++,
              middlewareMode: true,
              hmr: { port: port++ },
            },
          },
        ),
      );

      for (const [evt, handler] of Object.entries(
        eventMap[sourceFolder.name],
      )) {
        viteServer.watcher.on(evt, handler);
      }

      requestHandlers.push([
        frontend.base,
        () => requestMatchers.frontend,
        () => viteServer.middlewares,
      ]);

      teardownHandlers.push(viteServer.close);
    }

    if (backend) {
      // INFO: === start backend server ===

      const generator = sourceFolder.generators.find(
        (e) => e.meta.slot === "backend",
      );

      const viteServer = await createServer(
        mergeConfigs(
          // user-provided config - lowest priority
          backend.viteConfig,
          // generator config - higher priority
          generator
            ?.factory(sourceFolder)
            .viteConfig?.({ kind: "backend", command }),
          // main config - highest priority
          {
            root: createPath.src(),
            appType: "custom",
            cacheDir: cacheDir(sourceFolder, command, "backend"),
            plugins,
            server: {
              port: port++,
              middlewareMode: true,
              hmr: { port: port++ },
            },
            resolve: {
              conditions: ["node"],
            },
            environments: {
              backend: {
                resolve: {
                  conditions: ["node"],
                },
              },
            },
          },
        ),
      );

      const env = viteServer.environments.backend as RunnableDevEnvironment;

      const loadDevSetup = async () => {
        env.runner.clearCache();
        return env.runner
          .import<{ default: DevSetup }>(join(defaults.apiDir, "dev.ts"))
          .then((e) => e.default);
      };

      let devSetup = await loadDevSetup();

      for (const [evt, handler] of Object.entries(
        eventMap[sourceFolder.name],
      )) {
        viteServer.watcher.on(evt, async (file) => {
          const mods = env.moduleGraph.getModulesByFile(file);
          if (mods?.size) {
            try {
              await handler(file);
              await devSetup?.teardownHandler?.();
              devSetup = await loadDevSetup();
            } catch (error) {
              // keep the dev server alive; the next good save reloads
              console.error(
                styleText("red", `${sourceFolder.name}: backend reload failed`),
              );
              console.error(error);
            }
          }
        });
      }

      requestHandlers.push([
        backend.base,
        () => devSetup.requestMatcher || requestMatchers.backend,
        () => devSetup.requestHandler(),
      ]);

      teardownHandlers.push(viteServer.close);
    }

    if (sidecar?.serve) {
      /**
       * Assigned once the service is up; the reload plugin below is installed
       * during `createServer`, so the hook has to reach it through a binding
       * rather than a closure over something that does not exist yet.
       * */
      let reload = async () => {};

      /**
       * Restarting on a raw `watcher.on("change")` reads the module graph
       * before Vite has invalidated it, and the service comes back up running
       * the source as it was before the save.
       *
       * `hotUpdate` is called after that invalidation, so ordering is a
       * property of where the hook sits rather than of how long anything
       * happens to take. Returning `[]` says the update is handled and
       * leaves Vite nothing to propagate.
       *
       * The hook runs once per environment; nothing but `sidecar` resolves a
       * module on this server today, so the name check is there to keep it
       * that way rather than because anything currently trips it.
       * */
      const reloadPlugin: Plugin = {
        name: "kosmo:sidecar-reload",
        hotUpdate({ modules }) {
          if (this.environment.name === "sidecar" && modules.length) {
            void reload();
          }
          return [];
        },
      };

      const viteServer = await createServer(
        mergeConfigs(
          // user-provided config - lowest priority
          sidecar.viteConfig,
          // main config - highest priority
          {
            root: createPath.src(),
            appType: "custom",
            cacheDir: cacheDir(sourceFolder, command, "sidecar"),
            plugins: [...plugins, reloadPlugin],
            /**
             * `hotUpdate` is part of the HMR pipeline, so it runs only with
             * `hmr` on - but this server is never listened on, so no socket
             * is ever bound and no port is taken.
             * */
            server: { hmr: true },
            resolve: {
              conditions: ["node"],
            },
            environments: {
              sidecar: {
                resolve: {
                  conditions: ["node"],
                },
              },
            },
          },
        ),
      );

      const env = viteServer.environments.sidecar as RunnableDevEnvironment;

      const loadService = async () => {
        env.runner.clearCache();
        return env.runner
          .import<{ default: SidecarService }>(sidecar.entry)
          .then((e) => e.default);
      };

      let service = await loadService();
      let close = await service.start();

      reload = async () => {
        try {
          /**
           * Load before tearing anything down: a save that cannot compile
           * throws here, and the running service is left untouched rather
           * than closed with nothing to replace it - which is unrecoverable
           * for a service whose close function cannot run twice.
           *
           * Starting still happens after closing, so a service holding a
           * port frees it before the new one binds.
           * */
          const next = await loadService();
          await service.teardown?.();
          await close();
          /**
           * Nothing is running between here and `start()`, so drop the closer:
           * a `start()` that throws would otherwise leave the next reload
           * calling it a second time, which for a real one throws too - and
           * the sidecar never comes back.
           * */
          close = async () => {};
          service = next;
          close = await service.start();
        } catch (error) {
          // keep the dev server alive; the next good save reloads
          console.error(
            styleText("red", `${sourceFolder.name}: sidecar reload failed`),
          );
          console.error(error);
        }
      };

      teardownHandlers.push(viteServer.close);
    }
  }

  /**
   * Sorting is essential to ensure more specific paths are matched before broader ones.
   *
   * Correct sort order:
   *   1. /admin/api - 10 + 3, most specific
   *   3. /admin     - 6  + 2
   *   2. /api       - 4  + 2
   *   4. /          - 1  + 2
   * */
  const requestHandlerWeight = ([path]: (typeof requestHandlers)[number]) => {
    return path.length + path.split("/").filter(Boolean).length;
  };

  const handlers = requestHandlers.sort(
    (a, b) => requestHandlerWeight(b) - requestHandlerWeight(a),
  );

  const httpServer = http.createServer((req, res) => {
    for (const [, matcherFactory, handlerFactory] of handlers) {
      // should be called on every request
      const [matcher, handler] = [matcherFactory(), handlerFactory()];
      if (matcher(req)) {
        handler(req, res);
        return;
      }
    }
    res.writeHead(404, { "Content-Type": "text/html" });
    res.end("<h1>404: Not Found</h1>");
  });

  httpServer.on("error", (error) => {
    console.error(
      styleText("red", `Failed to start dev server on port ${devPort}`),
    );
    console.error(error.message);
    process.exit(1);
  });

  httpServer.listen(devPort);

  teardownHandlers.push(async () => {
    httpServer.close();
  });

  return async () => {
    for (const handler of teardownHandlers) {
      await handler();
    }
    // Let chokidar fully release file handles
    await new Promise((resolve) => setTimeout(resolve, 100));
  };
};

const cacheDir = (
  { root, name }: SourceFolder,
  command: ProjectSettings["command"],
  mode: "client" | "backend" | "sidecar",
) => {
  return resolve(root, `var/.vite/${name}/${command}/${mode}`);
};

/**
 * Production build of one source folder - generators, client bundle, api bundle,
 * then the generators' post-build steps (ssr, ssg).
 * Shared by `build` and `preview`: preview is a production build that reruns on change,
 * so generators are told `command: "build"` and the build cache is the same.
 * */
const buildSourceFolder = async (sourceFolder: SourceFolder) => {
  const command = "build";

  const { createPath } = pathResolver(sourceFolder);
  const { frontend, backend, sidecar } = sourceFolder.config;

  const resolvedRoutes = [];

  if (!sidecar) {
    const { resolvers } = await routesFactory(sourceFolder, cacheFactory);

    const spinner = spinnerFactory(`${sourceFolder.name}: resolving routes`);

    for (const { name, handler } of resolvers.values()) {
      spinner.append(
        `[ ${resolvedRoutes.length + 1} of ${resolvers.size} ] ${name}`,
      );
      resolvedRoutes.push(await handler());
    }

    spinner.succeed("ready ✨");
  }

  const plugins = [
    vitePlugins.tsconfigPaths(sourceFolder),
    vitePlugins.nodePrefix(),
    vitePlugins.virtualModules(sourceFolder, {
      // `kind: "csr"` everywhere except the SSR bundle,
      // which installs its own copy with `kind: "ssr"`
      kind: "csr",
      command,
    }),
  ];

  for (const generator of sourceFolder.generators) {
    await generator.factory(sourceFolder).build?.(resolvedRoutes);
  }

  if (frontend) {
    // INFO: === build the frontend ===

    const generator = sourceFolder.generators.find(
      (e) => e.meta.slot === "frontend",
    );

    await build(
      mergeConfigs(
        // user-provided config - lowest priority
        frontend.viteConfig,
        // generator config - higher priority
        generator
          ?.factory(sourceFolder)
          .viteConfig?.({ kind: "frontend", command }),
        // main config - highest priority
        {
          base: frontend.base,
          root: createPath.src(),
          cacheDir: cacheDir(sourceFolder, command, "client"),
          plugins,
          build: {
            outDir: createPath.distDir("client"),
            manifest: true,
            emptyOutDir: true,
          },
        },
      ),
    );
  }

  if (backend) {
    // INFO: === build the backend ===

    const generator = sourceFolder.generators.find(
      (e) => e.meta.slot === "backend",
    );

    await build(
      mergeConfigs(
        // user-provided config - lowest priority
        backend.viteConfig,
        // generator config - higher priority
        generator
          ?.factory(sourceFolder)
          .viteConfig?.({ kind: "backend", command }),
        // main config - highest priority
        {
          base: "./",
          root: createPath.src(),
          appType: "custom",
          plugins,
          resolve: {
            conditions: ["node"],
          },
          build: {
            ssr: true,
            target: "esnext",
            sourcemap: true,
            emptyOutDir: true,
            rolldownOptions: {
              input: [
                createPath.api("app.ts"),
                createPath.api("server.ts"),
                // node listener for dist/run.js - the app without a port
                createPath.lib("@api/listener.ts"),
              ],
              output: {
                dir: createPath.distDir("api"),
                format: "esm",
              },
            },
          },
          cacheDir: cacheDir(sourceFolder, command, "backend"),
        },
      ),
    );
  }

  if (sidecar) {
    // INFO: === build the sidecar ===
    await build(
      mergeConfigs(
        // user-provided config - lowest priority
        sidecar.viteConfig,
        // main config - highest priority
        {
          base: "./",
          root: createPath.src(),
          appType: "custom",
          plugins,
          resolve: {
            conditions: ["node"],
          },
          build: {
            ssr: true,
            target: "esnext",
            sourcemap: true,
            emptyOutDir: true,
            rolldownOptions: {
              input: {
                entry: createPath.src(sidecar.entry),
                ...(sidecar.run ? { run: sidecar.run } : {}),
              },
              output: {
                dir: createPath.distDir("sidecar"),
                format: "esm",
              },
            },
          },
          cacheDir: cacheDir(sourceFolder, command, "sidecar"),
        },
      ),
    );
  }

  for (const generator of sourceFolder.generators) {
    await generator.factory(sourceFolder).postBuild?.(resolvedRoutes);
  }
};

const eventFactory = async (
  sourceFolder: SourceFolder,
): Promise<
  Record<"add" | "change" | "unlink", (f: string) => Promise<void>>
> => {
  const { resolvers, resolversFactory } = await routesFactory(
    sourceFolder,
    cacheFactory,
  );

  const { createPath } = pathResolver(sourceFolder);

  const generators: Array<{
    name: string | undefined;
    factory: GeneratorFactory;
  }> = [];

  for (const generator of sourceFolder.generators) {
    const factory = generator.factory(sourceFolder);
    generators.push({ name: generator.meta.name, factory });
  }

  const resolvedRoutes = new Map<
    string, // fileFullpath
    ResolvedEntry
  >();

  const runGenerators = async (event?: WatcherEvent) => {
    /**
     * Watch handlers receive the full list of entries
     * and should process only those whose source file or dependencies were updated.
     * */
    const entries = Array.from(resolvedRoutes.values());

    for (const { name, factory } of generators) {
      try {
        await factory.watch?.(entries, event);
      } catch (error) {
        console.error(
          styleText("red", `${sourceFolder.name}: ${name} generator failed`),
        );
        if (event) {
          console.error(event);
        }
        console.error(error);
      }
    }
  };

  const updateResolvedEntry = async (file: string) => {
    const resolver = resolvers.get(file);

    if (!resolver) {
      return;
    }

    try {
      const resolvedEntry = await resolver.handler(file);
      resolvedRoutes.set(resolvedEntry.entry.fileFullpath, resolvedEntry);
      return resolvedEntry;
    } catch (error) {
      const route = file.replace(`${createPath.api()}/`, "");
      console.error(
        styleText(
          "red",
          `${sourceFolder.name}: ${route} route resolution failed`,
        ),
      );
      console.error(error);
      return;
    }
  };

  {
    const spinner = spinnerFactory(`${sourceFolder.name}: resolving routes`);
    for (const { name, handler } of resolvers.values()) {
      spinner.append(
        `[ ${resolvedRoutes.size + 1} of ${resolvers.size} ] ${name}`,
      );
      const route = await handler();
      resolvedRoutes.set(route.entry.fileFullpath, route);
    }
    spinner.succeed("ready ✨");
  }

  // NOTE: call only after routes resolved
  await runGenerators();

  return {
    async add(file) {
      const [resolver] = resolversFactory([file]).values();

      if (!resolver) {
        return;
      }

      resolvers.set(file, resolver);

      // call only after `resolvers.set(file)`
      const resolvedEntry = await updateResolvedEntry(file);

      if (resolvedEntry) {
        await runGenerators({ kind: "create", file });
      }
    },

    async change(file) {
      if (resolvedRoutes.has(file)) {
        // route updated
        await updateResolvedEntry(file);
      } else {
        // updating entries that are referencing updated file
        const relatedRoutes = resolvedRoutes
          .values()
          .flatMap(({ kind, entry }) => {
            return kind === "apiRoute"
              ? entry.referencedFiles.includes(file)
                ? [entry]
                : []
              : [];
          });

        for (const route of relatedRoutes) {
          await updateResolvedEntry(route.fileFullpath);
        }
      }

      await runGenerators({ kind: "update", file });
    },

    async unlink(file) {
      // route deleted
      resolvers.delete(file);
      resolvedRoutes.delete(file);
      await runGenerators({ kind: "delete", file });
    },
  };
};

const matchersFactory: (
  sourceFolder: SourceFolder,
) => Record<"frontend" | "backend", (req: IncomingMessage) => boolean> = ({
  config,
}) => {
  const [frontendBase, backendBase] = [
    config.frontend?.base,
    config.backend?.base,
  ];

  const backendAliasPatterns = backendBase
    ? createAliasPatterns(config.backend?.alias).map((pattern) => {
        return pathToRegexp(posix.join("/", pattern)).regexp;
      })
    : [];

  const prefixMatch = (base: string, path: string) => {
    return path === base || path.startsWith(posix.join(base, "/"));
  };

  const backendMatch = (path: string) => {
    if (!backendBase) {
      return false;
    }
    return prefixMatch(backendBase, path)
      ? true
      : backendAliasPatterns.some((r) => r.test(path) || false);
  };

  return {
    frontend(req) {
      if (!frontendBase) {
        return false;
      }
      const { pathname } = new URL(req.url ?? "/", "http://localhost");
      return backendMatch(pathname)
        ? false
        : prefixMatch(frontendBase, pathname);
    },
    backend(req) {
      const { pathname } = new URL(req.url ?? "/", "http://localhost");
      return backendMatch(pathname);
    },
  };
};

const findFreePort = async (devPort: number): Promise<number> => {
  let minPort = 0;
  let maxPort = 0;

  for (const n of [3, 2, 1, ""]) {
    minPort = Number(`${n}${devPort}`) + 100;
    maxPort = minPort + 100;
    if (maxPort < 65000) {
      break;
    }
  }

  if (maxPort >= 65000) {
    throw new Error("the devPort in package.json should be less than 64000");
  }

  const range = maxPort - minPort + 1;
  const startOffset = Math.floor(Math.random() * range);

  const ports = Array.from({ length: range }, (_, i) => {
    return minPort + ((startOffset + i) % range);
  });

  const freePort = await ports.reduce(
    async (prevPromise, port) => {
      const freePort = await prevPromise;
      if (freePort) {
        return freePort;
      }
      const isFree = await isPortFree(port);
      return isFree ? port : undefined;
    },
    Promise.resolve(undefined as number | undefined),
  );

  if (!freePort) {
    throw new Error(`No free ports found in range ${minPort}-${maxPort}`);
  }

  return freePort;
};

const isPortFree = (port: number): Promise<boolean> => {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", () => resolve(false));

    server.once("listening", () => {
      server.close();
      resolve(true);
    });

    server.listen(port, "127.0.0.1");
  });
};
