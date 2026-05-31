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
import { detectClientModule } from "../loader/directives/detectClientModule.js";

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
        mode = config.mode as "development" | "production" | "test";
        if (!isValidEnv(mode)) {
          throw new Error(`Invalid mode: ${mode}`);
        }

        // CRITICAL: Re-resolve options with runtime mode to get correct importServerPath
        // This ensures test mode uses react-server-dom-esm/server.node instead of server
        // Force re-resolve to avoid cached moduleID functions from different build contexts
        const runtimeOptionsResult = resolveOptions({
          ...userOptions,
          loader: {
            ...userOptions.loader,
            mode: mode,
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
        async handler(code, id, { ssr } = {}) {
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
            parseFn: (src, opts) => this.parse(src, opts) as Program,
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
              const ast = this.parse(source, {
                allowReturnOutsideFunction: true,
                jsx: true,
              }) as Program;
              return ast;
            },
            options: {
              loader: runtimeResolvedUserOptions.loader,
              verbose: runtimeResolvedUserOptions.verbose,
              panicThreshold: runtimeResolvedUserOptions.panicThreshold,
              logger: this.environment?.logger,
              moduleBase: userOptions.moduleBase ?? "",
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
