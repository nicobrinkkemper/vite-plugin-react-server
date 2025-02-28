import { join, resolve, dirname } from "node:path";
import { performance } from "node:perf_hooks";
import { Worker } from "node:worker_threads";
import React from "react";
import {
  createLogger,
  type ResolvedConfig,
  type UserConfig,
  type ViteDevServer,
  type Manifest,
  build,
} from "vite";
import { checkFilesExist } from "../checkFilesExist.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { getPluginRoot } from "../config/getPaths.js";
import { resolveOptions } from "../config/resolveOptions.js";
import { resolvePages } from "../config/resolvePages.js";
import { resolveUserConfig } from "../config/resolveUserConfig.js";
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
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { getBundleManifest } from "../helpers/getBundleManifest.js";
import type { ServerResponse } from "node:http";

let resolvedConfig: ResolvedConfig | null = null;
let serverManifestPath: string | null = null;
let clientManifestPath: string | null = null;
let outpuptBundle: any;
let outputOptions: any;
let loader: ((id: string) => Promise<Record<string, any>>) | null = null;
let worker: Worker;
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
  let serverManifest: Manifest = {};

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
  if (
    userOptions.projectRoot != root &&
    typeof userOptions.projectRoot === "string" &&
    userOptions.projectRoot !== process.cwd() &&
    userOptions.projectRoot !== ""
  ) {
    root = userOptions.projectRoot;
    console.log(
      "[vite:plugin-react-server] Root dir changed in plugin",
      userOptions.projectRoot,
      root
    );
  }
  return {
    name: "vite:react-stream-server",
    enforce: "post",
    api: {
      meta: { timing },
      addCssFile(path: string) {
        buildCssFiles.add(path);
      },
    },
    configResolved(_resolvedConfig) {
      resolvedConfig = _resolvedConfig;

      serverManifestPath = join(
        userOptions.build.outDir,
        userOptions.build.server,
        ".vite/manifest.json"
      );
      clientManifestPath = join(
        resolvedConfig.build.outDir,
        userOptions.build.client,
        ".vite/manifest.json"
      );
      timing.configResolved = performance.now();

      // Verify transformer runs first, preserver runs last
      const plugins = resolvedConfig.plugins;
      const transformerIndex = plugins.findIndex(
        (p) => p.name === "vite:react-transform"
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
    async configurePreviewServer(server) {
      
    },
    async configureServer(server: ViteDevServer) {
      if (typeof loader !== "function") {
        loader = server.ssrLoadModule;
      }
      if (
        server.config.root !== root &&
        typeof server.config.root === "string" &&
        server.config.root !== process.cwd() &&
        server.config.root !== ""
      ) {
        console.log(
          "[vite:plugin-react-server] Root dir changed in configureServer hook",
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

      // server.ws.on("connection", (_socket, _req) => {
      //   console.log("[vite-plugin-react-server] hooking up ws connection");
      // });

      // server.ws.on("listening", () => {
      //   console.log("[vite-plugin-react-server] hooking up ws listening");
      // });

      server.middlewares.use(async (req, res, next) => {
        if (req.headers.accept !== "text/x-component") return next();
        if (typeof loader !== "function") {
          loader = server.ssrLoadModule;
        }
        try {
          const handler = await createHandler(
            req.url ?? "",
            {
              ...userOptions,
              // we'll leave the Html generation for later
              Html: React.Fragment,
              projectRoot: root,
            },
            {
              cssFiles: [],
              logger: createLogger(),
              loader,
              moduleGraph: server.moduleGraph,
            }
          );
          if (handler.type === "success") {
            handler.stream?.pipe(res);
          }
          activeStreams.add(res);
        } finally {
          res.on("close", () => {
            activeStreams.delete(res);
          });
        }
      });
    },
    async config(config, configEnv): Promise<UserConfig> {
      if (
        typeof config.root === "string" &&
        config.root !== root &&
        config.root !== process.cwd() &&
        config.root !== ""
      ) {
        console.log(
          "[vite:plugin-react-server] Root dir changed in config hook",
          config.root,
          root
        );
        root = config.root;
      }
      const resolvedPages = await resolvePages(userOptions.build.pages);
      if (resolvedPages.type === "error") {
        throw resolvedPages.error;
      }

      files = await checkFilesExist(resolvedPages.pages, userOptions, root);

      const resolvedConfig = resolveUserConfig({
        isClient: false,
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
      if (!userConfig || resolvedConfig?.command !== "build") return;
      try {
        timing.renderStart = performance.now();

        // Get the client manifest
        const clientManifestResult = tryManifest({
          root: root,
          outDir: join(userOptions.build.outDir, userOptions.build.client),
          ssrManifest: false,
        });

        if (clientManifestResult.type === "error") {
          throw clientManifestResult.error;
        }

        const clientManifest = clientManifestResult.manifest;

        // Initialize worker
        const htmlWorkerPath = join(
          getPluginRoot(),
          DEFAULT_CONFIG.HTML_WORKER_PATH
        );

        worker = await createWorker({
          projectRoot: root,
          workerPath: htmlWorkerPath,
          condition: "react-server",
          reverseCondition: true,
          mode: (resolvedConfig?.mode ?? "production") as
            | "production"
            | "development",
          nodeOptions: "--conditions=react-client",
        });

        // Create the loader
        if (typeof loader !== "function") {
          if (!Object.keys(serverManifest).length) {
            console.warn("[vite-plugin-react-server] No server manifest found, the plugin will try to use the plugin context - it may differ from vite's manifest.");
            serverManifest = getBundleManifest({
              pluginContext: this,
              bundle: outpuptBundle,
              moduleBase: userOptions.moduleBase,
              preserveModulesRoot: userOptions.build.preserveModulesRoot,
            });
            if (!Object.keys(serverManifest).length) {
              console.warn("[vite-plugin-react-server] That didn't work, retrying to read manifest.");
              const resolvedServerManifest = tryManifest({
                root: root,
                outDir: join(userOptions.build.outDir, userOptions.build.server),
                ssrManifest: false,
              });
              if (resolvedServerManifest.type === "error") {
                // dont build the static files without a server manifest
                console.error("[vite-plugin-react-server] Failed to read manifest, aborting build.");
                return;
              }
              serverManifest = resolvedServerManifest.manifest;
            }
          }
          loader = createBuildLoader({
            root: root,
            userConfig,
            userOptions,
            pluginContext: this,
            serverManifest,
            clientManifest,
          });
        }
        const resolvedPages = await resolvePages(userOptions.build.pages);
        if (resolvedPages.type === "error") {
          throw resolvedPages.error;
        }
        const { failedRoutes, completedRoutes } = await renderPages(
          this,
          resolvedPages.pages,
          files,
          {
            pipableStreamOptions: {},
            moduleBasePath: "",
            moduleBaseURL: "",
            clientCss:
              Object.values(clientManifest)
                .flatMap((entry) => entry.css)
                .filter((css) => typeof css === "string")
                .map((css) => "/" + css) ?? [],
            userConfig,
            pluginOptions: userOptions,
            worker: worker,
            clientManifest: clientManifest,
            serverManifest: serverManifest,
            loader,
            onCssFile: async (path: string) => {
              if (buildCssFiles && path.endsWith(".css")) {
                buildCssFiles.add(path);
                // copy the file to the client build dir
                const clientPath = join(userOptions.build.outDir, userOptions.build.client, path);
                await mkdir(dirname(clientPath), { recursive: true });
                await writeFile(clientPath, await readFile(join(root, userOptions.build.outDir, userOptions.build.server, path)));
              }
            },
          }
        );

        if (failedRoutes.size) {
          console.error(
            "[vite-plugin-react-server] Failed to render routes:",
            failedRoutes
          );
        }
        if (worker) await worker.terminate();

        timing.renderEnd = performance.now();
        timing.total = (timing.renderEnd - timing.start) / 1000;

        // Update stats to include CSS and client components
        const stats: BuildStats = {
          htmlFiles: userOptions.build.pages.length,
          clientComponents: Object.keys(clientManifest).filter(
            userOptions.autoDiscover.clientComponents
          ).length,
          cssFiles: Object.keys(clientManifest)
            .flatMap(userOptions.autoDiscover.cssPattern)
            .filter(Boolean).length,
          totalRoutes: userOptions.build.pages.length,
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
        return;
      }
    },
    handleHotUpdate({ file }) {
      if (file.endsWith(".css")) {
        cssModules.add(file);
      }
    },
    async generateBundle(options, bundle) {
      if (!resolvedConfig) {
        throw new Error("Resolved config not found");
      }
      outpuptBundle = bundle;
      outputOptions = options;
      // Create manifest entries for each chunk
      serverManifest = getBundleManifest({
        pluginContext: this,
        bundle,
        moduleBase: userOptions.moduleBase,
        preserveModulesRoot: userOptions.build.preserveModulesRoot,
      });
      if (serverManifestPath) {
        await mkdir(dirname(serverManifestPath), { recursive: true });
        await writeFile(
          serverManifestPath,
          JSON.stringify(serverManifest, null, 2)
        );
      }
    },
  };
}
