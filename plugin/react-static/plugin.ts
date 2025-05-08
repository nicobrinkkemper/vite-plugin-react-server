/**
 * plugin.ts
 *
 * PURPOSE: Main Vite plugin for React Server Components (RSC) static site generation
 *
 * This module:
 * 1. Orchestrates the entire static site generation process
 * 2. Manages the lifecycle of the RSC rendering process
 * 3. Handles file writing for both initial page loads and client-side navigation
 *    - Writes .html files for initial page loads (complete HTML document)
 *    - Writes .rsc files for client-side navigation (RSC content only)
 * 4. Provides hooks for Vite to integrate with the build process
 * 5. Manages worker threads for parallel rendering
 * 6. Handles error reporting and metrics collection
 */

import { join } from "node:path";
import { Worker } from "node:worker_threads";
import {
  type Manifest,
  type ResolvedConfig,
  type Plugin as VitePlugin,
  createLogger,
} from "vite";
import { resolveOptions } from "../config/resolveOptions.js";
import { resolveUserConfig } from "../config/resolveUserConfig.js";
import { createBuildLoader } from "../loader/createBuildLoader.js";
import type {
  BuildTiming,
  ReactStreamPluginMeta,
  ResolvedUserConfig,
  ResolvedUserOptions,
  PluginEvent,
  RenderPagesResult,
  AutoDiscoveredFiles,
} from "../types.js";
import { type StreamPluginOptions } from "../types.js";
import { renderPages } from "./renderPages.js";
import { mkdir } from "node:fs/promises";
import { getBundleManifest } from "../helpers/getBundleManifest.js";
import { createWorker } from "../worker/createWorker.js";
import { defaultFileWriter } from "../helpers/defaultFileWriter.js";
import { resolveAutoDiscover } from "../config/resolveAutoDiscover.js";
import { getCondition } from "../config/getCondition.js";
import {
  serializedOptions,
  serializeResolvedConfig,
} from "../helpers/serializeUserOptions.js";

if (getCondition() !== "react-server") {
  throw new Error(
    "Condition mismatch, should be react-server but got " +
      process.env["NODE_OPTIONS"]
  );
}

let worker: Worker;
let cwd: string;
let userConfig: ResolvedUserConfig;
let resolvedConfig: ResolvedConfig;
let userOptions: ResolvedUserOptions;
let autoDiscoveredFiles: AutoDiscoveredFiles | null = null;
let serverManifest: Manifest | undefined = undefined;
let buildLoader: Awaited<ReturnType<typeof createBuildLoader>> | undefined;

export function reactStaticPlugin(options: StreamPluginOptions): VitePlugin<{
  meta: ReactStreamPluginMeta;
}> {
  const timing: BuildTiming = {
    start: Date.now(),
    configResolved: 0,
    buildStart: 0,
    renderStart: 0,
  };

  const resolvedOptions = resolveOptions(options);
  if (resolvedOptions.type === "error") {
    throw resolvedOptions.error;
  }
  userOptions = resolvedOptions.userOptions;
  cwd = process.cwd();

  return {
    name: "vite:plugin-react-server/static",
    enforce: "post",
    api: {
      meta: { timing },
    },

    async config(config, configEnv) {
      if (config.root && config.root !== cwd) {
        throw new Error(
          "[RSC] Project root must match current working directory"
        );
      }

      const autoDiscoverResult = await resolveAutoDiscover({
        config,
        configEnv,
        userOptions,
        condition: "react-server",
      });
      if (autoDiscoverResult.type === "error") {
        throw autoDiscoverResult.error;
      }
      autoDiscoveredFiles = autoDiscoverResult.autoDiscoveredFiles;

      const resolvedConfig = resolveUserConfig({
        condition: "react-server",
        config,
        configEnv,
        userOptions,
        autoDiscoveredFiles,
      });
      if (resolvedConfig.type === "error") {
        throw resolvedConfig.error;
      }

      userConfig = resolvedConfig.userConfig;
      timing.configResolved = Date.now();
    },
    configResolved(config) {
      resolvedConfig = config;
    },

    async buildStart() {
      timing.buildStart = Date.now();
      if (userOptions.onEvent && autoDiscoveredFiles) {
        userOptions.onEvent({
          type: "build.start",
          data: {
            pages: Array.from(autoDiscoveredFiles.urlMap.keys()),
            files: autoDiscoveredFiles,
          },
        });
      }
    },

    async renderStart() {
      timing.renderStart = Date.now();
    },

    async writeBundle(options, bundle) {
      const bundleManifest = getBundleManifest<false>({
        bundle,
        normalizer: userOptions.normalizer,
      });

      if (!("source" in bundleManifest[".vite/manifest.json"])) {
        throw new Error("Server manifest not found");
      }

      serverManifest = JSON.parse(
        bundleManifest[".vite/manifest.json"].source as string
      );

      buildLoader = await createBuildLoader({
        userConfig,
        userOptions,
        serverManifest: serverManifest ?? {},
        clientManifest: autoDiscoveredFiles?.staticManifest ?? {},
      });
      if (userOptions.onEvent) {
        userOptions.onEvent({
          type: "build.writeBundle",
          data: {
            pages: Array.from(autoDiscoveredFiles?.urlMap.keys() ?? []),
            options,
            bundle,
            manifest: serverManifest,
          },
        });
      }
      // Setup directories
      const serverDir = join(
        userOptions.projectRoot,
        userOptions.build.outDir,
        userOptions.build.server
      );
      const clientDir = join(
        userOptions.projectRoot,
        userOptions.build.outDir,
        userOptions.build.client
      );
      const staticDir = join(
        userOptions.projectRoot,
        userOptions.build.outDir,
        userOptions.build.static
      );

      await Promise.all([
        mkdir(serverDir, { recursive: true }),
        mkdir(clientDir, { recursive: true }),
        mkdir(staticDir, { recursive: true }),
      ]);
      const staticManifest = autoDiscoveredFiles?.staticManifest ?? {};
      const indexHtml = staticManifest?.["index.html"]?.file;
      const pipeableStreamOptions = {
        ...userOptions.pipeableStreamOptions,
        bootstrapModules: [
          ...(indexHtml ? [indexHtml] : []),
          ...(userOptions.pipeableStreamOptions?.bootstrapModules ?? []),
        ],
      };
      userOptions.pipeableStreamOptions = pipeableStreamOptions;
      const serializedUserOptions = serializedOptions(
        userOptions,
        autoDiscoveredFiles!
      );
      // Create worker
      if (!worker) {
        const workerResult = await createWorker({
          projectRoot: userOptions.projectRoot,
          workerPath: userOptions.htmlWorkerPath,
          currentCondition: "react-server",
          reverseCondition: "react-client",
          workerData: {
            resolvedConfig: serializeResolvedConfig(resolvedConfig),
            userOptions: serializedUserOptions,
          },
        });
        if (workerResult.type === "error") {
          throw workerResult.error;
        } else if (workerResult.type === "skip") {
          console.info("[RSC] Worker not created, skipping static build");
          return;
        } else {
          worker = workerResult.worker;
        }
      }
      // Render pages
      const { onEvent, ...rest } = userOptions;
      const renderPagesGenerator = renderPages(autoDiscoveredFiles!, {
        ...rest,
        loader: buildLoader,
        worker: worker,
        logger: createLogger(),
        onEvent: (event: PluginEvent) => {
          if (userOptions.onEvent) {
            userOptions.onEvent(event);
          }
          if (event.type === "file.write") {
            return defaultFileWriter({
              event,
              outputDir: staticDir,
            });
          }
        },
        pipeableStreamOptions: pipeableStreamOptions,
        manifest: serverManifest ?? {},
        htmlOutputPath: "index.html",
        htmlOutputRoot: userOptions.build.static,
        rscOutputPath: "index.rsc",
        rscOutputRoot: userOptions.build.static,
      });

      // Process render results
      let finalResult: RenderPagesResult | undefined;
      for await (const result of renderPagesGenerator) {
        if (result.type === "error") {
          throw result.error;
        }
        finalResult = result;
      }

      if (!finalResult) {
        throw new Error("No render result produced");
      }

      // Update timing
      timing.render = Date.now() - (timing.renderStart ?? timing.start);

      // Cleanup
      worker.postMessage({ type: "SHUTDOWN", id: "*" });
      await new Promise<void>((resolve, reject) => {
        const shutdownHandler = (msg: any) => {
          if (msg.type === "SHUTDOWN_COMPLETE") {
            worker.removeListener("message", shutdownHandler);
            worker
              .terminate()
              .then((code) =>
                code === 1
                  ? resolve()
                  : reject(new Error(`Worker terminated with code ${code}`))
              )
              .catch(reject);
          }
        };
        worker.on("message", shutdownHandler);
      });
    },
  } as const;
}
