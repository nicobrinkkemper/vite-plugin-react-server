import { resolveOptions } from "../config/resolveOptions.js";
import type {
  InlineCssOpt,
  PagePropOpt,
  ResolvedUserOptions,
  StreamPluginOptions,
} from "../types.js";
import type { Manifest, Plugin } from "vite";
import { tryManifest } from "../helpers/tryManifest.js";
import { join } from "node:path";
import { setStashedResolve } from "../helpers/moduleResolver.js";
import { transformModuleIfNeeded } from "../loader/transformModuleIfNeeded.js";
import { logError } from "../error/toError.js";
import { createPluginLogger, type PluginLogger } from "../helpers/logger.js";

/**
 * Plugin for transforming React Client Components.
 *
 * Core responsibilities:
 * 1. Detects "use client" directives
 * 2. Transforms client components for RSC boundaries
 * 3. Adds client reference metadata for RSC
 *
 * When a component is marked with "use client", it:
 * - Gets transformed into a client reference
 * - Maintains module ID for RSC boundaries
 * - Preserves class/function behavior
 *
 * @example
 * ```ts
 * export default defineConfig({
 *   plugins: [
 *     viteReactClientTransformPlugin({
 *       projectRoot: process.cwd(),
 *     })
 *   ]
 * });
 * ```
 */

export function reactTransformPlugin<
  T extends PagePropOpt = PagePropOpt,
  InlineCSS extends InlineCssOpt = InlineCssOpt
>(options: StreamPluginOptions<T, InlineCSS>): Plugin {
  let userOptions: ResolvedUserOptions<T, InlineCSS>;

  const resolvedOptionsResult = resolveOptions(options);

  if (resolvedOptionsResult.type === "error") throw resolvedOptionsResult.error;

  userOptions = resolvedOptionsResult.userOptions;

  let staticManifest: Manifest = {};
  let isBuild = true;
  let isSSR = false;
  let log: PluginLogger = createPluginLogger(userOptions.verbose);

  return {
    name: "vite:react-server-transform",
    enforce: "post", // Run after Vite's transforms
    async configResolved(config) {
      isBuild = config.command === "build";
      isSSR = config.build?.ssr === true;
      log = createPluginLogger(userOptions.verbose, config.logger);

      if (isBuild && isSSR) {
        const staticManifestResult = await tryManifest({
          root: userOptions.projectRoot,
          ssrManifest: false,
          outDir: join(userOptions.build.outDir, userOptions.build.static),
          manifestPath: config.build.manifest,
        });

        if (staticManifestResult.type === "error") {
          throw staticManifestResult.error;
        }
        if (staticManifestResult.type === "success") {
          staticManifest = staticManifestResult.manifest;
        }
      }
    },
    async resolveId(
      _id: string,
      importer: string | undefined,
      options: {
        attributes: Record<string, string>;
        custom?: any;
        ssr?: boolean;
        isEntry: boolean;
      }
    ) {
      if (!options?.ssr) {
        return null;
      }
      // Set stashedResolve before any transform operations
      setStashedResolve(async (specifier: string) => {
        try {
          const resolved = await this.resolve(specifier, importer, {
            custom: { conditions: ["react-server"] },
          });
          if (!resolved) return null;
          return { id: resolved.id };
        } catch (error) {
          logError(error, this.environment.logger);
          return null;
        }
      });
      return null; // Let Vite handle the resolution
    },
    async transform(code, id, options) {
      if (!options?.ssr || !userOptions.autoDiscover.modulePattern(id)) {
        return null;
      }
      const isServerFunctionCode = userOptions.autoDiscover.isServerFunctionCode(code);
      const isClientComponentCode = userOptions.autoDiscover.isClientComponentCode(code);
      if(!isServerFunctionCode && !isClientComponentCode) {
        return null;
      }
      let [, moduleID] = userOptions.normalizer(id);
      if (isBuild) {
        if (staticManifest) {
          if (moduleID in staticManifest) {
            moduleID = staticManifest[moduleID].file;
          }
        } else {
          throw new Error(`Static manifest not found during dev build.`);
        }
      }
      let finalID = userOptions.moduleID(moduleID);
      // Always transform in server context
      const transformed = transformModuleIfNeeded(
        code,
        finalID,
        isServerFunctionCode,
        isClientComponentCode,
        true
      );
      if (transformed !== code) {
        if (id !== finalID) {
          log.debug(
            "[react-server-transform] " + id.split("/").pop() + " -> " + finalID
          );
        } else {
          log.debug(
            "[react-server-transform] " +
              id.split("/").pop() +
              (code.startsWith('"use client"') ? " (client)" : "")
          );
        }
        log.debug("[react-server-transform] " + transformed);
      }
      if (!transformed) {
        return {
          code: "",
          map: null,
        };
      }

      return {
        code: transformed,
        map: null,
      };
    },
  };
}
