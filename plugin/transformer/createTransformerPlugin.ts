import type { Plugin } from "vite";
import { perEnvironmentState } from "vite";
import type { VitePluginFn } from "../types.js";
import { createTransformer } from "../loader/createTransformer.js";
import type { Program } from "acorn";
import { resolveOptions } from "../config/resolveOptions.js";
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { getNodeEnv, isValidEnv } from "../config/getNodeEnv.js";

// import { getEnvironmentName } from "../env/plugin.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { resolveRegExp } from "../config/resolveRegExp.js";
import { userProjectRoot } from "../root.js";
import { createDefaultModuleID } from "../config/createModuleID.js";
import { buildClientPackagesPattern } from "../clientPackages/index.js";
import { detectClientModule, analyzeModule } from "react-server-loader/directives";
// rsl's acorn-based parse replaces the bundler's `this.parse`, which is
// Rollup (acorn) on Vite 6/7 but Oxc on Vite 8 — different AST shape. rsl's
// parser is JS-only (matching Rollup's, which `this.parse` always was at
// order:post once JSX is compiled away) and version-independent.
import { parse as rslParse } from "react-server-loader";
import { isViteInjectedCode } from "../loader/isViteInjectedCode.js";

export interface TransformerPluginOptions {
  name: string;
  /**
   * Optional. If omitted, sensible defaults are applied based on `name`:
   * - name === "client" -> ["client", "ssr"]
   * - name === "server" -> ["server"]
   */
  allowedEnvironments?: ("client" | "server" | "ssr")[];
  /**
   * Optional. If omitted, sensible defaults are applied based on `name`:
   * - name === "client" -> "client"
   * - name === "server" -> "server"
   */
  defaultEnvironment?: "client" | "server" | "ssr";
}

export const createTransformerPlugin = (
  options: TransformerPluginOptions
): VitePluginFn => {
  return (userOptions) => {
    const { name } = options;

    // CRITICAL: Use per-environment state to prevent cross-environment cache contamination
    // This fixes the issue where server environment cached modules affect client environment builds
    const transformationCache = perEnvironmentState<
      Map<string, { code: string; map: any }>
    >(() => new Map());
    const defaultEnvironment =
      options.defaultEnvironment ?? (name === "client" ? "client" : "server");
    const allowedEnvironments =
      options.allowedEnvironments ??
      (name === "client"
        ? defaultEnvironment === "client"
          ? ["client", "ssr"]
          : ["client"]
        : defaultEnvironment === "server"
        ? ["server", "ssr"]
        : ["server"]);
    const logPrefix = `[vite-plugin-react-server:transform-${defaultEnvironment}-as-${name}]`;

    const resolvedOptionsResult = resolveOptions(userOptions);
    if (resolvedOptionsResult.type === "error")
      throw resolvedOptionsResult.error;
    const { userOptions: resolvedUserOptions } = resolvedOptionsResult;

    let isBuild = true;
    let isSSR = true;
    const nodeEnv = getNodeEnv(process.env.NODE_ENV);
    let mode = nodeEnv;
    // Vite's base, captured at configResolved. Injected as a literal into the
    // client server-function proxy: this plugin is enforce:"post", so code we
    // emit here is NOT re-scanned for `import.meta.env` replacement — a literal
    // base is the robust way to give callServer its base URL.
    let viteBase = "/";
    let runtimeResolvedUserOptions = resolvedUserOptions;

    // Use global cache for transformation results to ensure consistent hashing across all plugin instances
    const outDir = resolvedUserOptions.build.outDir || "dist";
    const serverDir = join(
      outDir,
      resolvedUserOptions.build.server || "server"
    );
    const clientDir = join(
      outDir,
      resolvedUserOptions.build.client || "client"
    );
    const staticDir = join(
      outDir,
      resolvedUserOptions.build.static || "static"
    );
    const modulePattern = resolveRegExp(
      userOptions.autoDiscover?.modulePattern ??
        DEFAULT_CONFIG.AUTO_DISCOVER.modulePattern
    );
    const nodeModulesPattern = resolveRegExp(
      userOptions.autoDiscover?.vendorPattern ??
        DEFAULT_CONFIG.AUTO_DISCOVER.vendorPattern
    );
    // Whitelist of node_modules packages that should still go through the
    // RSC transform — libraries that use the per-file `"use client"`
    // convention internally (e.g. @chakra-ui/react). Without this opt-in,
    // their `"use client"` boundaries get inlined into the server bundle
    // and runtime CJS/ESM interop trips on `import { createContext } from
    // 'react'`.
    //
    // Read lazily (per-transform-call) and memoized by list identity, so
    // the auto-detected packages that `clientPackagesDiscoveryPlugin`
    // merges into `userOptions.clientPackages` during its async `config`
    // hook take effect for transform filtering without a separate
    // configResolved hook.
    let cachedPackagesRef: readonly string[] | undefined;
    let cachedPattern: RegExp | null = null;
    const getClientPackagesPattern = (): RegExp | null => {
      const pkgs =
        (userOptions as { clientPackages?: readonly string[] })
          .clientPackages ?? [];
      if (pkgs !== cachedPackagesRef) {
        cachedPackagesRef = pkgs;
        cachedPattern = buildClientPackagesPattern(pkgs);
      }
      return cachedPattern;
    };
    const noDist = (id: string) => {
      // Allow files from test fixtures and project root
      if (
        id.startsWith(userProjectRoot) ||
        id.startsWith(join(userProjectRoot, outDir)) ||
        id.startsWith(join(outDir, staticDir)) ||
        id.startsWith(join(outDir, serverDir)) ||
        id.startsWith(join(outDir, clientDir))
      ) {
        return true;
      }
      return false;
    };

    return {
      name: `vite-plugin-react-server:transform-${name}`,
      enforce: "post",
      // CRITICAL: Enable per-environment hooks during dev to prevent cache contamination
      perEnvironmentStartEndDuringDev: true,
      // Note: Removed applyToEnvironment - let transform hook handle filtering
      // With --app builds, applyToEnvironment may not be called correctly
      configResolved(config) {
        isBuild = config.command === "build";
        isSSR = Boolean(config.build.ssr);
        viteBase = config.base ?? "/";
        mode = config.mode as "development" | "production" | "test";
        if (!isValidEnv(mode)) {
          throw new Error(`Invalid mode: ${mode}`);
        }

        // CRITICAL: Re-resolve options with runtime mode to get correct importServerPath
        // This ensures test mode uses react-server-dom-esm/server.node instead of server
        // Force re-resolve to avoid cached moduleID functions from different build contexts
        //
        // transport:"webpack" swaps the registration import IN DEV ONLY: dev
        // evaluates the transformed modules live, so the emitted register*
        // import must come from the webpack server entry for the references
        // to be webpack-shaped ($$id "path#name"). Builds keep the bare esm
        // specifier — dist artifacts stay transport-agnostic and the edge
        // bake re-transports the whole graph with one alias (buildEdgeBundle).
        const devTransportLoader =
          config.command === "serve" && userOptions.transport === "webpack"
            ? {
                importServerPath:
                  userOptions.loader?.importServerPath ??
                  "react-server-loader/webpack/server",
                importClientPath:
                  userOptions.loader?.importClientPath ??
                  "react-server-loader/webpack/server",
              }
            : {};
        const runtimeOptionsResult = resolveOptions({
          ...userOptions,
          loader: {
            ...userOptions.loader,
            mode: mode,
            ...devTransportLoader,
          },
        }, true); // Force resolve to bypass cache
        if (runtimeOptionsResult.type === "success") {
          runtimeResolvedUserOptions = runtimeOptionsResult.userOptions;
        }

        // CRITICAL: Update moduleID function with correct configEnv for build mode
        // This ensures client component hashing uses the correct build context
        // ALWAYS recreate the moduleID to ensure it matches the current command
        if (runtimeResolvedUserOptions.loader) {
          runtimeResolvedUserOptions.loader.moduleID = createDefaultModuleID(
            runtimeResolvedUserOptions,
            {
              command: config.command,
              mode: config.mode,
              isSsrBuild: isSSR,
              isPreview: false,
            },
            mode
          );
        }

        // Note: condition override is set in env plugin during config phase
        // Verbose summary (config hook has void context, use config logger)
        const logger = config.customLogger || config.logger;
        // Only log in verbose mode
        if (runtimeResolvedUserOptions.verbose) {
          logger.info(
            `${logPrefix} configResolved: isBuild=${isBuild} isSSR=${isSSR} mode=${mode} allowed=${JSON.stringify(
              allowedEnvironments
            )} defaultEnv=${defaultEnvironment} importServerPath=${
              runtimeResolvedUserOptions.loader?.importServerPath
            }`
          );
        }
      },
      async buildStart() {
        // No longer load static manifest - rely on hash coordination to ensure consistent hashes
        // This removes the file I/O dependency and allows parallel builds
      },
      transform: {
        order: "post",
        // when transforming to:
        // dist/server / env=server - it adds registerClientReference and registerServerReference based on directive (ssg portable)
        // dist/client / env=ssr - removes use client directive and hides server modules, hides client entry or without exports (ssg portable)
        // dist/static / env=client  -  removes use client directive and hides server modules, emits client entry (and is browser portable)
        async handler(code, id, meta) {
          // Vite 8 (rolldown) makes the 3rd-arg options bag required with a
          // mandatory `moduleType`; read `ssr` defensively to work on 6/7/8.
          const ssr = meta?.ssr;
          const isWhitelistedClientPackage =
            getClientPackagesPattern()?.test(id) ?? false;
          if (
            (nodeModulesPattern.test(id) && !isWhitelistedClientPackage) ||
            !modulePattern.test(id) ||
            (!noDist(id) && !isWhitelistedClientPackage)
          ) {
            return null;
          }
          let [, normalizedPath] = resolvedUserOptions.normalizer(id);

          // Check if this is a built file that doesn't need transformation
          // Normalize paths to handle cross-platform differences
          const normalizedId = id.replace(/\\/g, "/");
          const normalizedServerDir = serverDir.replace(/\\/g, "/");
          const normalizedClientDir = clientDir.replace(/\\/g, "/");

          // Check if the file is from a build output directory
          const isFromServerBuild =
            normalizedId.includes(`/${normalizedServerDir}/`) ||
            normalizedId.includes(`dist/server/`);
          const isFromClientBuild =
            normalizedId.includes(`/${normalizedClientDir}/`) ||
            normalizedId.includes(`dist/client/`);
          const isFromStaticBuild = normalizedId.includes(`dist/static/`);

          // Check if this looks like a built/hashed file (should never be transformed)
          // Built files have hashes and are already processed
          const isBuiltFile =
            isBuild && /-[a-zA-Z0-9_]{6,}\.(js|mjs|cjs)$/.test(normalizedId);

          // Check if this file is already transformed (contains registerClientReference)
          const isAlreadyTransformed = code.includes(
            runtimeResolvedUserOptions.loader?.registerClientReferenceName ??
              "registerClientReference"
          );
          if (isAlreadyTransformed) {
            if (runtimeResolvedUserOptions.verbose) {
              this.environment?.logger?.info(
                `[react-${name}-transform] Encountered already transformed file: ${id}. This indicates two transformers are running on the same file: ${
                  this.environment?.name
                } and ${Object.entries(this.environment?.plugins ?? {})
                  .map(([name, plugin]) => `${name} (${plugin.name})`)
                  .join(", ")}`
              );
              this.environment?.logger?.info('')
            }
            return {
              code: code,
              map: null,
            };
          }

          // Check if we've already transformed this module to avoid double-hashing
          // Include environment context in cache key since different environments need different transformations
          const isServerEnv = this.environment?.name === "server";
          // CRITICAL: Use per-environment cache to prevent cross-environment contamination
          const envCache = transformationCache(this);
          const cacheKey = `${normalizedPath}:${
            isServerEnv ? "server" : "client"
          }:${code}`;
          if (envCache.has(cacheKey)) {
            if (runtimeResolvedUserOptions.verbose) {
              this.environment?.logger?.info(
                `[react-${name}-transform] Using cached transformation for: ${normalizedPath} (${
                  isServerEnv ? "server" : "client"
                }) env=${this.environment?.name}`
              );
            }
            return envCache.get(cacheKey);
          }

          // Get the original source content for consistent hashing
          // Read the file directly to ensure we use the original content, not transformed code
          let originalSourceContent: string;
          try {
            const sourcePath = resolve(userProjectRoot, id);
            originalSourceContent = readFileSync(sourcePath, "utf-8");
          } catch (error) {
            // Fallback to the provided code if we can't read the file
            originalSourceContent = code;
          }

          // Robustly determine whether this module is a client reference by a
          // top-of-file `"use client"` DIRECTIVE (not by the `.client.`
          // filename). `detectClientModule` parses with Rollup's JSX-aware
          // `this.parse` and reuses `analyzeDirectives` internally; if the
          // parse fails it falls back to the parser-free char-scanner. We
          // pass `source` only (no `moduleId`) so the filename pattern is
          // skipped here — that path is handled downstream in
          // `createModuleID` via the same helper.
          const isClientByDirective = detectClientModule({
            source: code,
            parseFn: (src) => rslParse(src).ast as unknown as Program,
          });

          // Use the original normalized path for moduleID function calls
          // This ensures registerClientReference calls use the correct paths.
          // Pass `isClientByDirective` so the moduleID function applies the
          // hosted-path transform (strip moduleBase → extension map → hash →
          // moduleBasePath prefix) to directive-only client modules that have
          // no `.client.` suffix — the default moduleID can't parse raw TSX to
          // detect the directive itself.
          let finalModuleID = runtimeResolvedUserOptions.loader?.moduleID
            ? runtimeResolvedUserOptions.loader.moduleID(
                normalizedPath,
                originalSourceContent,
                isClientByDirective
              )
            : normalizedPath;

          // Client references must be HOSTED: their moduleID has to start with
          // the bundler's baseURL or react-server-dom-esm's
          // `serializeClientReference` throws "Attempted to load a Client
          // Module outside the hosted root". The html-worker then materializes
          // each ref by importing `<dist/client>/<moduleID>`, so the leading
          // `/` is what makes that resolve to disk.
          //
          // This covers two cases the default moduleID returns unprefixed:
          //   1. whitelisted node_modules client packages (no `.client.`
          //      suffix; bundled to `dist/client/node_modules/<pkg>/…` via
          //      `noExternal: clientPackages`), and
          //   2. first-party directive-only client modules (no `.client.`
          //      suffix; emitted to `dist/client/<path>` by the SSR build —
          //      see resolveClientReferencesPlugin's input collection).
          const needsHosting = isWhitelistedClientPackage || isClientByDirective;
          if (
            needsHosting &&
            typeof finalModuleID === "string" &&
            !finalModuleID.startsWith("/")
          ) {
            finalModuleID = "/" + finalModuleID;
          }

          if (runtimeResolvedUserOptions.verbose) {
            this.environment?.logger?.info(
              `[react-${name}-transform] ModuleID transformation: ${normalizedPath} -> ${finalModuleID}`
            );
          }

          // Determine if this is a server environment
          // Check both the environment name and if we're doing server-side rendering for static generation
          const envName = this.environment?.name?.toLowerCase() || "";
          const isServerEnvironment = envName === "server" || envName === "rsc" || envName === "react-server";

          const transformer = createTransformer({
            parseFn: (source) => {
              return rslParse(source).ast as unknown as Program;
            },
            options: {
              loader: runtimeResolvedUserOptions.loader,
              verbose: runtimeResolvedUserOptions.verbose,
              panicThreshold: runtimeResolvedUserOptions.panicThreshold,
              logger: this.environment?.logger,
              moduleBase: userOptions.moduleBase ?? "",
              // Vite injects preamble (e.g. __vitePreload for dynamic imports)
              // above a module's own source; don't flag it as code-before-directive.
              tolerateLeadingCode: isViteInjectedCode,
            },

            // Pass the actual environment context to the transformer
            // Only the actual "server" environment should transform client components to registerClientReference
            // SSR environment needs actual React components, not placeholders
            isServerEnvironment: isServerEnvironment,
            ssr: ssr,
          });

          // Skip files from output directories that are already built and transformed
          // But allow transformation of server-built client components that need registerClientReference

          if (
            isFromServerBuild ||
            isFromClientBuild ||
            isFromStaticBuild ||
            isBuiltFile
          ) {
            const buildType = isFromServerBuild
              ? "server"
              : isFromClientBuild
              ? "client"
              : isFromStaticBuild
              ? "static"
              : "built";

            // Allow transformation of server-built client components
            if (
              isFromServerBuild &&
              runtimeResolvedUserOptions.loader?.isClientComponentByName?.(id)
            ) {
              if (runtimeResolvedUserOptions.verbose) {
                this.environment?.logger?.info(
                  `[react-${name}-transform] Allowing transformation of server-built client component: ${id}`
                );
              }
              // Don't skip - let it fall through to transformer
            } else {
              if (runtimeResolvedUserOptions.verbose) {
                this.environment?.logger?.info(
                  `[react-${name}-transform] Skipping built file from ${buildType} build: ${id}`
                );
              }
              return {
                code: code,
                map: null,
              };
            }
          }

          // Client-imported server functions ("use server" module imported by a
          // "use client" component). In a non-server environment we must NOT
          // bundle the server code in — instead replace each export with a
          // reference (Server Functions parity; restores pre-rsl loader
          // behaviour the extraction dropped). The two non-server environments
          // need different shapes:
          //  - BROWSER (env=client): a real createServerReference(id, callServer)
          //    proxy that POSTs to the server. The hosted id mirrors what the
          //    server registers (the module's moduleID), so it resolves through
          //    the existing action endpoint / gate.
          //  - SSR (env=ssr): the proxy's browser transport can't initialize in
          //    the Node SSR/SSG render (it throws while prerendering). The server
          //    function is never CALLED during render (it's an event handler), so
          //    emit a render-safe stub that only throws if wrongly invoked. This
          //    also keeps server-only code out of the SSR bundle.
          if (!isServerEnvironment) {
            const serverAnalysis = await analyzeModule(code, {
              loader: { parse: (src: string) => this.parse(src) as Program },
            });
            if (
              serverAnalysis.type === "success" &&
              serverAnalysis.directiveInfo?.fileLevel?.type === "server"
            ) {
              const exportNames = Array.from(
                serverAnalysis.exports.exports.values()
              ).map((e) => e.exportName);
              if (exportNames.length > 0) {
                if (this.environment?.name === "client") {
                  const proxy = [
                    `import { createServerReference } from "react-server-dom-esm/client.browser";`,
                    `import { createCallServer } from "vite-plugin-react-server/utils";`,
                    `const callServer = createCallServer(${JSON.stringify(viteBase)});`,
                    ...exportNames.map(
                      (n) =>
                        `export const ${n} = createServerReference(${JSON.stringify(
                          `${finalModuleID}#${n}`
                        )}, callServer);`
                    ),
                  ].join("\n");
                  return { code: proxy, map: null };
                }
                const stub = exportNames
                  .map(
                    (n) =>
                      `export const ${n} = () => { throw new Error(${JSON.stringify(
                        `Server function "${n}" cannot run during SSR; it executes in the browser via a server reference.`
                      )}); };`
                  )
                  .join("\n");
                return { code: stub, map: null };
              }
            }
          }

          const transformResult = await transformer(
            code,
            normalizedPath,
            finalModuleID
          );

          // If transformer returns null (e.g., for built files), return original code
          if (!transformResult) {
            return { code, map: null };
          }

          const { code: transformed, map } = transformResult;

          // Store the transformation result in per-environment cache
          const result = { code: transformed, map };
          envCache.set(cacheKey, result);

          // Logging for verbose mode
          if (runtimeResolvedUserOptions.verbose) {
            const hasDirectives =
              code.includes('"use client"') ||
              code.includes('"use server"') ||
              code.includes("'use client'") ||
              code.includes("'use server'");

            if (transformed !== code) {
              this.environment?.logger?.info(
                `[react-${name}-transform] ` +
                  id.split("/").pop() +
                  (code.startsWith('"use client"') ? " (client)" : "") +
                  (hasDirectives ? " (directives processed)" : "")
              );
              this.environment?.logger?.info(
                `[react-${name}-transform] ` + transformed.slice(0, 100) + "..."
              );
            } else if (hasDirectives) {
              this.environment?.logger?.info(
                `[react-${name}-transform] ` +
                  id.split("/").pop() +
                  " (directives already processed)"
              );
            }
          }

          return result;
        },
      },
    } as Plugin;
  };
};
