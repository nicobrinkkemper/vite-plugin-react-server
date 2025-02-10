import { readdirSync } from "fs";
import type { ServerResponse } from "node:http";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { Worker } from "node:worker_threads";
import React from "react";
import {
  createLogger,
  type ResolvedConfig,
  type UserConfig,
  type ViteDevServer,
} from "vite";
import { checkFilesExist } from "../checkFilesExist.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { getPluginRoot } from "../config/getPaths.js";
import { resolveOptions } from "../config/resolveOptions.js";
import { resolvePages } from "../config/resolvePages.js";
import { resolveUserConfig } from "../config/resolveUserConfig.js";
import { getModuleManifest } from "../helpers/getModuleManifest.js";
import { tryManifest } from "../helpers/tryManifest.js";
import { createBuildLoader } from "../loader/createBuildLoader.js";
import type {
  BuildTiming,
  CheckFilesExistReturn,
  ReactStreamPluginMeta,
  ResolvedUserConfig,
  ResolvedUserOptions,
} from "../types.js";
import { type StreamPluginOptions } from "../types.js";
import { createWorker } from "../worker/createWorker.js";
import { renderPages } from "../worker/html/renderPages.js";
import { createHandler } from "./createHandler.js";

export function reactServerPlugin(
  options: StreamPluginOptions
): import("vite").Plugin<{
  meta: ReactStreamPluginMeta;
  addCssFile: (path: string) => void;
}> {
  const timing: BuildTiming = {
    start: performance.now(),
  };

  let files: CheckFilesExistReturn;
  // let env: Awaited<ReturnType<typeof getEnv>>;
  let worker: Worker;
  let finalConfig: ResolvedConfig;
  let cssModules = new Set<string>();
  let clientComponents = new Map<string, string>();
  // let define: Record<string, string>;
  let buildCssFiles = new Set<string>();
  let root: string = process.cwd();
  let userConfig: ResolvedUserConfig;
  let userOptions: ResolvedUserOptions;
  let moduleGraph: Record<
    string,
    {
      file: string;
      src: string;
      name: string;
      isEntry: boolean;
      imports: string[];
      dynamicImports: string[];
    }
  > = {};

  interface BuildStats {
    htmlFiles: number;
    clientComponents: number;
    cssFiles: number;
    totalRoutes: number;
    timing: {
      config: number;
      build: number;
      render: number;
      total: number;
    };
  }

  const resolvedOptions = resolveOptions(options);
  if (resolvedOptions.type === "error") {
    throw resolvedOptions.error;
  }
  userOptions = resolvedOptions.userOptions;
  root = userOptions.projectRoot;
  return {
    name: "vite:react-stream-server",
    enforce: "post",
    api: {
      meta: { timing },
      addCssFile(path: string) {
        buildCssFiles.add(path);
      },
    },
    configResolved(resolvedConfig) {
      finalConfig = resolvedConfig;
      timing.configResolved = performance.now();
      if (finalConfig.command === "build") {
        finalConfig = {
          ...finalConfig,
          mode: "production",
        };
      }

      // Verify transformer runs first, preserver runs last
      const plugins = finalConfig.plugins;
      const transformerIndex = plugins.findIndex(
        (p) => p.name === "vite:react-stream-transformer"
      );
      const preserverIndex = plugins.findIndex(
        (p) => p.name === "vite-plugin-react-server:preserve-directives"
      );

      if (transformerIndex === -1) {
        throw new Error("Transformer plugin not installed");
      }
      if (preserverIndex < transformerIndex) {
        throw new Error(
          "Transformer plugin isn't installed or isn't running before preserver"
        );
      }
    },
    async configureServer(server: ViteDevServer) {
      if (server.config.root !== root) {
        console.log(
          "[vite-plugin-react-server] Root dir changed",
          server.config.root,
          root
        );
        root = server.config.root;
      }

      const activeStreams = new Set<ServerResponse>();

      // Handle Vite server restarts
      server.ws.on("restart", (path) => {
        console.log(
          "[vite-plugin-react-server] 🔧 Plugin changed, preparing for restart:",
          path
        );

        // Close streams with restart message
        for (const res of activeStreams) {
          res.writeHead(503, {
            "Content-Type": "text/x-component",
            "Retry-After": "1",
          });
          res.end('{"error":"Server restarting..."}');
        }
        activeStreams.clear();
      });

      server.ws.on("connection", (_socket, _req) => {
        console.log("[vite-plugin-react-server] hooking up ws connection");
      });

      server.ws.on("listening", () => {
        console.log("[vite-plugin-react-server] hooking up ws listening");
      });

      server.middlewares.use(async (req, res, next) => {
        if (req.headers.accept !== "text/x-component") return next();
        console.log("[vite-plugin-react-server] middleware called");
        try {
          const handler = await createHandler(
            req.url ?? "",
            {
              Page: userOptions.Page,
              props: userOptions.props,
              build: userOptions.build,
              Html: React.Fragment,
              pageExportName: userOptions.pageExportName,
              propsExportName: userOptions.propsExportName,
              moduleBase: userOptions.moduleBase,
              moduleBasePath: userOptions.moduleBasePath,
              projectRoot: root,
            },
            {
              cssFiles: Array.from(cssModules),
              logger: createLogger(),
              loader: server.ssrLoadModule,
              moduleGraph: server.moduleGraph,
            }
          );
          if (handler.type === "success") {
            handler.stream?.pipe(res);
          }
          activeStreams.add(res);
        } finally {
          res.on("close", () => {
            console.log(
              "[vite-plugin-react-server] ➖ Stream closed for:",
              req.url
            );
            activeStreams.delete(res);
          });
        }
      });
    },
    async config(config, configEnv): Promise<UserConfig> {
      if (typeof config.root === "string" && config.root !== root && config.root !== process.cwd() && config.root !== "") {
        root = config.root;
      }
      const resolvedPages = await resolvePages(userOptions.build.pages);
      if (resolvedPages.type === "error") {
        throw resolvedPages.error;
      }

      files = await checkFilesExist(resolvedPages.pages, userOptions, root);

      const resolvedConfig = resolveUserConfig({
        condition: "react-server",
        config,
        configEnv,
        userOptions,
        files,
      });

      if (resolvedConfig.type === "error") {
        throw resolvedConfig.error;
      }

      userConfig = resolvedConfig.userConfig;

      return resolvedConfig.userConfig;
    },
    async buildStart() {
      if (!timing.buildStart) {
        timing.buildStart = performance.now();
      } else {
        console.log("Build already started");
      }
    },
    async closeBundle() {
      if (!userConfig || finalConfig.command !== "build") return;
      try {
        timing.renderStart = performance.now();

        const resolvedServerManifest = tryManifest({
          root,
          outDir: userOptions.build.server,
          ssrManifest: false,
        });

        const serverManifest =
          resolvedServerManifest.type === "error"
            ? getModuleManifest.bind(this)()
            : resolvedServerManifest.manifest;
        // Get worker path from manifest
        // Look for the html-worker entry directly
        let htmlWorkerPath = serverManifest["html-worker"]?.file;

        if (options.htmlWorkerPath) {
          htmlWorkerPath = options.htmlWorkerPath;
        } else {
          htmlWorkerPath = join(
            getPluginRoot(),
            DEFAULT_CONFIG.HTML_WORKER_PATH
          );
        }

        worker = await createWorker({
          projectRoot: root,
          workerPath: htmlWorkerPath,
          condition: "react-server",
          reverseCondition: true,
          mode: finalConfig.mode as "production" | "development",
          nodeOptions: "--conditions=react-client",
        });

        // Get routes directly from pages
        const resolvedPages = await resolvePages(userOptions.build.pages);
        if (resolvedPages.type === "error") {
          throw resolvedPages.error;
        }
        const routes = resolvedPages.pages;

        const entries = Object.values(serverManifest).filter(
          (entry) => entry.isEntry
        );
        const css = entries.flatMap((entry) => entry.css);
        const loader = createBuildLoader({
          root,
          userConfig,
          pluginContext: this,
        });

        const { failedRoutes, completedRoutes } = await renderPages(routes, {
          pipableStreamOptions: {
            bootstrapModules: entries
              .filter((entry) =>
                userOptions.autoDiscover.clientComponents.test(entry.file)
              )
              .filter((t)=> typeof t === "object" && t != null && "file" in t)
              .map((entry) => "/" + entry.file),
          },
          moduleBasePath: userOptions.moduleBasePath,
          moduleBaseURL: userOptions.moduleBaseURL,
          clientCss: css?.filter((css) => typeof css === "string").map((css) => "/" + css) ?? [],
          userConfig,
          pluginOptions: userOptions,
          worker: worker,
          manifest: serverManifest,
          loader,
          onCssFile: (path: string) => {
            console.log('[vite-plugin-react-server] onCssFile', path);
            if (buildCssFiles && path.endsWith(".css")) {
              buildCssFiles.add(path);
            }
          },
        });

        if (failedRoutes.size) {
          console.error(
            "[vite-plugin-react-server] Failed to render routes:",
            failedRoutes
          );
        }
        if (worker) await worker.terminate();

        timing.renderEnd = performance.now();
        timing.total = (timing.renderEnd - timing.start) / 1000;

        // Collect stats
        const stats: BuildStats = {
          htmlFiles: routes.length,
          clientComponents: clientComponents.size,
          cssFiles: cssModules.size,
          totalRoutes: routes.length,
          timing: {
            config: ((timing.configResolved ?? 0) - timing.start) / 1000,
            build:
              ((timing.buildStart ?? 0) - (timing.configResolved ?? 0)) / 1000,
            render:
              ((timing.renderEnd ?? 0) - (timing.renderStart ?? 0)) / 1000,
            total: (timing.renderEnd ?? 0 - timing.start) / 1000,
          },
        };

        // Format duration helper
        const formatDuration = (seconds: number) => {
          if (seconds < 0.001) {
            return `${(seconds * 1000000).toFixed(0)}μs`;
          }
          if (seconds < 1) {
            return `${(seconds * 1000).toFixed(0)}ms`;
          }
          return `${seconds.toFixed(2)}s`;
        };

        console.log("\n[vite-plugin-react-server] Build Summary:");
        console.log("─".repeat(50));
        console.log(`�� Generated ${stats.htmlFiles} HTML files`);
        console.log(`🎯 Processed ${stats.clientComponents} client components`);
        console.log(`🎨 Included ${stats.cssFiles} CSS files`);
        console.log(`🛣️  Total routes: ${stats.totalRoutes}`);
        console.log("─".repeat(50));
        console.log("⏱️  Timing:");
        console.log(`  Config:  ${formatDuration(stats.timing.config)}`);
        console.log(`  Build:   ${formatDuration(stats.timing.build)}`);
        console.log(`  Render:  ${formatDuration(stats.timing.render)}`);
        console.log("  ".repeat(12));
        console.log(`  Total:   ${formatDuration(stats.timing.total)}`);
        console.log("─".repeat(50));

        // Ensure worker is terminated
        if (worker) {
          console.log("[vite-plugin-react-server] Terminating worker...");
          await worker.terminate();
          worker = null as any;
        }
      } catch (error) {
        console.error("[vite-plugin-react-server] Build failed:", error);
        // Make sure to terminate worker even on error
        if (worker) await worker.terminate();
        worker = null as any;
        throw error;
      }
    },
    async buildEnd(error) {
      if (error) {
        console.error("[vite-plugin-react-server] Build error:", error);
      }
      if (worker) await worker.terminate();
      worker = null as any;
    },
    handleHotUpdate({ file }) {
      if (file.endsWith(".css")) {
        cssModules.add(file);
      }
    },
    async renderChunk(_code: string, chunk: any, _options: any) {
      const moduleIds = this.getModuleIds();
      const fallbackManifestEntries = Object.fromEntries(
        Array.from(moduleIds)
          .map((module) => {
            const moduleInfo = this.getModuleInfo(module);
            if (!moduleInfo) return [module, null];
            const {
              code,
              id,
              isEntry,
              importedIds,
              dynamicallyImportedIds,
              ...rest
            } = moduleInfo;
            return [
              chunk.name ?? id,
              {
                file: chunk.fileName,
                src: module,
                name: chunk.name ?? id,
                isEntry: chunk.isEntry ?? isEntry,
                imports: chunk.imports ?? importedIds,
                dynamicImports: chunk.dynamicImports ?? dynamicallyImportedIds,
                directive: rest.meta["directive"],
                css: chunk.viteMetadata?.importedCss ?? [],
                assets: chunk.viteMetadata?.importedAssets ?? [],
              },
            ];
          })
          .filter(Boolean)
      );

      moduleGraph = {
        ...moduleGraph,
        ...fallbackManifestEntries,
      };

      if (chunk.fileName.includes("html-worker")) {
        const workerPath = resolve(root, chunk.fileName);

        // Don't initialize worker during build phase
        if (finalConfig.command === "build") {
          return null;
        }

        worker = await createWorker({
          projectRoot: userOptions.projectRoot,
          workerPath,
        });
      }
      console.log('[vite-plugin-react-server] renderChunk', chunk.fileName);
      return null;
    },
  };
}
