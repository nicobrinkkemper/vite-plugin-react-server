import { readFileSync } from "node:fs";
import type { ServerResponse } from "node:http";
import { resolve as resolvePath } from "node:path";
import { performance } from "node:perf_hooks";
import { Worker } from "node:worker_threads";
import type { Plugin as RollupPlugin } from "rollup";
import type { Manifest, Plugin as VitePlugin } from "vite";
import {
  createLogger,
  type ResolvedConfig,
  type UserConfig,
  type ViteDevServer,
} from "vite";
import { createBuildConfig } from "../build/createBuildConfig.js";
import { checkFilesExist } from "../checkFilesExist.js";
import { getEnv } from "../getEnv.js";
import { createPageLoader } from "../html/createPageLoader.js";
import { renderPages } from "../worker/renderPages.js";
import { resolveOptions, resolvePages, resolveUserConfig } from "../options.js";
import type { BuildTiming, ReactStreamPluginMeta } from "../types.js";
import { type StreamPluginOptions } from "../types.js";
import { createWorker } from "../worker/createWorker.js";
import { createHandler } from "./createHandler.js";

let pageSet: Set<string>;
let pageMap: Map<string, string>;
let worker: Worker;
let config: ResolvedConfig;
let cssModules = new Set<string>();
let clientComponents = new Map<string, string>();
let define: Record<string, string>;
let buildCssFiles = new Set<string>();

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

export async function reactStreamPlugin(
  options: StreamPluginOptions = {} as StreamPluginOptions
): Promise<VitePlugin & RollupPlugin & { meta: ReactStreamPluginMeta }> {
  const timing: BuildTiming = {
    start: performance.now(),
  };
  const resolvedOptions = resolveOptions(options);
  if (resolvedOptions.type === "error") {
    console.error(
      "[vite-react-stream:server] Error resolving userOptions. Please check your userOptions."
    );
    throw resolvedOptions.error;
  }
  const { userOptions } = resolvedOptions;
  return {
    name: "vite:react-stream",
    meta: {
      timing,
    } as ReactStreamPluginMeta,
    api: {
      addCssFile(path: string) {
        buildCssFiles.add(path);
      },
    },
    configResolved(resolvedConfig) {
      if (config.command === "build") {
        timing.configResolved = performance.now();
        console.log("[vite-react-stream] Starting build...");
      }
      config = resolvedConfig;
    },
    async configureServer(server: ViteDevServer) {
      if (server.config.root) {
        console.log(
          "[vite-react-stream] Root dir changed",
          server.config.root,
          server.config.root
        );
      }

      const activeStreams = new Set<ServerResponse>();

      // Handle Vite server restarts
      server.ws.on("restart", (path) => {
        console.log(
          "[vite-react-stream] 🔧 Plugin changed, preparing for restart:",
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
        console.log("[vite-react-stream] hooking up ws connection");
      });

      server.ws.on("listening", () => {
        console.log("[vite-react-stream] hooking up ws listening");
      });

      server.middlewares.use(async (req, res, next) => {
        if (req.headers.accept !== "text/x-component") return next();
        console.log("[vite-react-stream] middleware called");
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
              projectRoot: server.config.root,
            },
            {
              cssFiles: Array.from(cssModules),
              logger: createLogger(),
              loader: server.ssrLoadModule,
              moduleGraph: server.moduleGraph,
            }
          );
          handler?.stream?.pipe(res);
        } finally {
          res.on("close", () => {
            console.log("[vite-react-stream] ➖ Stream closed for:", req.url);
            activeStreams.delete(res);
          });
        }
      });
    },

    async config(config, configEnv): Promise<UserConfig> {
      const resolvedConfig = resolveUserConfig(
        "react-server",
        config,
        configEnv,
        userOptions
      );
      if(resolvedConfig.type === "error") {
        throw resolvedConfig.error;
      }
      const { userConfig } = resolvedConfig;
      const resolvedPages = await resolvePages(userOptions.build.pages);
      if(resolvedPages.type === 'error') {
        throw resolvedPages.error;
      }
      const { pages } = resolvedPages;

      const envResult = getEnv(userConfig, configEnv);
      const files = await checkFilesExist(pages, userOptions, userConfig.root);
      pageSet = files.pageSet;
      pageMap = files.pageMap;
      define = envResult.define;
      const entries = Array.from(
        new Set([
          ...Array.from(files.pageSet.values()),
          ...Array.from(files.propsSet.values()),
        ]).values()
      );

      const buildConfig = createBuildConfig({
        root: config.root ?? process.cwd(),
        base: config.base ?? envResult.publicUrl,
        outDir: config.build?.outDir ?? "dist/server",
        entries,
      });
      return {
        ...buildConfig,
        define,
        plugins: config.plugins,
      };
    },
    async buildStart() {
      timing.buildStart = performance.now();
    },
    async closeBundle() {
      if(!config) return;
      console.log("RSC CLOSE BUNDLE CALLED");
      if (!pageSet?.size) return;
      timing.renderStart = performance.now();

      try {
        const manifest = JSON.parse(
          readFileSync(
            resolvePath(
              config.root,
              config.build.outDir,
              ".vite",
              "manifest.json"
            ),
            "utf-8"
          )
        ) as Manifest;
        const clientManifest = JSON.parse(
          readFileSync(
            resolvePath(
              config.root,
              userOptions.build.client,
              ".vite",
              "manifest.json"
            ),
            "utf-8"
          )
        ) as Manifest;
        // Create a single worker for all routes
        if (!worker)
          worker = await createWorker(
            config.root,
            config.build.outDir,
            "worker.js",
            process.env["NODE_ENV"] === "development" ? "development" : "production"
          );
        // this is based on the user config - the routes should lead to a page and props but the rendering is agnostic of that
        const routes = Array.from(pageMap.keys());
        const indexEntry = clientManifest["index.html"];
        if (!indexEntry) {
          throw new Error("root /index.html not found");
        }
        await renderPages(routes, {
          pipableStreamOptions: {
            bootstrapModules: ["/" + indexEntry.file],
          },
          outDir: config.build.outDir,
          clientCss: indexEntry.css?.map((css) => "/" + css) ?? [],
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
            projectRoot: config.root,
          },
          worker: worker,
          manifest: clientManifest as Manifest,
          loader: createPageLoader({
            manifest,
            root: config.root,
            outDir: config.build.outDir,
            moduleBase: userOptions.moduleBase,
            alwaysRegisterServer: false,
            alwaysRegisterClient: false,
            registerServer: [],
            registerClient: Object.keys(clientManifest).filter(
              (key) =>
                key.endsWith(".client.tsx") && clientManifest[key].isEntry
            ),
          }),
          onCssFile: (path) => buildCssFiles.add(path),
        });
        console.log("[vite-react-stream] Render complete");
        console.log("[vite-react-stream] Terminating worker");
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

        console.log("\n[vite-react-stream] Build Summary:");
        console.log("─".repeat(50));
        console.log(`📄 Generated ${stats.htmlFiles} HTML files`);
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
      } catch (error) {
        console.error("[vite-react-stream] Build failed:", error);
        throw error;
      }
    },
    async buildEnd(error) {
      if (error) {
        console.error("[vite-react-stream] Build error:", error);
      }
      if (worker) await worker.terminate();
    },
    handleHotUpdate({ file }) {
      if (file.endsWith(".css")) {
        cssModules.add(file);
      }
    },
    transform(code: string, id: string) {
      if (
        (id.includes(".client") ||
          code.startsWith('"use client"') ||
          code.startsWith("use client")) &&
        !id.includes("node_modules")
      ) {
        console.log("[vite-react-stream] Client component added", id);
        clientComponents.set(id, code);
      }
      return { code };
    },
  };
}
