import type { Plugin, UserConfig, ViteBuilder, ESBuildOptions } from "vite";
import { createRequire } from "node:module";
import { realpathSync } from "node:fs";
import { sep } from "node:path";

// Minimal shape of Vite 8's `oxc` config. Imported from "vite" it would be
// `OxcOptions`, but that type doesn't exist in Vite 6/7, so model it locally to
// keep this source buildable against any supported Vite.
type OxcLike = {
  jsx?: ({ development?: boolean } & Record<string, unknown>) | string;
} & Record<string, unknown>;
import type { VitePluginFn } from "../types.js";

import { resolveAutoDiscover } from "../config/autoDiscover/resolveAutoDiscover.js";
import { resolveUserConfig } from "../config/resolveUserConfig.js";
import { resolveOptions } from "../config/resolveOptions.js";
import { handleError } from "../error/handleError.js";
import { createDefaultModuleID } from "../config/createModuleID.js";
import { wrapModuleID } from "../config/moduleIdContract.js";

/**
 * Is vite-plugin-react-server LINKED into this project (file:/workspace
 * symlink) rather than a real node_modules install? Decides which side of the
 * dep optimizer the plugin's own browser subpaths go on. A real install is
 * pre-bundled (`optimizeDeps.include`) so a cold cache discovers the whole
 * chain up front — lazy mid-session re-optimizes abort the initial flight
 * fetch. A LINKED copy must be EXCLUDED instead: an explicit include
 * overrides Vite's linked-package handling and freezes a pre-bundle of dist
 * that a rebuild does not invalidate (same version, same lockfile), so every
 * plugin rebuild silently served STALE client code until `--force`. Excluded,
 * Vite serves the linked dist as source — a rebuild is live on reload.
 */
let selfIsLinked: boolean | null = null;
function isSelfLinked(projectRoot: string): boolean {
  if (selfIsLinked !== null) return selfIsLinked;
  try {
    const projectRequire = createRequire(
      projectRoot.endsWith(sep) ? projectRoot : projectRoot + sep
    );
    const pkgPath = projectRequire.resolve(
      "vite-plugin-react-server/package.json"
    );
    const real = realpathSync(pkgPath);
    selfIsLinked = !real.includes(
      `${sep}node_modules${sep}vite-plugin-react-server${sep}`
    );
  } catch {
    selfIsLinked = false;
  }
  return selfIsLinked;
}

import { createLogger, version as viteVersion } from "vite";
import { join } from "node:path";
import { DEFAULT_LOADER_CONFIG } from "../config/defaults.js";
import { REACT_CONDITION } from "../config/getCondition.js";
import { runDeferredStaticGeneration } from "../bundle/deferredStaticGeneration.js";
import { buildEdgeBundle } from "../bundle/buildEdgeBundle.js";

/**
 * Creates a plugin that ensures consistent hash generation across environments
 * by using the original source file content as the basis for hash generation.

*/
// Note: Path normalization should be handled in the file naming functions, not in writeBundle

/**
 * Environment Configuration Plugin
 *
 * This plugin configures Vite Environment API environments for React Server Components.
 * It's separate from the env plugin which handles process environment variables.
 *
 * Environment mapping:
 * - client (Vite client = browser) → dist/client (React client components - real implementations)
 * - ssr (Vite SSR = SSR-safe) → dist/static (SSR-compatible static files)
 * - server (custom) → dist/server (React server components with registerClientReference)
 */
export const createEnvironmentPlugin: VitePluginFn = (options): Plugin => {
  const environmentPlugin: Plugin = {
    name: "vite:plugin-react-server/environments",
    enforce: "pre",

    generateBundle: {
      // "pre" so this runs BEFORE vite:css-post's generateBundle, and it
      // lives HERE (not in the react-static plugins) because the orchestrator
      // registers this plugin under both react conditions — the server
      // environment builds either way. On rolldown-vite the server env never
      // carries emitted css assets, but a bare css entry
      // (autoDiscover.cssEntry) whose stylesheet references assets above
      // build.assetsInlineLimit gets a pure-css placeholder chunk with a
      // populated viteMetadata.importedAssets — css-post's bookkeeping then
      // writes that metadata onto bundle[getFileName(referenceId)], which
      // does not exist here, and the whole build dies on
      // `undefined.viteMetadata`. Emptying importedAssets steers css-post
      // onto its safe path (css-post itself removes the entry's own file
      // from importedCss, leaving it empty): skip the transfer, delete the
      // placeholder — the same server output Vite 6/Rollup produced. Those
      // assets are never emitted into the server outDir, so nothing true is
      // lost. importedCss must stay: vite:manifest serializes it as the
      // entry's css list, which is how css files get delivered to documents.
      order: "pre",
      handler(_options, bundle) {
        if (this.environment.name !== "server") return;
        for (const chunk of Object.values(bundle)) {
          if (
            chunk.type === "chunk" &&
            chunk.isEntry &&
            chunk.facadeModuleId &&
            /\.(css|less|sass|scss|styl|stylus|pcss|postcss)(\?.*)?$/.test(
              chunk.facadeModuleId
            ) &&
            chunk.viteMetadata
          ) {
            chunk.viteMetadata.importedAssets.clear();
          }
        }
      },
    },

    async config(config: UserConfig, configEnv) {
      // Resolve plugin options
      const resolvedOptionsResult = resolveOptions(options);
      if (resolvedOptionsResult.type === "error") {
        throw resolvedOptionsResult.error;
      }
      const userOptions = resolvedOptionsResult.userOptions;

      // Add transformer plugins at the Vite level with proper environment filtering
      if (!config.plugins) {
        config.plugins = [];
      }

      // Note: Transformer is now added via orchestrator, so skip adding it here
      // to avoid duplicates and ensure proper registration

      // Note: Hash coordination is handled by the sequential build approach
      // Each environment will use the manifest from the previous build

      // Set up logger and moduleID
      const logger = config.customLogger || createLogger();
      if (typeof userOptions.moduleID !== "function") {
        userOptions.moduleID = createDefaultModuleID(
          userOptions,
          configEnv,
          userOptions.loader?.mode
        );
      } else {
        // User-supplied moduleID still goes through the join contract so
        // hosted client ids come out rooted regardless of what the fn returns.
        userOptions.moduleID = wrapModuleID(userOptions.moduleID);
      }
      // Always override the moduleID function to ensure it has the forTransformer logic
      if (!userOptions.loader) {
        userOptions.loader = DEFAULT_LOADER_CONFIG;
      }
      userOptions.loader.moduleID = createDefaultModuleID(
        userOptions,
        configEnv,
        userOptions.loader?.mode
      );

      // Run auto-discovery once to get all files - we don't need separate calls since
      // the file discovery process is identical, only the organization differs
      const autoDiscoverResult = await resolveAutoDiscover({
        config,
        configEnv,
        userOptions,
        logger,
      });

      if (autoDiscoverResult.type === "error") {
        const panicError = handleError({
          error: autoDiscoverResult.error,
          logger,
          context: "createEnvironmentPlugin(autoDiscover)",
          panicThreshold: userOptions.panicThreshold,
          critical: true, // Auto-discovery is critical for environment setup
        });
        if (panicError != null) {
          throw panicError;
        } else {
          // If handleError returns null but this is critical, we can't continue
          throw new Error("Cannot continue without auto-discovery");
        }
      }

      // Get the auto-discovered files (safe to access since we checked for errors above)
      const autoDiscoveredFiles = autoDiscoverResult.autoDiscoveredFiles!;

      // Define environment configurations
      const allEnvironmentConfigs = [
        {
          name: "client",
          condition: "react-client" as const,
          ssr: false,
          outDir: join(userOptions.build.outDir, userOptions.build.static),
        },
        {
          name: "ssr",
          condition: "react-client" as const,
          ssr: true,
          outDir: join(userOptions.build.outDir, userOptions.build.client),
        },
        {
          name: "server",
          condition: "react-server" as const,
          ssr: true,
          outDir: join(userOptions.build.outDir, userOptions.build.server),
        },
      ];

      // Filter environments based on availableEnvironments from orchestrator

      const availableEnvironments = (userOptions as any)
        .availableEnvironments || ["client", "ssr", "server"];

      const environmentConfigs = allEnvironmentConfigs.filter((config) =>
        availableEnvironments.includes(config.name)
      );


      // Resolve all environment configurations using resolveUserConfig
      const environments: Record<string, import("vite").EnvironmentOptions> =
        {};

      // Sort environments to process static first (to establish hashes)
      // Use the environment configs as-is
      const sortedEnvConfigs = environmentConfigs;

      for (const envConfig of sortedEnvConfigs) {
        const configResult = resolveUserConfig({
          condition: envConfig.condition,
          config,
          configEnv,
          userOptions,
          autoDiscoveredFiles,
          ssr: envConfig.ssr,
        });

        if (configResult.type === "error") {
          const panicError = handleError({
            error: configResult.error,
            logger,
            context: `createEnvironmentPlugin(${envConfig.name}Config)`,
            panicThreshold: userOptions.panicThreshold,
            critical: true,
          });
          if (panicError != null) {
            throw panicError;
          } else {
            throw new Error(
              `Cannot continue without ${envConfig.name} environment configuration`
            );
          }
        }

        // Map the resolved user config to Environment API compatible options
        const userConfig = configResult.userConfig;

        // Log the rollup inputs for this environment (only in verbose mode)
        if (userOptions.verbose) {
          logger?.info(
            `${envConfig.name} environment rollup inputs: ${JSON.stringify(
              userConfig.build.rollupOptions.input,
              null,
              2
            )}`
          );
          logger?.info(
            `${
              envConfig.name
            } environment output preserveModulesRoot: ${JSON.stringify(
              userConfig.build.rollupOptions.output,
              null,
              2
            )}`
          );
        }

        // Debug: Log what resolveUserConfig provided
        if (userOptions.verbose) {
          logger?.info(
            `${envConfig.name} userConfig.resolve: ${JSON.stringify(
              userConfig.resolve,
              null,
              2
            )}`
          );
          logger?.info(
            `${
              envConfig.name
            } userConfig.build.rollupOptions.external: ${JSON.stringify(
              userConfig.build.rollupOptions.external,
              null,
              2
            )}`
          );
        }
        // detect if legacy build or not
        const legacyBuild = userOptions.strategy?.legacyBuilder && !config?.builder;
        const implicitSsr =
          userOptions.strategy?.mainThreadCondition === REACT_CONDITION.server &&
          userOptions.strategy?.legacyBuilder;
        // this follows vite's logic for legacy builds
        const implicitViteBuildName =
          userOptions.strategy?.legacyBuilder && !config.build?.ssr
            ? "client"
            : "ssr";
        const consumer = legacyBuild
          ? implicitViteBuildName === "ssr"
            ? "server"
            : "client"
          : envConfig.name === "server" || envConfig.name === "ssr"
          ? "server"
          : "client";

        // Note: Path normalization should be handled in the file naming functions
        environments[envConfig.name] = {
          // Every env except the browser one produces a Node-run bundle: the
          // "ssr" env's output (dist/client) is the in-process renderer, and
          // dropping process.env there rewrites env.node's runtime reads to {}
          // — every env getter silently falls back (BASE_URL "/"), un-prefixing
          // renderer-derived URLs under subpath deploys.
          keepProcessEnv: envConfig.name !== "client",
          define: userConfig.define,
          consumer: consumer,
          optimizeDeps: {
            ...userConfig.optimizeDeps,
            // Vite 8's dep scanner crawls the build input for entry points; in
            // dev that resolves to the static `index.html`, which an RSC dev
            // server never serves, so the scan fails and logs (per re-optimize)
            // "failed to resolve rolldownOptions.input value: index.html".
            // An explicit entries list skips the html crawl. For the BROWSER
            // environment, an EMPTY list means nothing is scanned up front and
            // every dep (react, react/jsx-dev-runtime, the router/client
            // barrel) is discovered lazily on the first request — each
            // mid-session optimize pass forces a reload and leaves a transient
            // second React copy (one-off "Invalid hook call" / null-dispatcher
            // errors on a cold cache). Hand the scanner the auto-discovered
            // client modules instead so the first optimizer pass sees the real
            // browser graph. Server/ssr environments keep the empty list.
            // optimizeDeps is a no-op in build, so the real index.html build
            // entry is unaffected.
            entries:
              userConfig.optimizeDeps?.entries ??
              (consumer === "client" && envConfig.name === "client"
                ? Object.values(
                    autoDiscoveredFiles.clientInputs ?? {}
                  ).flatMap((v) =>
                    typeof v === "string" && /\.[cm]?[jt]sx?$/.test(v)
                      ? [v.replace(/^\/+/, "")]
                      : []
                  )
                : []),
            // transport:"webpack" (dev): the browser reaches the webpack
            // flight client through a lazy import chain (createReactFetcher →
            // rsl runtime → vendored CJS client), so on a cold cache Vite
            // only discovers those deps mid-session — the re-optimize reload
            // leaves a transient second React copy and one-off "Invalid hook
            // call" errors on first load. Pre-declare them so the first
            // optimizer pass bundles (and dedupes react across) the chain.
            //
            // The same lazy-discovery gap applies to vprs's OWN browser-facing
            // subpaths when nothing in the app's SCANNED client code imports
            // them statically: an app whose client components are reached only
            // as flight client references (no static barrel import in the
            // client entry) pulls router/client and /utils through runtime
            // resolution the scanner can't see, so a cold cache re-optimizes
            // mid-session — and that reload aborts the in-flight initial
            // flight fetch ("hydrateOrRender: initial payload failed ...
            // Failed to fetch"). Pre-declare them for the browser env; an app
            // that never requests them just carries a bundled-but-unfetched
            // dep, which is free.
            include: [
              ...(userConfig.optimizeDeps?.include ?? []),
              ...(consumer === "client" &&
              !isSelfLinked(userOptions.projectRoot)
                ? [
                    "vite-plugin-react-server/router/client",
                    "vite-plugin-react-server/utils",
                  ]
                : []),
              ...(consumer === "client" && userOptions.transport === "webpack"
                ? [
                    "react-server-loader/webpack/runtime",
                    "react-server-loader/webpack/client",
                  ]
                : []),
            ],
            exclude: [
              ...(userConfig.optimizeDeps?.exclude ?? []),
              // Linked plugin development: never pre-bundle ourselves — see
              // isSelfLinked. Real installs stay on the include side above.
              ...(consumer === "client" && isSelfLinked(userOptions.projectRoot)
                ? ["vite-plugin-react-server"]
                : []),
            ],
          },
          resolve: {
            ...userConfig.resolve,
            // IMPORTANT: Map externals from resolveUserConfig (rollupOptions.external) to Environment API format
            // In Environment API, externals go in resolve.external, not build.rollupOptions.external
            // For static builds (browser/ESM): don't externalize anything - bundle everything to avoid _virtual files
            // For client/server builds (SSR): externalize as configured
            external: (() => {
              const isStaticBuild = envConfig.name === "static" || (!envConfig.ssr && envConfig.name === "client");
              if (isStaticBuild) {
                // For static builds, don't externalize anything (bundle everything)
                return [];
              }
              // For SSR builds, use configured externals
              return Array.isArray(userConfig.build.rollupOptions.external)
                ? userConfig.build.rollupOptions.external.filter(
                    (item): item is string => typeof item === "string"
                  )
                : [];
            })(),
          },
          build: {
            ...userConfig.build,
            ssr:
              envConfig.name === "server"
                ? true
                : legacyBuild
                ? implicitSsr
                : envConfig.name === "ssr",
            target: userConfig.build.target,
            // Remove externals from rollupOptions since they should be in resolve.external for Environment API
            rollupOptions: {
              ...userConfig.build.rollupOptions,
              external: undefined, // Remove external from rollupOptions, it's now in resolve.external
              // Set preserveModules in the output configuration, not at the top level
              output: (() => {
                const output = userConfig.build.rollupOptions.output;
                
                // Handle array output configuration - extract the plugin output that contains preserveModulesRoot
                if (Array.isArray(output)) {
                  const pluginOutput = output.find(o => o && typeof o === 'object' && 'preserveModulesRoot' in o);
                  if (pluginOutput) {
                    return pluginOutput;
                  }
                  // If no pluginOutput found, use the first output configuration
                  if (output.length > 0) {
                    return output[0];
                  }
                }
                
                // Ensure preserveModulesRoot is always present in the output configuration
                if (output && typeof output === 'object' && !Array.isArray(output)) {
                  // Check if the property exists in the object (not just checking the value)
                  const hasPreserveModulesRoot = 'preserveModulesRoot' in output;
                  
                  if (hasPreserveModulesRoot) {
                    // Property exists, preserve the preserveModules value from the output (don't override it)
                    // This is critical for static builds where preserveModules: false is set
                    return output; // Return as-is, preserveModules is already set correctly
                  } else {
                    // Property missing, add it based on user options
                    const preserveModulesRootString = userOptions.build.preserveModulesRoot === false
                      ? userOptions.moduleBase
                      : undefined;
                    return { ...output, preserveModulesRoot: preserveModulesRootString };
                  }
                }
                
                return output;
              })(),
            },
          },
        };
      }

      // Force the PRODUCTION JSX transform for every build environment.
      //
      // Under a dev-mode build (`NODE_ENV=development … vite build --mode
      // development`) esbuild's automatic-runtime JSX transform emits the
      // dev call shape `jsxDEV(type, props, key, isStaticChildren, source,
      // self)`. esbuild renders the trailing `self` argument as a bare
      // `module` reference when it can't prove the file is ESM at
      // per-file transform time. The vprs server bundle is pure ESM
      // (`dist/server/*.js`), so at SSG-prerender time that `module`
      // identifier is undefined and the very first server component to
      // render (e.g. the built-in `Html` component) throws
      // `ReferenceError: module is not defined`.
      //
      // The server bundle never consumes jsxDEV's client-warning
      // `source`/`self` info, so dropping to the production transform
      // (`jsx`/`jsxs`, no `self` arg) is a pure win for builds:
      //   - It only changes the JSX *call shape*, NOT which React build is
      //     bundled — `NODE_ENV=development` still resolves the development
      //     (non-minified) React, so dev builds keep surfacing the errors
      //     production minifies away.
      //   - Production builds already use the production JSX transform
      //     (esbuild only emits jsxDEV in dev), so this is a no-op there.
      //   - Scoped to `command === "build"`, so the dev SERVER / client
      //     Fast Refresh path (`command === "serve"`) is untouched.
      // Vite 8 (Rolldown/Oxc) deprecates the `esbuild` config in favour of
      // `oxc` and warns when a plugin sets it. The dev-JSX knob maps 1:1
      // (esbuild.jsxDev -> oxc.jsx.development), so target whichever the
      // installed Vite understands to keep the override AND stay warning-free.
      const isOxcVite = parseInt(viteVersion.split(".")[0] ?? "0", 10) >= 8;
      // `oxc` only exists on Vite 8 configs; read it without depending on Vite 8
      // types so the source still builds on Vite 6/7.
      const configOxc = (config as { oxc?: OxcLike | false }).oxc;
      let esbuildJsxDevOverride: Partial<UserConfig> = {};
      if (
        configEnv.command === "build" &&
        config.esbuild !== false &&
        configOxc !== false
      ) {
        if (isOxcVite) {
          const base: OxcLike =
            typeof configOxc === "object" && configOxc ? configOxc : {};
          const jsx =
            typeof base.jsx === "object" && base.jsx ? base.jsx : {};
          // `oxc` only exists on Vite 8's UserConfig; assert across versions.
          esbuildJsxDevOverride = {
            oxc: { ...base, jsx: { ...jsx, development: false } },
          } as Partial<UserConfig>;
        } else {
          const base: ESBuildOptions =
            typeof config.esbuild === "object" ? config.esbuild : {};
          esbuildJsxDevOverride = { esbuild: { ...base, jsxDev: false } };
        }
      }

      // Return the configuration with all environments
      // Build order: client → ssr → server → static generation (step 4)
      // Server build runs LAST so dist/client exists when HTML rendering references client components
      // Static generation is deferred to run after ALL environments complete (needs server manifest)
      return {
        root: userOptions.projectRoot,
        ...config,
        ...esbuildJsxDevOverride,
        environments,
        builder: {
          async buildApp(builder: ViteBuilder) {
            // Build all environments in definition order
            for (const environment of Object.values(builder.environments)) {
              await builder.build(environment);
            }
            // Step 4: Run deferred static generation now that all manifests are available
            await runDeferredStaticGeneration();
            // Step 5: Single-isolate edge bake (additive, gated on build.edge).
            await buildEdgeBundle({
              userOptions,
              projectRoot: userOptions.projectRoot,
              logger,
            });
            // Step 6: transport:"webpack" — re-render the prerendered
            // snapshots through the pair just baked, so the static surface
            // carries the same flight flavor as the per-request path (one
            // deploy may then serve any route from CDN or function).
            if (
              userOptions.transport === "webpack" &&
              userOptions.build.edge.enabled &&
              userOptions.build.edge.transport === "webpack"
            ) {
              const rawPages = userOptions.build.pages;
              const routes: string[] = Array.isArray(rawPages)
                ? rawPages
                : typeof rawPages === "function"
                ? await (rawPages as () => Promise<string[]> | string[])()
                : await rawPages;
              const { freezeStaticSnapshots } = await import(
                "../bundle/freezeStaticSnapshots.js"
              );
              await freezeStaticSnapshots({
                userOptions,
                projectRoot: userOptions.projectRoot,
                routes,
                logger,
              });
            }
            // Step 7: the host manifests — one per emitted host target, the
            // contract createHost derives serving from (host-spec Resolution
            // 1). Last, so every artifact it inventories exists.
            const { emitHostManifests } = await import(
              "../bundle/emitHostManifests.js"
            );
            await emitHostManifests({
              userOptions,
              projectRoot: userOptions.projectRoot,
              logger,
            });
          },
        },
      };
    },
  };

  return environmentPlugin;
};
