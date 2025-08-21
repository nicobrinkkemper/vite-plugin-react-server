import type { Plugin } from "vite";
import type { VitePluginFn } from "../types.js";
import { createTransformer } from "../loader/createTransformer.js";
import type { Program } from "acorn";
import { resolveOptions } from "../config/resolveOptions.js";
import type { Manifest } from "vite";
import { tryManifest } from "../helpers/tryManifest.js";
import { getNodeEnv, isValidEnv } from "../config/getNodeEnv.js";
import { join } from "node:path";
// import { getEnvironmentName } from "../env/plugin.js";
import { isServerTransform } from "./transformerEnv.js";

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

    let staticManifest: Manifest = {};
    let isBuild = true;
    let isSSR = true;
    const nodeEnv = getNodeEnv(process.env.NODE_ENV);
    let mode = nodeEnv;

    return {
      name: `vite-plugin-react-server:transform-${defaultEnvironment}-as-${name}`,
      enforce: "post",
      applyToEnvironment(partialEnvironment){
        if(allowedEnvironments.includes(partialEnvironment.name as "client" | "server" | "ssr")){
          return true;
        }
        return false;
      },
      configResolved(config) {
        isBuild = config.command === "build";
        isSSR = Boolean(config.build.ssr);
        mode = config.mode as "development" | "production" | "test";
        if (!isValidEnv(mode)) {
          throw new Error(`Invalid mode: ${mode}`);
        }
        // Note: condition override is set in env plugin during config phase
        // Verbose summary (config hook has void context, use config logger)
        const logger = config.customLogger || config.logger;
        logger.info(
          `${logPrefix} configResolved: isBuild=${isBuild} isSSR=${isSSR} mode=${mode} allowed=${JSON.stringify(
            allowedEnvironments
          )} defaultEnv=${defaultEnvironment}`
        );
      },
      async buildStart() {
        // Only load static manifest for SSR environment (which builds to dist/client)
        // The client environment (which builds to dist/static) creates the static manifest
        if (isBuild && defaultEnvironment === "ssr") {
          const manifestResult = await tryManifest({
            root: resolvedUserOptions.projectRoot,
            outDir: join(
              resolvedUserOptions.build.outDir,
              resolvedUserOptions.build.static
            ),
            ssrManifest: false,
          });
          if (manifestResult.type === "success") {
            staticManifest = manifestResult.manifest;
          } else {
            if(resolvedUserOptions.panicThreshold === "all_errors"){
              this.error(`Static manifest not found during ${name} build - continuing without manifest lookup`);
            } else {
              this.environment?.logger?.warn(`Static manifest not found during ${name} build - continuing without manifest lookup`);
            }
            staticManifest = {};
          }
        }
      },
      transform: {
        order: "post",
        async handler(code, id, { ssr = defaultEnvironment === "server" } = {}) {

          if (userOptions.verbose) {
            this.environment?.logger?.info(
              `${logPrefix} transform: id=${id} env=${defaultEnvironment} ssr=${Boolean(
                ssr
              )} condition=${
                defaultEnvironment === "server"
                  ? "react-server"
                  : "react-client"
              }`
            );
          }
          let [, moduleID] = resolvedUserOptions.normalizer(id);

          // Do not run the client transformer on explicit server modules
          // Prevents false positives like "use server directive found in client module"
          if (name === "client" && /\.server\.[cm]?[jt]sx?$/.test(moduleID)) {
            return null;
          }
     
          if (isBuild) {
            if (staticManifest) {
              if (moduleID in staticManifest) {
                moduleID = staticManifest[moduleID].file;
              }
            } else {
              // Static manifest not found - this is normal during server build
              // since the static build hasn't completed yet
              if (resolvedUserOptions.verbose) {
                this.environment?.logger?.warn(
                  `Static manifest not found during ${name} build - continuing without manifest lookup`
                );
              }
            }
          }

          const finalID = resolvedUserOptions.moduleID?.(moduleID) || moduleID;

          const transformer = createTransformer({
            parseFn: (source) => {
              const ast = this.parse(source, {
                allowReturnOutsideFunction: true,
                jsx: true,
              }) as Program;
              return ast;
            },
            options: {
              loader: resolvedUserOptions.loader,
              verbose: resolvedUserOptions.verbose,
              panicThreshold: resolvedUserOptions.panicThreshold,
              logger: this.environment?.logger,
              moduleBase: userOptions.moduleBase ?? "",
            },
            // Always treat the "server" transformer as server environment.
            // The client transformer should always behave as non-server.
            isServerEnvironment: isServerTransform(name),
          });

          // Transform the code
          const { code: transformed, map } = await transformer(code, finalID);

          // Logging for verbose mode
          if (resolvedUserOptions.verbose) {
            const hasDirectives =
              code.includes('"use client"') ||
              code.includes('"use server"') ||
              code.includes("'use client'") ||
              code.includes("'use server'");

            if (transformed !== code) {
              if (id !== finalID) {
                this.environment?.logger?.info(
                  `[react-${name}-transform] ` +
                    id.split("/").pop() +
                    " -> " +
                    finalID
                );
              } else {
                this.environment?.logger?.info(
                  `[react-${name}-transform] ` +
                    id.split("/").pop() +
                    (code.startsWith('"use client"') ? " (client)" : "") +
                    (hasDirectives ? " (directives processed)" : "")
                );
              }
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

          return {
            code: transformed,
            map: map,
          };
        },
      },
    } as Plugin;
  };
};
