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
let isBuild = true;
let isSSR = false;

export function reactTransformPlugin<
  T extends PagePropOpt = PagePropOpt,
  InlineCSS extends InlineCssOpt = InlineCssOpt
>(options: StreamPluginOptions<T, InlineCSS>): Plugin {
  let userOptions: ResolvedUserOptions<T, InlineCSS>;
  const resolvedOptionsResult = resolveOptions(options);
  if (resolvedOptionsResult.type === "error") throw resolvedOptionsResult.error;
  userOptions = resolvedOptionsResult.userOptions;

  let staticManifest: Manifest;

  return {
    name: "vite:react-server-transform",
    enforce: "pre", // Run before Vite's transforms
    async configResolved(config) {
      isBuild = config.command === "build";
      isSSR = config.build?.ssr === true;
      if (isBuild && isSSR) {
        const staticManifestResult = await tryManifest({
          root: userOptions.projectRoot,
          ssrManifest: false,
          outDir: join(userOptions.build.outDir, userOptions.build.static),
        });
        if (staticManifestResult.type === "error") {
          throw staticManifestResult.error;
        }
        staticManifest = staticManifestResult.manifest;
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
      const [key, value] = userOptions.normalizer(id);
      let moduleID = value;
      if (isBuild) {
        if (staticManifest) {
          if (value in staticManifest) {
            moduleID = staticManifest[value].file;
          } else {
            const hash = this.emitFile({
              id,
              type: "chunk",
              fileName: key + ".js",
              name: value,
            });
            const fileName = this.getFileName(hash);
            moduleID = fileName;
          }
        } else {
          throw new Error(`Static manifest not found during dev build.`);
        }
      } else {
        // For non-SSR builds, just use the normalized path
        moduleID = join(userOptions.moduleBasePath, value);
      }
      let finalID = userOptions.moduleID(moduleID);
      // Always transform in server context
      const transformed = transformModuleIfNeeded(
        code,
        id,
        finalID,
        code?.match(/^"use server"[\s;]*\n?/m),
        code?.match(/^"use client"[\s;]*\n?/m),
        false
      );
      if (userOptions.verbose)
        if (transformed.source !== code) {
          if (id !== finalID) {
            this.environment.logger.info(
              "[react-server-transform] " +
                id.split("/").pop() +
                " -> " +
                finalID
            );
          } else {
            this.environment.logger.info(
              "[react-server-transform] " +
                id.split("/").pop() +
                (code.startsWith('"use client"') ? " (client)" : "")
            );
          }
          this.environment.logger.info(
            "[react-server-transform] " + transformed.source
          );
        }
      if (!transformed.source) {
        return {
          id: id,
          code: "",
          map: null,
        };
      }

      return {
        id: id,
        code: transformed.source,
        map: null
      };
    },
  };
}
