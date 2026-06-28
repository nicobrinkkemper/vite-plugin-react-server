import {
  createLogger,
  defaultClientConditions,
  defaultServerConditions,
  type ConfigEnv,
  type UserConfig,
} from "vite";
import type {
  ResolvedUserConfig,
  ResolvedUserOptions,
  AutoDiscoveredFiles,
} from "../types.js";
import { join, resolve } from "node:path";
import { readFileSync, existsSync } from "node:fs";
// Vite 8 swaps Rollup→Rolldown; source bundle types from Vite's version-agnostic Rollup namespace.
import type { Rollup } from "vite";
type OutputOptions = Rollup.OutputOptions;
type PreRenderedAsset = Rollup.PreRenderedAsset;
type PreRenderedChunk = Rollup.PreRenderedChunk;
import { DEFAULT_CONFIG } from "./defaults.js";
import { getNodeEnv } from "./getNodeEnv.js";
import { REACT_CONDITION, type ReactCondition } from "./getCondition.js";
import { getEnvValue, setEnvValue } from "../env/getEnvKey.js";
import {
  mergeClientPackagesNoExternal,
  mergeClientPackagesOptimizeDepsExclude,
} from "../clientPackages/index.js";
import { createRollupLikeHash } from "./createRollupLikeHash.js";

const stashedUserConfig: Record<string, ResolvedUserConfig | null> = {};
let originalConfig: UserConfig | null = null;
export type ResolveUserConfigProps = {
  condition: ReactCondition;
  config: UserConfig;
  configEnv: ConfigEnv;
  userOptions: ResolvedUserOptions;
  autoDiscoveredFiles: AutoDiscoveredFiles;
  forceResolve?: boolean;
  ssr?: boolean;
};

export type ResolveUserConfigReturn =
  | { type: "success"; userConfig: ResolvedUserConfig }
  | { type: "error"; error: unknown };

export type ResolveUserConfigFn = (
  props: ResolveUserConfigProps
) => ResolveUserConfigReturn;

export const resolveUserConfig: ResolveUserConfigFn =
  function _resolveUserConfig({
    condition,
    config,
    configEnv,
    userOptions,
    autoDiscoveredFiles,
    forceResolve = false,
    ssr = undefined,
  }) {
    if (!forceResolve && originalConfig == null) {
      originalConfig = config;
    } else if (originalConfig != null && config !== originalConfig) {
      forceResolve = true;
    }

    ssr =
      typeof ssr === "boolean"
        ? ssr
        : typeof config.build?.ssr === "boolean"
        ? config.build?.ssr
        : condition === REACT_CONDITION.server
        ? true
        : typeof configEnv.isSsrBuild === "boolean"
        ? configEnv.isSsrBuild
        : false;

    if (condition === REACT_CONDITION.server && !ssr) {
      const logger = config.customLogger ?? createLogger();
      logger.warn(
        "react-server build should be ssr, but is was manually set to false. This may not work as expected."
      );
    }
    const envDir =
      condition === REACT_CONDITION.client && ssr
        ? userOptions.build.client
        : condition === REACT_CONDITION.client
        ? userOptions.build.static
        : userOptions.build.server;
    const envId = `${envDir}${ssr ? "-ssr" : ""}`;

    if (stashedUserConfig[envId] && !forceResolve) {
      return {
        type: "success",
        userConfig: stashedUserConfig[envId],
      };
    }

    // Get existing inputs

    const handleSsrEntryName = (
      info: PreRenderedChunk,
      input: string | null,
      fallback: (
        info: PreRenderedChunk,
        ssr: boolean,
        sourceContent?: string
      ) => string,
      ssr: boolean
    ) => {
      // Read source content for consistent hashing across all environments
      let sourceContent: string | undefined;
      if (input) {
        try {
          const sourcePath = resolve(userOptions.projectRoot, input);
          if (existsSync(sourcePath)) {
            sourceContent = readFileSync(sourcePath, "utf-8");
          }
        } catch (error) {
          // Fallback to filename-based hashing if source file can't be read
        }
      }

      if (!ssr || !input) {
        if (typeof fallback === "function") {
          return fallback(info, false, sourceContent);
        }
        return userOptions.normalizer(info.name)[0];
      }
      const normalized = userOptions.normalizer(input);
      let value = normalized[1];
      if (value.startsWith(userOptions.moduleBasePath)) {
        value = value.slice(userOptions.moduleBasePath.length);
      }

      // Apply the same hash function for server environment to ensure consistency
      // This ensures that client components have the same hash across all environments
      if (typeof fallback === "function") {
        return fallback(info, true, sourceContent);
      }
      return userOptions.normalizer(info.name)[0];
    };

    const handleSsrAssetName = (
      info: PreRenderedAsset,
      input: string | null,
      fallback: (info: PreRenderedAsset, ssr: boolean) => string,
      ssr: boolean
    ) => {
      if (info.source === "") {
        return "";
      }

      // Check if this is a CSS file
      const isCssFile =
        input?.endsWith(".css") ||
        info.names?.some((name) => name.endsWith(".css"));

      if (!ssr || !input || isCssFile) {
        if (typeof fallback === "function") {
          return fallback(info, ssr);
        }
        return userOptions.normalizer(info.names[0])[0];
      }

      // First check if we have a static manifest entry for consistent module ID resolution
      const normalized = userOptions.normalizer(input);
      let value = normalized[1];
      if (value.startsWith(userOptions.moduleBasePath)) {
        value = value.slice(userOptions.moduleBasePath.length);
      }

      // Note: staticManifest is not available during auto-discovery phase
      // It's loaded later during the build process

      // Fall back to the user's assetFile function for consistent behavior
      return fallback(info, ssr);
    };
    const userDefinedOutput = config.build?.rollupOptions?.output;
    const hasOtherOutput =
      Array.isArray(userDefinedOutput) && userDefinedOutput.length > 1;
    const hasValidOutput = userDefinedOutput && !hasOtherOutput;
    const hasObjectOutput =
      userDefinedOutput &&
      !hasOtherOutput &&
      typeof userDefinedOutput === "object" &&
      userDefinedOutput !== null;

    const userDefinedAssetFileNames = hasObjectOutput
      ? "assetFileNames" in userDefinedOutput
        ? userDefinedOutput.assetFileNames
        : undefined
      : // find the other asset file names
      hasOtherOutput
      ? (userDefinedOutput.find((o) => o?.assetFileNames) as OutputOptions)
          ?.assetFileNames
      : undefined;

    const userDefinedChunkFileNames = hasValidOutput
      ? "chunkFileNames" in userDefinedOutput
        ? userDefinedOutput.chunkFileNames
        : undefined
      : undefined;
    const userDefinedEntryFileNames = hasValidOutput
      ? "entryFileNames" in userDefinedOutput
        ? userDefinedOutput.entryFileNames
        : undefined
      : undefined;

    const stashedReturns: Record<string, string> = {};
    // Rollup's preserveModulesRoot works in reverse of what you'd expect:
    // - When user wants preservation (true): pass undefined to Rollup (don't strip anything)
    // - When user wants stripping (false): pass moduleBase to Rollup (strip this path)
    // For static builds: use empty string to preserve only module names (not paths) to prevent _virtual files
    const preserveModulesRootString =
      userOptions.build.preserveModulesRoot === false
        ? userOptions.moduleBase // Strip src/ from output paths
        : ""; // Keep src/ in output paths by setting root to empty string
    

    // For static builds (browser/ESM): bundle everything - no need to preserve modules or node_modules structure
    // For client/server environments (SSR): preserve modules to maintain module structure for server-side rendering
    // Use preserveModules: true for SSR, but for static builds use false to prevent _virtual files
    const shouldPreserveModules = ssr || condition === REACT_CONDITION.server;
    
    const pluginOutput = {
      // For static builds: false to bundle everything and prevent _virtual files
      // For SSR builds: use preserveModules with preserveModulesRoot set to preserve only module names (not paths)
      // This prevents _virtual files by flattening the output structure
      preserveModules: shouldPreserveModules,
      // For static builds: undefined (not needed when preserveModules is false)
      // For SSR builds: set to empty string to preserve only module names, preventing _virtual files
      preserveModulesRoot: shouldPreserveModules ? preserveModulesRootString : undefined,
      entryFileNames:
        userDefinedEntryFileNames ??
        ((info) => {
          const input =
            info.facadeModuleId ??
            info.name + userOptions.build.moduleExtension;
          const inputId = input + (ssr ? "-ssr" : "");
          if (!stashedReturns[inputId]) {
            const r = handleSsrEntryName(
              info,
              input,
              userOptions.build.entryFile,
              ssr
            );

            stashedReturns[inputId] = r ?? info.name;
          }
          // in the case of empty basePath, it will not be sliced from the path, so, we need to slice it here
          // at the last possible moment as to not confuse the rest of the logic around the basePath
          return stashedReturns[inputId].slice(
            Number(stashedReturns[inputId].startsWith("/"))
          );
        }),
      assetFileNames:
        userDefinedAssetFileNames ??
        ((info) => {
          const input = info.originalFileNames[0];
          const inputId = input + (ssr ? "-ssr" : "");

          if (!stashedReturns[inputId]) {
            const r = handleSsrAssetName(
              info,
              input,
              userOptions.build.assetFile,
              ssr
            );

            stashedReturns[inputId] =
              r ??
              join(
                userOptions.build.preserveModulesRoot === false &&
                  userOptions.build.assetsDir
                  ? userOptions.build.assetsDir
                  : "",
                userOptions.normalizer(input)[0]
              );
          }
          // in the case of empty basePath, it will not be sliced from the path, so, we need to slice it here
          // at the last possible moment as to not confuse the rest of the logic around the basePath
          return stashedReturns[inputId].slice(
            Number(stashedReturns[inputId].startsWith("/"))
          );
        }),
      chunkFileNames:
        userDefinedChunkFileNames ??
        ((info) => {
          const input =
            info.facadeModuleId ??
            info.name + userOptions.autoDiscover.modulePattern.source;
          const inputId = input + (ssr ? "-ssr" : "");

          if (!stashedReturns[inputId]) {
            const r = handleSsrEntryName(
              info,
              input,
              userOptions.build.chunkFile,
              ssr
            );

            stashedReturns[inputId] = r ?? info.name;
          }
          // in the case of empty basePath, it will not be sliced from the path, so, we need to slice it here
          // at the last possible moment as to not confuse the rest of the logic around the basePath
          return stashedReturns[inputId].slice(
            Number(stashedReturns[inputId].startsWith("/"))
          );
        }),
      format: "esm",
      exports: "named",
    } satisfies OutputOptions;

    const newOutput = Array.isArray(config.build?.rollupOptions?.output)
      ? [...(config.build?.rollupOptions?.output || null), pluginOutput]
      : typeof config.build?.rollupOptions?.output === "object" &&
        config.build?.rollupOptions?.output !== null
      ? [config.build?.rollupOptions?.output, pluginOutput]
      : pluginOutput;
    
    const vitePrefix = config.envPrefix ?? DEFAULT_CONFIG.ENV_PREFIX;

    // Get environment variables (env vars take precedence over config)
    const primaryPrefix =
      typeof vitePrefix === "string" ? vitePrefix : vitePrefix[0];
    const envBaseUrl = getEnvValue("BASE_URL", primaryPrefix);
    const effectiveModuleBaseURL =
      envBaseUrl != null && envBaseUrl !== ""
        ? envBaseUrl
        : userOptions.moduleBaseURL;

    const envPublicOrigin = getEnvValue("PUBLIC_ORIGIN", primaryPrefix);
    const effectivePublicOrigin =
      envPublicOrigin != null ? envPublicOrigin : userOptions.publicOrigin;

    // Single source of truth for the build/runtime mode.
    //
    // Rule (per maintainer): if the user EXPLICITLY set the mode, honor it;
    // otherwise mirror NODE_ENV. No throwing on a "contradiction" — explicit
    // intent always wins.
    //
    // What counts as "explicit" (empirically verified against Vite 6):
    //   - `config.mode` is undefined unless the user passes `--mode <m>` (Vite
    //     propagates the CLI arg into `config.mode`) OR authors `mode` in their
    //     vite config. It is NOT pre-populated with the command default, so its
    //     mere presence is a reliable "user set this" signal.
    //   - `configEnv.mode`, by contrast, IS pre-populated with the command
    //     default ("production" for `vite build`, "development" for serve), so
    //     it cannot distinguish explicit intent and must not gate this choice.
    //
    // When no explicit mode is given we mirror NODE_ENV (normalized by
    // getNodeEnv). This makes `NODE_ENV=development vite build` produce a dev
    // build even though Vite's command default mode is "production".
    const explicitMode =
      typeof config.mode === "string" && config.mode !== ""
        ? config.mode
        : undefined;
    const mode = explicitMode ?? getNodeEnv();

    // Calculate effective values based on command and environment
    // Prioritize userOptions.projectRoot when explicitly set, regardless of config.root
    // This ensures Environment API environments use their specific project roots
    const effectiveProjectRoot =
      userOptions.projectRoot || config.root || "";

    // Calculate moduleRootPath based on command and environment
    // During serve (development): use moduleBasePath (source paths)
    // During build (production): use build output paths
    let effectiveModuleRootPath: string;
    if (configEnv.command === "serve") {
      // In development/serve mode, use moduleBasePath for source paths
      // preserve module root, if true, set as moduleBasePath
      effectiveModuleRootPath = userOptions.moduleBasePath || "/";
    } else {
      // In production/build mode, use build output paths
      // The RSC stream contains references like "src/components/Link.client.tsx"
      // But the compiled files are in dist/client/components/Link.client-CE-JGRqa.js
      // the manifest maps them from the client folder, so this the correct root for a build
      effectiveModuleRootPath = join(
        effectiveProjectRoot,
        userOptions.build.outDir,
        userOptions.build.client,
        !userOptions.moduleBasePath.startsWith("/") ? "/" : ""
      );
      if (
        !userOptions.build.preserveModulesRoot &&
        !userOptions.moduleBasePath.startsWith(userOptions.moduleBase)
      ) {
        effectiveModuleRootPath = join(
          effectiveModuleRootPath,
          userOptions.moduleBase,
          userOptions.moduleBasePath === "" ? "/" : userOptions.moduleBasePath
        );
      }
    }

    const minify = config.build?.minify;

    // Packages that internally use the per-file `"use client"` convention
    // (e.g. @chakra-ui/react). The discovery plugin (registered first in
    // both orchestrators) populates this list with auto-detected packages
    // before this hook runs; users can also add to it manually via the
    // `clientPackages` option.
    //
    // Three things happen here:
    //   1. `optimizeDeps.exclude` keeps esbuild's pre-bundle from stripping
    //      the per-file `"use client"` directives before our transform.
    //   2. `noExternal` (legacy `ssr.noExternal` AND Vite-6 environment-
    //      aware `resolve.noExternal`) makes Rollup inline these packages
    //      into the server bundle, where our transform converts each
    //      `"use client"` module to a `registerClientReference` stub.
    //   3. Each `"use client"` module emits as a chunk under
    //      `dist/client/node_modules/<pkg>/...` thanks to Vite's natural
    //      preserved-modules handling — those paths match the moduleIDs
    //      we generate in `createTransformerPlugin`, so the html-worker
    //      can resolve client refs at SSG-render time.
    const clientPackages: readonly string[] =
      (userOptions as { clientPackages?: readonly string[] }).clientPackages ??
      [];
    const mergedNoExternal = mergeClientPackagesNoExternal(
      clientPackages,
      config.ssr?.noExternal
    );
    const srrConfig = {
      ...config.ssr,
      target: config.ssr?.target ?? "node",
      noExternal: mergedNoExternal,
      optimizeDeps: {
        ...config.ssr?.optimizeDeps,
        include: config.ssr?.optimizeDeps?.include ?? [
          "react",
          "react-dom",
          "react-server-dom-esm/client",
        ],
        exclude: mergeClientPackagesOptimizeDepsExclude(
          clientPackages,
          config.ssr?.optimizeDeps?.exclude
        ),
      },
      resolve: {
        ...config.ssr?.resolve,
        externalConditions: config.ssr?.resolve?.externalConditions ?? [
          "react-server",
        ],
      },
    };
    let publicOrigin = effectivePublicOrigin ?? DEFAULT_CONFIG.PUBLIC_ORIGIN;
    const port =
      typeof config.server?.port === "number" ? config.server?.port : 5173;
    const strictPort = config.server?.strictPort ?? true;
    const host =
      typeof config.server?.host === "string"
        ? config.server?.host
        : "localhost";
    const base =
      effectiveModuleBaseURL ?? config.base ?? DEFAULT_CONFIG.MODULE_BASE_URL;
    if (configEnv.command === "serve" && !configEnv.isPreview) {
      // In dev mode, use empty publicOrigin so the client uses window.location.origin.
      // This avoids hardcoding a port that may change if the configured port is taken.
      publicOrigin = "";
    }
    // Use the single authoritative `mode` resolved above (NOT configEnv.mode)
    // so the React build define and vprs's internal mode can never diverge —
    // in particular so a config-file `mode` or `NODE_ENV` propagates into the
    // `process.env.NODE_ENV` / `import.meta.env.MODE` defines that select the
    // dev-vs-prod React build.
    const isDev = mode === 'development' || configEnv.command === 'serve';
    const ssrDefine = {
      [`process.env.${primaryPrefix}BASE_URL`]: `"${base}"`,
      [`process.env.${primaryPrefix}PUBLIC_ORIGIN`]: `"${publicOrigin}"`,
      [`process.env.NODE_ENV`]: `"${mode}"`,
      [`process.env.VITE_DEV`]: isDev ? 'true' : 'false',
      [`process.env.VITE_PROD`]: isDev ? 'false' : 'true',
    };
    const define = {
      ...config.define,
      // Standard Vite env vars
      [`import.meta.env.DEV`]: isDev ? 'true' : 'false',
      [`import.meta.env.PROD`]: isDev ? 'false' : 'true',
      [`import.meta.env.MODE`]: `"${mode}"`,
      [`import.meta.env.SSR`]: 'false', // Will be overridden per-environment
      // Custom env vars
      [`import.meta.env.BASE_URL`]: `"${base}"`,
      [`import.meta.env.PUBLIC_ORIGIN`]: `"${publicOrigin}"`,
      ...ssrDefine,
    };
    // Set process.env values to ensure they're available in process.env for server-side code
    if (!getEnvValue("BASE_URL", primaryPrefix)) {
      setEnvValue("BASE_URL", base, primaryPrefix);
    }
    if (!getEnvValue("PUBLIC_ORIGIN", primaryPrefix)) {
      setEnvValue("PUBLIC_ORIGIN", publicOrigin, primaryPrefix);
    }

    if (condition === REACT_CONDITION.client) {
      // client plugin build options (client plugin still outputs server files)
      const clientConfig = {
        ...config,
        root: effectiveProjectRoot,
        mode: mode,
        base: base,
        envPrefix: vitePrefix,
        resolve: {
          ...config.resolve,
          // Per-environment conditions are the load-bearing fix for the
          // dev-server case where the process was started with a global
          // `--conditions react-server` (the conventional `dev:rsc` script).
          // Without this explicit override, Node's module resolver sees
          // `react-server` for every environment and the client graph
          // pulls the `react-server` build of `react/jsx-runtime` — which
          // does not export `jsx` / `jsxs` — and `@chakra-ui/react`-style
          // packages' transitive CJS deps (`hoist-non-react-statics`,
          // etc.) lose their interop shims because they get resolved
          // through the SSR conditions path. Spelling the conditions out
          // here scopes `react-server` to the server env only.
          conditions: ssr
            ? [...defaultServerConditions]
            : [...defaultClientConditions],
          // For static builds (browser/ESM): don't externalize anything - bundle everything
          // For client/server builds (SSR): externalize React modules as usual
          external: ssr
            ? (config.resolve?.external ?? [
                "react",
                "react-dom",
                "react-server-dom-esm/client",
              ])
            : undefined, // Bundle everything for static builds
          // Vite 6 environments honor `resolve.noExternal` per-env, while the
          // legacy `ssr.noExternal` doesn't propagate. Mirror clientPackages
          // here too so the SSR env (outputs dist/client/) bundles them in
          // alongside user-authored .client.tsx files.
          noExternal: mergedNoExternal,
        },
        define: define,
        optimizeDeps: {
          ...config.optimizeDeps,
          // Vite's dep scanner defaults to crawling the build input for entry
          // points; in dev that resolves to the static `index.html`, which an
          // RSC dev server never serves — so the scan fails and logs
          // "failed to resolve rolldownOptions.input value: index.html".
          // Give it an explicit (empty) entry list to skip the html crawl;
          // deps are still optimized lazily / via ssr.optimizeDeps.include.
          // (optimizeDeps is a no-op in build, so the real index.html entry
          // there is unaffected.)
          entries: config.optimizeDeps?.entries ?? [],
        },
        ssr: srrConfig,
        server: {
          ...config.server,
          // common default for stricter server operations
          // and ensures tests that use a server will fail early
          // also, we can't set the public origin without a port
          port: port,
          strictPort: strictPort,
          host: host,
        },
        // client build options
        build: {
          ...config.build,
          modulePreload: config.build?.modulePreload ?? false,
          emptyOutDir: config.build?.emptyOutDir ?? true,
          outDir:
            config.build?.outDir ?? join(userOptions.build.outDir, envDir),
          assetsDir: config.build?.assetsDir ?? userOptions.build.assetsDir,
          copyPublicDir:
            typeof config.build?.copyPublicDir === "boolean"
              ? config.build?.copyPublicDir
              : !ssr,
          // modern browsers
          target: config.build?.target ?? ["esnext"],
          minify: minify,
          rollupOptions: {
            ...config.build?.rollupOptions,
            // Use HTML + client entries for non-SSR client builds (static)
            // and pure client module entries for SSR client builds.
            input: Object.fromEntries(
              Object.entries(
                ssr
                  ? autoDiscoveredFiles.clientInputs
                  : autoDiscoveredFiles.staticInputs
              ).map(([key, value]) => [
                key,
                value.slice(Number(value.startsWith("/"))),
              ])
            ),
            output: newOutput,
            preserveEntrySignatures:
              config.build?.rollupOptions?.preserveEntrySignatures ??
              "exports-only",
            // For static builds (browser/ESM): bundle everything including node_modules to avoid _virtual files
            // For client/server builds (SSR): externalize node_modules as usual
            external: ssr 
              ? (id: string, _parent?: string, _isResolved?: boolean) => {
                  // Don't externalize virtual modules - let Vite inline them during build
                  // Virtual modules are Vite's internal helpers that should be inlined, not externalized
                  if (id.includes("_virtual/") || id.startsWith("_virtual")) {
                    return false; // Let Vite handle virtual modules by inlining them
                  }
                  // Use user's external config or default to fsevents
                  const userExternal = config.build?.rollupOptions?.external ?? ["fsevents"];
                  if (Array.isArray(userExternal)) {
                    return userExternal.includes(id);
                  }
                  if (typeof userExternal === "function") {
                    return userExternal(id, _parent, _isResolved ?? false);
                  }
                  return false;
                }
              : (() => {
                  // For static builds, only externalize fsevents (macOS-specific, not needed in browser)
                  // Don't externalize node_modules - they should be bundled to avoid _virtual files
                  const userExternal = config.build?.rollupOptions?.external ?? ["fsevents"];
                  if (Array.isArray(userExternal)) {
                    // Only keep fsevents, filter out everything else (including node_modules)
                    return userExternal.filter((ext) => typeof ext === "string" && ext === "fsevents");
                  }
                  // If user provided a function or RegExp, wrap it to only allow fsevents
                  if (typeof userExternal === "function") {
                    return (id: string) => {
                      if (id === "fsevents") return true;
                      return false; // Don't externalize anything else for static builds
                    };
                  }
                  // Default: only fsevents
                  return ["fsevents"];
                })(),
          },
          ssr: ssr,
          manifest: config.build?.manifest ?? `.vite/manifest.json`,
          ssrManifest: config.build?.ssrManifest ?? false,
          ssrEmitAssets: config.build?.ssrEmitAssets ?? true,
          cssCodeSplit:
            typeof config.build?.cssCodeSplit === "boolean"
              ? config.build?.cssCodeSplit
              : true,
        },
      } satisfies ResolvedUserConfig;
      stashedUserConfig[envId] = clientConfig;
      return {
        type: "success",
        userConfig: clientConfig,
      };
    } else {
      const serverConfig = {
        ...config,
        root: effectiveProjectRoot,
        mode: mode,
        base: userOptions.moduleBaseURL,
        envPrefix: vitePrefix,
        resolve: {
          ...config.resolve,
          // The server env owns the `react-server` condition. Spelling it
          // out here (instead of relying on a process-wide
          // `--conditions react-server` flag the caller set in
          // `NODE_OPTIONS`) lets the client / ssr envs resolve the
          // default React build of `react/jsx-runtime` in the same Vite
          // process — which is what fixes the client interop regression
          // surfaced when a client component imports a client package
          // (Chakra, emotion, …) under a global `--conditions
          // react-server` shell.
          conditions: [
            "react-server",
            ...defaultServerConditions.filter((c) => c !== "react-server"),
          ],
          externalConditions: config.resolve?.externalConditions ?? [
            "react-server",
          ],
          // Force whitelisted client packages into the server bundle so the
          // RSC transform can convert their `"use client"` modules to client
          // references. Without this, Vite's default SSR externalization
          // leaves them as bare `import` statements that Node loads at SSG
          // time straight from `node_modules`, bypassing every transform.
          noExternal: mergedNoExternal,
        },
        define: define,
        ssr: srrConfig,
        // server build options
        build: {
          ...config.build,
          modulePreload: config.build?.modulePreload ?? false,
          emptyOutDir: config.build?.emptyOutDir ?? true,
          outDir:
            config.build?.outDir ?? join(userOptions.build.outDir, envDir),
          target: config.build?.target ?? "esnext", // Use esnext for pure ESM - no helpers needed
          minify: minify,
          ssr: ssr,
          manifest: config.build?.manifest ?? `.vite/manifest.json`,
          ssrManifest: config.build?.ssrManifest ?? false,
          ssrEmitAssets:
            typeof config.build?.ssrEmitAssets === "boolean"
              ? config.build?.ssrEmitAssets
              : true,

          copyPublicDir:
            typeof config.build?.copyPublicDir === "boolean"
              ? config.build?.copyPublicDir
              : !ssr,
          assetsDir: config.build?.assetsDir ?? userOptions.build.assetsDir,
          // Ensure CSS files are output to static directory
          cssCodeSplit:
            typeof config.build?.cssCodeSplit === "boolean"
              ? config.build?.cssCodeSplit
              : true,
          rollupOptions: {
            ...config.build?.rollupOptions,
            input: autoDiscoveredFiles.serverInputs,
            preserveEntrySignatures:
              config.build?.rollupOptions?.preserveEntrySignatures ?? "strict",
            // Externalize core React deps for the server bundle
            external: config.build?.rollupOptions?.external ?? [
              "react",
              "react/jsx-runtime",
              "react/jsx-dev-runtime",
              "react-dom",
              "react-server-dom-esm/server",
              "react-server-dom-esm/server.node",
            ],
            // Use the same output configuration as client environment for consistent hashing
            // This ensures client components have the same module IDs across all environments
            output: newOutput,
            // Configure Rollup context for server builds to use react-server conditions
            context: "module",
            // Set Node.js conditions for server builds
            plugins: [
              ...(Array.isArray(config.build?.rollupOptions?.plugins)
                ? config.build.rollupOptions.plugins
                : config.build?.rollupOptions?.plugins
                ? [config.build.rollupOptions.plugins]
                : []),
              {
                name: "react-server-conditions",
                buildStart() {
                  if (typeof this.environment.name !== "string") {
                    this.warn(
                      "Environment name is not a string, skipping react-server-conditions plugin"
                    );
                    return;
                  }

                  if (this.environment.name === "server") {
                    // Ensure react-server condition is available during server builds
                    if (!process.env.NODE_OPTIONS?.includes("react-server")) {
                      if(this.environment.config.define) {
                        this.environment.config.define = {
                          ...this.environment.config.define,
                          "process.env.NODE_OPTIONS": `"${process.env.NODE_OPTIONS} --conditions react-server"`
                        }
                      } else {
                        this.environment.config.define = {
                          "process.env.NODE_OPTIONS": `"${process.env.NODE_OPTIONS} --conditions react-server"`
                        }
                      }
                      // process.env.NODE_OPTIONS =
                      //   (process.env.NODE_OPTIONS || "") +
                      //   " --conditions react-server";
                    }
                  } else {
                    if (process.env.NODE_OPTIONS?.includes("react-server")) {
                      if(this.environment.config.define && this.environment.config.define["process.env.NODE_OPTIONS"] && this.environment.config.define["process.env.NODE_OPTIONS"].includes("react-server")) {
                        this.environment.config.define = {
                          ...this.environment.config.define,
                          "process.env.NODE_OPTIONS": this.environment.config.define["process.env.NODE_OPTIONS"].replace(/--conditions[=\s]react-server/, "")
                        }
                      } else {
                        this.environment.config.define = {
                          "process.env.NODE_OPTIONS": ""
                        }
                      }
                      //process.env.NODE_OPTIONS =
                        //process.env.NODE_OPTIONS.replace(
                          //" --conditions react-server",
                          //""
                        //);
                    }
                  }
                },
              },
              // Add content hash plugin for consistent hashing across environments
              {
                name: "vite:plugin-react-server/content-hash",
                augmentChunkHash(chunk) {
                  // Add a consistent salt based on the chunk's source file to make hash generation deterministic
                  if (chunk.facadeModuleId) {
                    try {
                      const sourcePath = resolve(
                        userOptions.projectRoot,
                        chunk.facadeModuleId
                      );
                      if (existsSync(sourcePath)) {
                        const sourceContent = readFileSync(sourcePath, "utf-8");
                        // Use a short hash of the source content as salt
                        return createRollupLikeHash(sourceContent, "hex");
                      }
                    } catch (error) {
                      // Fallback: use the module ID as salt
                      return chunk.facadeModuleId;
                    }
                  }
                  return;
                },
              },
            ],
          },
        },
      } satisfies ResolvedUserConfig;
      stashedUserConfig[envId] = serverConfig;
      return {
        type: "success",
        userConfig: serverConfig,
      };
    }
  };
