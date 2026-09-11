import { ValidationError } from "../errors";
import {
  type RequestBodyTarget,
  type RequestMetadataParser,
  type RequestValidationTarget,
  RequestValidationTargets,
  type ValidationErrorEntry,
} from "../types";
import { debugRouteEntry } from "./debug";
import {
  type HandlerDefinition,
  type HTTPMethod,
  type MiddlewareDefinition,
  type Route,
  type RouteSource,
  StateKey,
  type UseSlots,
} from "./types";
import { use } from "./use";

export const createRoutes = <MiddlewareT, MiddlewareR>(
  routeSources: Array<RouteSource<MiddlewareT>>,
  {
    productionBuild,
    createMetaparsers,
    createBodyparsers,
    responseResolver,
    globalMiddleware,
  }: {
    productionBuild: boolean;
    createMetaparsers: (
      r: RouteSource<MiddlewareT>,
      // biome-ignore lint: any
      ctx: any,
    ) => Record<RequestMetadataParser, () => unknown>;
    createBodyparsers: (
      r: RouteSource<MiddlewareT>,
      // biome-ignore lint: any
      ctx: any,
    ) => Record<
      RequestBodyTarget,
      // biome-ignore lint: any
      (opt?: any) => Promise<unknown>
    >;
    responseResolver: (
      // biome-ignore lint: any
      ctx: any,
      // biome-ignore lint: any
      body: any,
    ) => {
      status: number;
      contentType: string | null;
      body: () => Promise<unknown>;
    };
    // Global middleware applied to every route (e.g., logging)
    globalMiddleware: Array<MiddlewareDefinition<MiddlewareT>>;
  },
): Array<Route<MiddlewareR>> => {
  // NOTE:: prioritized middleware must run in this exact order!
  const prioritizedSlots: Array<keyof UseSlots | RegExp> = [
    "edge",
    /^edge:.+/,
    "validate:params",
    "validate:query",
    "validate:headers",
    "validate:cookies",
    "validate:json",
    "validate:form",
    "validate:raw",
    "validate:response",
  ];

  /**
   * Whether a slot name is one this list already positions.
   *
   * NOTE: a plain `includes` cannot answer this - the list mixes literal names
   * with patterns, and `edge:auth` is a member by virtue of matching `/^edge:.+/`,
   * not by being in the array.
   * */
  const isPrioritizedSlot = (slot: string): boolean => {
    return prioritizedSlots.some((entry) => {
      return typeof entry === "string" ? entry === slot : entry.test(slot);
    });
  };

  const stack: Array<Route<MiddlewareR>> = [];

  // Iterate over each route definition
  for (const routeSource of routeSources) {
    const { name, file, validationSchemas } = routeSource;

    const edgeMiddleware = [
      use(
        /**
         * Extends context with:
         *
         * - `ctx.metaparser[target]()` - lazy, cached meta parsers.
         *   Each parser runs at most once per request;
         *   subsequent calls return the cached result.
         *
         * - `ctx.bodyparser[target](opts?)` - lazy, cached body parsers.
         *   Each parser runs at most once per request;
         *   subsequent calls return the cached result.
         *   This allows both user middleware/handlers and validators
         *   to call the same parser without re-consuming the request stream.
         *
         * - `ctx.validated` - getter that returns all validated data collected so far
         *   (params, query, headers, cookies, json etc.) as a plain object.
         *
         * Cache is stored on `ctx[StateKey]` (a Symbol-keyed Map) to keep it
         * hidden from public API surface and serialization.
         * */
        function useExtendContext(
          ctx: Record<string | symbol, Map<string, unknown>>,
          next: Function,
        ) {
          if (!ctx[StateKey]) {
            const [metaparsers, bodyparsers] = [
              createMetaparsers(routeSource, ctx),
              createBodyparsers(routeSource, ctx),
            ];

            // initialize per-request cache
            ctx[StateKey] = new Map();

            Object.defineProperty(ctx, "metaparser", {
              value: Object.fromEntries(
                Object.entries(metaparsers).map(([target, parser]) => {
                  return [
                    target,
                    () => {
                      if (!ctx[StateKey].has(target)) {
                        ctx[StateKey].set(target, parser());
                      }
                      return ctx[StateKey].get(target);
                    },
                  ];
                }),
              ),
              enumerable: true,
            });

            Object.defineProperty(ctx, "bodyparser", {
              value: Object.fromEntries(
                Object.entries(bodyparsers).map(([target, parser]) => {
                  return [
                    target,
                    async (opt?: unknown) => {
                      if (!ctx[StateKey].has(target)) {
                        ctx[StateKey].set(target, await parser(opt));
                      }
                      return ctx[StateKey].get(target);
                    },
                  ];
                }),
              ),
              enumerable: true,
            });

            Object.defineProperty(ctx, "validated", {
              value: Object.keys(RequestValidationTargets).reduce(
                (map, target) => {
                  return Object.defineProperty(map, target, {
                    get() {
                      return ctx[StateKey].get(target);
                    },
                    enumerable: true,
                  });
                },
                {},
              ),
              enumerable: true,
            });
          }

          return next();
        },
        { slot: "edge" },
      ),
    ];

    const validationTargets: Array<
      [RequestValidationTarget, "metaparser" | "bodyparser"]
    > = [
      ["params", "metaparser"],
      ["query", "metaparser"],
      ["headers", "metaparser"],
      ["cookies", "metaparser"],
      ["json", "bodyparser"],
      ["form", "bodyparser"],
      ["raw", "bodyparser"],
    ];

    /**
     * Request validation - dynamically create one middleware per target
     * (query, headers, cookies, json, form, raw).
     *
     * Each middleware:
     * 1. Checks if a schema exists for the current HTTP method
     * 2. Skips if `runtimeValidation` is explicitly disabled
     * 3. Loads data via the appropriate source provided by metaparsers/bodyparsers.
     * 4. Validates via `schema.validate()` which throws on failure
     *
     * Middleware are assigned named slots (e.g. "validate:params", "validate:json")
     * so they can be replaced by user-defined middleware in the stack.
     *
     * All validation errors are thrown as `ValidationError` instances,
     * caught and formatted by the global error handler middleware upstream.
     * */
    const validationMiddleware = validationTargets.map(([target, key]) => {
      return use(
        async (
          // biome-ignore lint: any
          ctx: any,
          next: Function,
        ) => {
          const method = ctx.metaparser.method();
          const schema =
            target === "params"
              ? { ...validationSchemas[target] }
              : {
                  ...validationSchemas[target]?.[
                    method === "HEAD" ? "GET" : method
                  ],
                };
          if (schema.validate && schema.runtimeValidation !== false) {
            schema.validate(await ctx[key][target]());
          }
          return next();
        },
        {
          slot: `validate:${target}`,
          ...(target === "params"
            ? {
                // params validates regardless method;
              }
            : {
                // run only on methods that defined a schema for current target;
                // an empty array means it runs nowhere.
                on: Object.keys(
                  validationSchemas[target] || {},
                ) as Array<HTTPMethod>,
              }),
        },
      );
    });

    validationMiddleware.push(
      /**
       * Response validation - runs AFTER the handler (post-`next()`).
       *
       * Each response schema defines one or more variants, each with:
       * - expected status code
       * - optional content-type
       * - optional body schema
       *
       * All variants are checked; if at least one passes, validation succeeds.
       * If none pass, a ValidationError is thrown with collected errors from all variants.
       *
       * Activation rules:
       * - In dev/test mode: runs unless `runtimeValidation` is explicitly `false`
       * - In production: runs only if `runtimeValidation` is explicitly `true`
       *
       * Only attached to HTTP methods that have response schemas defined.
       * */
      use(
        async function useValidateResponse(
          // biome-ignore lint: any
          ctx: any,
          next: Function,
        ) {
          const method = ctx.metaparser.method();

          const variants =
            validationSchemas.response?.[method === "HEAD" ? "GET" : method] ||
            [];

          if (!Array.isArray(variants) || !variants.length) {
            return next();
          }

          // options are same for all variants
          const { runtimeValidation, customErrors } = variants[0];

          if (productionBuild) {
            // production build - skip if undefined or explicitly set to false
            if (
              runtimeValidation === undefined ||
              runtimeValidation === false
            ) {
              return next();
            }
          } else {
            // dev mode - skip only if explicitly set to false
            if (runtimeValidation === false) {
              return next();
            }
          }

          // run all downstream middleware (including the route handler)
          const maybeBody = await next();

          const {
            //
            status,
            contentType,
            body,
          } = responseResolver(ctx, maybeBody);

          const response: {
            status: number;
            contentType: string | null;
            body?: unknown;
          } = { status, contentType };

          // validate only 2xx responses
          if (Math.floor(response.status / 100) !== 2) {
            return;
          }

          // RFC 9110 §6.4.1 - content presence depends on method and status
          const skipBodyValidation =
            method === "HEAD" ||
            [204, 205].includes(response.status) ||
            variants.some((e) => e.contentType?.includes("json")) === false;

          if (!skipBodyValidation) {
            response.body = await body();
          }

          /**
           * Returns an array of validator functions for a single response variant.
           * Each validator checks one aspect (status, content-type, body)
           * and returns an error entry or undefined if the check passes.
           * */
          const variantValidators: (
            v: (typeof variants)[number],
          ) => Array<(i: number) => ValidationErrorEntry | undefined> = (
            schema,
          ) => {
            return [
              (i) => {
                return schema.status === response.status
                  ? undefined
                  : {
                      keyword: "Status",
                      path: `Variant #${i}`,
                      message: `expected: ${schema.status}; actual: ${response.status}`,
                    };
              },
              (i) => {
                if (
                  !schema.contentType ||
                  schema.contentType === response.contentType
                ) {
                  return undefined;
                }

                return {
                  keyword: "ContentType",
                  path: `Variant #${i}`,
                  message: `expected: ${schema.contentType}; actual: ${response.contentType}`,
                };
              },
              (i) => {
                if (!schema.check || "body" in response === false) {
                  // no body schema or response is bodyless
                  return;
                }
                return schema.check(response.body)
                  ? undefined
                  : {
                      keyword: "Body",
                      path: `Variant #${i}`,
                      message: schema.errorMessage(response.body),
                    };
              },
            ];
          };

          // collect errors across all variants; exit early if any variant passes
          const errors: Array<ValidationErrorEntry> = [];

          for (const [i, variant] of variants.entries()) {
            const variantErrors = variantValidators(variant).flatMap(
              (validator) => {
                const error = validator(i);
                return error ? [error] : [];
              },
            );
            if (!variantErrors.length) {
              // variant fully matched - response is valid
              return;
            }
            errors.push(...variantErrors);
          }

          const errorMessage = `The response did not match any of the expected formats`;
          const errorSummary = `${variants.length} variants checked, none valid`;

          // no variant passed validation
          throw new ValidationError([
            "response",
            {
              errors,
              errorMessage: customErrors?.error || errorMessage,
              errorSummary,
              route: name,
              data: response,
            },
          ]);
        },
        {
          slot: "validate:response",
          // run only on methods that defined a schema for response target
          // an empty array means it runs nowhere.
          on: Object.keys(
            validationSchemas.response || {},
          ) as Array<HTTPMethod>,
        },
      ),
    );

    // normalize route path
    const path = routeSource.path.replace(/\/+/g, "/").replace(/(.+)\/$/, "$1");

    // Include both middleware and HTTP method handlers
    const definitionItems = [
      ...routeSource.cascadingMiddleware,
      ...routeSource.definitionItems,
    ].flat();

    const routeMiddleware = definitionItems.filter(
      (e) => e.kind === "middleware",
    );

    /**
     * Every user-authored declaration of a slot, outermost first:
     * `api/use.ts`, then the cascading `use.ts` files, then the route itself.
     * */
    const slotDeclarations: Array<MiddlewareDefinition<MiddlewareT>> = [
      ...globalMiddleware,
      ...routeMiddleware,
    ];

    // built-in middleware, the fallback owner of the slots it ships with
    const builtinMiddleware: Array<MiddlewareDefinition<MiddlewareT>> = [
      ...edgeMiddleware,
      ...validationMiddleware,
    ];

    /**
     * The middleware that owns a slot.
     *
     * A slot is a named position with exactly one occupant: the innermost
     * declaration wins, so a route's `use` replaces a cascading `use.ts` entry,
     * which in turn replaces the global one - and any of them replaces the built-in.
     * Position is decided separately, by the outermost declaration, so an override
     * substitutes an implementation without moving the slot.
     * */
    const resolveSlot = (
      slot: string,
    ): MiddlewareDefinition<MiddlewareT> | undefined => {
      return (
        slotDeclarations.findLast((e) => e.options?.slot === slot) ||
        builtinMiddleware.find((e) => e.options?.slot === slot)
      );
    };

    const routeStack: Array<
      MiddlewareDefinition<MiddlewareT> | HandlerDefinition<MiddlewareT>
    > = [
      ...prioritizedSlots.flatMap((slot) => {
        if (typeof slot === "string") {
          const middleware = resolveSlot(slot);
          return middleware //
            ? [middleware]
            : [];
        }

        /**
         * A pattern entry (`edge:*`) is a family of slots, not a single position:
         * each distinct name in it gets its own place in the chain, in the order
         * the names were first declared, so `edge:ratelimit` and `edge:auth`
         * both run at the edge and either can be overridden on its own.
         * */
        const slotNames: Array<string> = [];

        for (const { options } of slotDeclarations) {
          const name = options?.slot;
          if (name && slot.test(name) && !slotNames.includes(name)) {
            slotNames.push(name);
          }
        }

        return slotNames.flatMap((name) => {
          const middleware = resolveSlot(name);
          return middleware //
            ? [middleware]
            : [];
        });
      }),

      ...globalMiddleware.flatMap((entry) => {
        if (!entry.options?.slot) {
          // no slot, including regardless
          return [entry];
        }
        if (isPrioritizedSlot(entry.options.slot)) {
          // already picked when inserted prioritized middleware, excluding
          return [];
        }
        // this declaration holds the position, an inner one may own the slot
        const middleware = resolveSlot(entry.options.slot);
        return middleware //
          ? [middleware]
          : [];
      }),

      ...definitionItems.flatMap((entry) => {
        const slot =
          entry.kind === "middleware" //
            ? entry.options?.slot
            : undefined;

        if (slot) {
          if (isPrioritizedSlot(slot)) {
            // already picked when inserted prioritized middleware, excluding
            return [];
          }
          if (globalMiddleware.some((e) => e.options?.slot === slot)) {
            // already picked when inserted global middleware, excluding
            return [];
          }
          if (routeMiddleware.find((e) => e.options?.slot === slot) !== entry) {
            // an outer declaration already holds this slot's position, excluding
            return [];
          }
          // this declaration holds the position, an inner one may own the slot
          const middleware = resolveSlot(slot);
          return middleware //
            ? [middleware]
            : [];
        }

        return [entry];
      }),
    ];

    for (const entry of routeStack) {
      if (entry.kind === "handler") {
        const middleware = routeStack.flatMap((e) => {
          if (e.kind === "middleware") {
            return !e.options?.on || e.options.on.includes(entry.method)
              ? [e]
              : [];
          }
          return [];
        });
        stack.push({
          name,
          path,
          file,
          method: entry.method,
          middleware: [
            ...middleware.flatMap((e) => e.middleware),
            ...entry.middleware,
          ] as Array<never>,
          debug: debugRouteEntry<MiddlewareT>({
            name,
            path,
            file,
            method: entry.method,
            middleware,
            handler: entry,
          }),
        });
      }
    }
  }

  return stack;
};
