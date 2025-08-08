import { resolveOptions } from "../config/resolveOptions.js";
import type { Manifest } from "vite";
import { tryManifest } from "../helpers/tryManifest.js";
import { getNodeEnv, isValidEnv } from "../config/getNodeEnv.js";
import { createTransformer } from "../loader/createTransformer.js";
import type { VitePluginFn } from "../types.js";
import type { Program } from "acorn";
import { join } from "node:path";

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
export const reactTransformPlugin: VitePluginFn = (options) => {
  const resolvedOptionsResult = resolveOptions(options);

  if (resolvedOptionsResult.type === "error") throw resolvedOptionsResult.error;

  const { userOptions } = resolvedOptionsResult;

  let staticManifest: Manifest = {};
  let isBuild = true;
  let isSSR = true;
  const nodeEnv = getNodeEnv(process.env.NODE_ENV);
  let mode = nodeEnv;

  return {
    name: "vite-plugin-react-server:transform",
    enforce: "post",
    configResolved(config) {
      isBuild = config.command === "build";
      isSSR = Boolean(config.build.ssr);
      mode = config.mode as "development" | "production" | "test";
      if (!isValidEnv(mode)) {
        throw new Error(`Invalid mode: ${mode}`);
      }
    },
    async buildStart() {
      console.log(
        "🔍 Server transformer buildStart called in environment:",
        this.environment?.name || "unknown"
      );

      if (isBuild && isSSR) {
        const manifestResult = await tryManifest({
          root: userOptions.projectRoot,
          outDir: join(userOptions.build.outDir, userOptions.build.static),
          ssrManifest: false,
        });
        if (manifestResult.type === "success") {
          staticManifest = manifestResult.manifest;
        }
      }
    },
    transform: {
      order: "post",
      async handler(code, id, { ssr } = {}) {
        if(!ssr) {
          throw new Error("ssr is false");
        }
        if (!userOptions.autoDiscover.modulePattern.test(id)) {
          return null;
        }

        let [, moduleID] = userOptions.normalizer(id);
        if (isBuild) {
          if (staticManifest) {
            if (moduleID in staticManifest) {
              moduleID = staticManifest[moduleID].file;
            }
          } else {
            // Static manifest not found - this is normal during server build
            // since the static build hasn't completed yet
            if (userOptions.verbose) {
              this.environment.logger.warn(
                `Static manifest not found during server build - continuing without manifest lookup`
              );
            }
          }
        }

        const finalID = userOptions.moduleID?.(moduleID) || moduleID;

        // Create a new transformer with the computed values
        const transformer = createTransformer({
          parseFn: (source) => {
            const ast = this.parse(source, {
              allowReturnOutsideFunction: true,
              jsx: true,
            }) as Program;
            console.log("returning rollup ast");
            return { ast, code: "test" };
          },
          options: {
            loader: userOptions.loader,
            verbose: userOptions.verbose,
            panicThreshold: userOptions.panicThreshold,
          },
          isServerEnvironment: ssr,
        });
        // Always transform in server context
        const { code: transformed, map } = await transformer(code, finalID);

        if (userOptions.verbose)
          if (transformed !== code) {
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
              "[react-server-transform] " + transformed.slice(0, 100) + "..."
            );
          }
        return {
          code: transformed,
          map: map,
        };
      },
    },
    async writeBundle(options, bundle) {
      console.log(
        "🔍 Server transformer writeBundle called in environment:",
        this.environment?.name || "unknown"
      );

      // If we're in the server environment, handle static generation
      if (
        this.environment?.name === "server"
      ) {
        console.log(
          "🔍 Server transformer: handling static generation in server environment"
        );
        console.log("🔍 Server transformer: bundle keys:", Object.keys(bundle));

        // Here we would trigger the static generation logic
        // For now, just log that we're in the right place
        if (userOptions.onEvent) {
          try {
            userOptions.onEvent({
              type: "build.writeBundle.static-server",
              data: {
                pages: [], // We'll need to get the actual pages
                options,
                bundle,
              },
            });
          } catch (error) {
            console.error("🔍 Server transformer: error in onEvent:", error);
          }
        }
      }
    },
  };
};
