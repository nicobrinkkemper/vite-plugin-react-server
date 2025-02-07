import { join, relative, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { Worker } from "node:worker_threads";
import type { Plugin as RollupPlugin, TransformPluginContext } from "rollup";
import type { PluginOption, Plugin as VitePlugin } from "vite";
import {
  build,
  createLogger,
  resolveConfig,
  type ResolvedConfig,
  type UserConfig,
  type ViteDevServer,
} from "vite";
import { checkFilesExist } from "../checkFilesExist.js";
import { getEnv } from "../getEnv.js";
import { tryManifest } from "../helpers/tryManifest.js";
import { createPageLoader } from "../loader/createPageLoader.js";
import { resolveOptions } from "../config/resolveOptions.js";
import { resolvePages } from "../config/resolvePages.js";
import { resolveUserConfig } from "../config/resolveUserConfig.js";
import type {
  BuildTiming,
  CheckFilesExistReturn,
  ReactStreamPluginMeta,
  ResolvedUserConfig,
  ResolvedUserOptions,
} from "../types.js";
import { type StreamPluginOptions } from "../types.js";
import { createWorker } from "../worker/createWorker.js";
import { renderPages } from "../worker/renderPages.js";
import { createHandler } from "./createHandler.js";
import { readdirSync } from "fs";
import type { ServerResponse } from "node:http";
import { getPluginRoot } from "../config/getPaths.js";
import { createInputNormalizer } from "../helpers/inputNormalizer.js";
import { createClientComponentTransformer } from "../transformer/transformer-client-components.js";
import { createServerActionTransformer } from "../transformer/transformer-server-actions.js";

export function reactServerPlugin(
  options: StreamPluginOptions
): VitePlugin & RollupPlugin & { meta: ReactStreamPluginMeta } {
  const timing: BuildTiming = {
    start: performance.now(),
  };

  let files: CheckFilesExistReturn;
  let env: Awaited<ReturnType<typeof getEnv>>;
  let worker: Worker;
  let config: ResolvedConfig;
  let cssModules = new Set<string>();
  let clientComponents = new Map<string, string>();
  let define: Record<string, string>;
  let buildCssFiles = new Set<string>();
  let root: string = process.cwd();
  let userConfig: ResolvedUserConfig;
  let userClientConfig: ResolvedUserConfig;
  let userOptions: ResolvedUserOptions;
  let moduleGraph: Record<string, {
    file: string;
    src: string;
    name: string;
    isEntry: boolean;
    imports: string[];
    dynamicImports: string[];
  }> = {};

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

  const resolvedOptions = resolveOptions(options, "react-server");
  if (resolvedOptions.type === "error") {
    throw resolvedOptions.error;
  }
  userOptions = resolvedOptions.userOptions;

  return {
    name: "vite:react-stream-server",
    enforce: "post",
    meta: { timing } as ReactStreamPluginMeta,
    api: {
      addCssFile(path: string) {
        buildCssFiles.add(path);
      },
    },
    configResolved(resolvedConfig) {
      config = resolvedConfig;
      timing.configResolved = performance.now();
      if (config.command === "build") {
        config = {
          ...config,
          mode: "production",
        }
      }
      console.log(
        "[ServerPlugin] Plugin order:",
        config.plugins.map((p) => p.name)
      );

      // Verify transformer runs first, preserver runs last
      const plugins = config.plugins;
      const transformerIndex = plugins.findIndex(
        (p) => p.name === "vite:react-stream-transformer"
      );
      const preserverIndex = plugins.findIndex(
        (p) => p.name === "vite-plugin-react-server:preserve-directives"
      );

      if (transformerIndex === -1) {
        throw new Error("Transformer plugin must be installed");
      }
      if (preserverIndex < transformerIndex) {
        throw new Error("Transformer plugin must run before preserver");
      }

      console.log("[ServerPlugin] Final config:", {
        plugins: config.plugins.map(p => p.name),
        build: config.build,
      });
    },
    async configureServer(server: ViteDevServer) {
      if (server.config.root) {
        console.log(
          "[vite-plugin-react-server] Root dir changed",
          server.config.root,
          server.config.root
        );
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

      server.ws.on("connection", (socket, req) => {
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
              Html: ({ children }) => children,
              pageExportName: userOptions.pageExportName,
              propsExportName: userOptions.propsExportName,
              moduleBase: userOptions.moduleBase,
              moduleBasePath: userOptions.moduleBasePath,
              projectRoot: server.config.root ?? userOptions.projectRoot,
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
      const resolvedPages = await resolvePages(userOptions.build.pages);
      if (resolvedPages.type === "error") {
        throw resolvedPages.error;
      }

      files = await checkFilesExist(
        resolvedPages.pages,
        userOptions,
        config.root ?? userOptions.projectRoot
      );

      const resolvedConfig = resolveUserConfig({
        condition: "react-server",
        config,
        configEnv,
        userOptions,
        files,
      });
      const resolvedClientConfig = resolveUserConfig({
        condition: "react-client",
        config,
        configEnv,
        userOptions,
        files,
      });

      if (resolvedConfig.type === "error") {
        throw resolvedConfig.error;
      }
      if (resolvedClientConfig.type === "error") {
        throw resolvedClientConfig.error;
      }

      root = resolvedConfig.userConfig.root;
      userConfig = resolvedConfig.userConfig;
      userClientConfig = resolvedClientConfig.userConfig;

      // Get existing inputs
      const existingInput = config.build?.rollupOptions?.input || {};
      const currentInputs = typeof existingInput === 'string' ? { default: existingInput } : existingInput;

      // Add server inputs
      const serverInputs = {
        server: userOptions.serverEntry,
        'index.html': '/index.html',
        // Add page and props files
        ...Object.fromEntries([
          ...files.pageMap.entries(),
          ...files.propsMap.entries()
        ].map(([key, path]) => [key, path]))
      };

      console.log('[ServerPlugin] Merging inputs:', {
        existing: currentInputs,
        server: serverInputs
      });

      return {
        build: {
          outDir: userOptions.build.server,
          manifest: true,
          ssr: true,
          target: 'node18',
          minify: false,
          rollupOptions: {
            input: {
              ...currentInputs,
              ...serverInputs
            }
          }
        }
      };
    },
    async buildStart() {
      if (!timing.buildStart) {
        timing.buildStart = performance.now();
      } else {
        console.log("Build already started");
      }
    },
    async closeBundle() {
      if (!config || config.command !== "build") return;
      try {
        timing.renderStart = performance.now();
        const moduleGraph = this.getModuleIds();
        
        const resolvedServerManifest = tryManifest({
          root,
          outDir: userOptions.build.server,
          ssrManifest: false,
        });
        if (resolvedServerManifest.type === "error") {
          console.error(
            "[vite-plugin-react-server] Server Build failed, can not build without a server manifest.",
            resolvedServerManifest.error
          );
          return;
        }
        const { manifest: serverManifest } = resolvedServerManifest;

        // Get worker path from static manifest
        let htmlWorkerPath =
          userOptions.htmlWorkerPath === "vite-plugin-react-server/html-worker"
            ? join(getPluginRoot(), "worker/html-worker.js")
            : serverManifest[userOptions.htmlWorkerPath]?.file ?? Object.entries(serverManifest).find(([key, value]) => value.name === userOptions.htmlWorkerPath)?.[1]?.file;
        if (!htmlWorkerPath) {
          throw new Error(
            `Could not find workerPath: \"${
              userOptions.htmlWorkerPath
            }\" in static manifest. It only exports: ${Object.keys(
              serverManifest
            ).join(", ")}`,
            {
              cause: serverManifest,
            }
          );
        }

        // Initialize worker with path from static directory
        const workerPath = resolve(
          root,
          userOptions.build.static,
          htmlWorkerPath
        );
        console.log("config.mode:", config.mode);
        worker = await createWorker({
          projectRoot: userOptions.projectRoot,
          workerPath,
          condition: "react-server",
          reverseCondition: true,
          mode: config.mode as "production" | "development",
          nodeOptions: "--conditions=react-client",
        });

        // Debug the pages structure
        console.log("[plugin] Build pages structure:", {
          pages: userOptions.build.pages,
          type: typeof userOptions.build.pages,
        });

        // Get routes directly from pages
        const resolvedPages = await resolvePages(userOptions.build.pages);
        if (resolvedPages.type === "error") {
          throw resolvedPages.error;
        }
        const routes = resolvedPages.pages;
        console.log("[plugin] Routes to render:", routes);

        const entries = Object.values(serverManifest).filter(entry => entry.isEntry);
        const css = entries.flatMap(entry => entry.css);
        const { failedRoutes, filesOutputted } = await renderPages(routes, {
          pipableStreamOptions: {
            bootstrapModules: entries.map(entry => "/" + entry.file),
          },
          moduleBasePath: userOptions.moduleBasePath,
          moduleBaseURL: userOptions.moduleBaseURL,
          outDir: config.build.outDir,
          clientCss: css?.map((css) => "/" + css) ?? [],
          pluginOptions: {
            Page: userOptions.Page,
            props: userOptions.props,
            build: userOptions.build,
            Html: userOptions.Html,
            pageExportName: userOptions.pageExportName,
            propsExportName: userOptions.propsExportName,
            moduleBase: userOptions.moduleBase,
            moduleBasePath: userOptions.moduleBasePath,
            moduleBaseURL: userOptions.moduleBaseURL,
            projectRoot: root,
          },
          worker: worker,
          manifest: serverManifest,
          loader: createPageLoader({
            manifest: serverManifest,
            root: config.root,
            outDir: config.build.outDir,
            moduleBase: userOptions.moduleBase,
            alwaysRegisterServer: false,
            alwaysRegisterClient: false,
            registerServer: [],
            registerClient: [],
          }),
          onCssFile: (path: string) => {
            if (buildCssFiles && path.endsWith(".css")) {
              buildCssFiles.add(path);
            }
          },
        });

        // Debug render results
        console.log("[vite-plugin-react-server] Render results:", {
          failedRoutes,
          filesOutputted,
          expectedRoutes: routes.length,
        });

        if (failedRoutes.size) {
          console.error(
            "[vite-plugin-react-server] Failed to render routes:",
            failedRoutes
          );
        }
        if (filesOutputted.length !== routes.length) {
          throw new Error(
            `Failed to render routes: ${routes.length} routes expected, ${filesOutputted.length} routes rendered`
          );
        }
        console.log("[vite-plugin-react-server] Render complete");
        console.log("[vite-plugin-react-server] Terminating worker");
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
            render: ((timing.renderEnd ?? 0) - (timing.renderStart ?? 0)) / 1000,
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
        throw error;
      }
    },
    async buildEnd(error) {
      if (error) {
        console.error("[vite-plugin-react-server] Build error:", error);
      }
      if (worker) await worker.terminate();
    },
    handleHotUpdate({ file }) {
      if (file.endsWith(".css")) {
        cssModules.add(file);
      }
    },
    async renderChunk(code, chunk, options) {
      const moduleIds = this.getModuleIds();
      const fallbackManifestEntries = Object.fromEntries(Array.from(moduleIds).map((module) => {
        const moduleInfo = this.getModuleInfo(module);
        if(!moduleInfo) return [module, null];
        const { code, id, isEntry, importedIds,dynamicallyImportedIds,...rest } = moduleInfo;
        return [chunk.name ?? id, {
          file: chunk.fileName,
          src: module,
          name: chunk.name ?? id,
          isEntry: chunk.isEntry ?? isEntry,
          imports: chunk.imports ?? importedIds,
          dynamicImports: chunk.dynamicImports ?? dynamicallyImportedIds,
          directive: rest.meta['directive'],
          css: chunk.viteMetadata?.importedCss ?? [],
          assets: chunk.viteMetadata?.importedAssets ?? [],
        }];
      }).filter(Boolean));

      moduleGraph = {
        ...moduleGraph,
        ...fallbackManifestEntries,
      };

      if (chunk.fileName.includes("html-worker")) {
        const workerPath = resolve(
          root,
          userOptions.build.server,
          chunk.fileName
        );
        console.log("Files in output dir:", {
          files: readdirSync(resolve(root, userOptions.build.server)),
          workerPath,
        });

        // Don't initialize worker during build phase
        if (config.command === "build") {
          return null;
        }

        worker = await createWorker({
          projectRoot: userOptions.projectRoot,
          workerPath,
        });
      }
      return null;
    },
  };
}
