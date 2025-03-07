import { join, dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { Worker } from "node:worker_threads";
import React from "react";
import {
  createLogger,
  type ResolvedConfig,
  type UserConfig,
  type ViteDevServer,
  type Manifest,
  type IndexHtmlTransformHook,
  type IndexHtmlTransformContext,
  type Plugin as VitePlugin,
  build,
} from "vite";
import { checkFilesExist } from "../checkFilesExist.js";
import { resolveOptions } from "../config/resolveOptions.js";
import { resolvePages } from "../config/resolvePages.js";
import { resolveUserConfig } from "../config/resolveUserConfig.js";
import { tryManifest } from "../helpers/tryManifest.js";
import { createBuildLoader } from "../loader/createBuildLoader.js";
import type {
  BuildTiming,
  CheckFilesExistReturn,
  InputNormalizer,
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
import { cssFiles } from "../worker/rsc/state.js";
import { createInputNormalizer } from "../helpers/inputNormalizer.js";

let resolvedConfig: ResolvedConfig | null = null;
let serverManifestPath: string | null = null;
let clientManifestPath: string | null = null;
let outpuptBundle: any;
let outputOptions: any;
let loader: ((id: string) => Promise<Record<string, any>>) | null = null;
let worker: Worker;
let htmlTransform: IndexHtmlTransformHook | null = null;
let filesToEmit = new Map<
  string,
  { source: string; parentUrl: string; originalFileName: string }
>();
let clientAssets = new Set<string>();
let htmlEntries = new Set<string>();

export function reactServerPlugin(options: StreamPluginOptions): VitePlugin<{
  meta: ReactStreamPluginMeta;
  addCssFile: (path: string) => void;
}> {
  const timing: BuildTiming = {
    start: performance.now(),
  };

  let files: CheckFilesExistReturn;
  // let env: Awaited<ReturnType<typeof getEnv>>;
  let cssModules = new Set<string>();
  let clientComponents = new Set<string>();
  // let define: Record<string, string>;
  let buildCssFiles = new Set<string>();
  let root: string = process.cwd();
  let userConfig: ResolvedUserConfig;
  let userOptions: ResolvedUserOptions;
  let normalizer: InputNormalizer;
  let resolvedPages: string[];
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
  let clientManifest: Manifest = {};
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

  const resolvedOptions = resolveOptions(options, false);
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

  normalizer = createInputNormalizer({
    root: root,
    removeExtension: false,
    preserveModulesRoot:
      userOptions.build.preserveModulesRoot === true
        ? userOptions.moduleBase
        : undefined,
  });
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
    async configurePreviewServer(server) {},
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

      htmlTransform = async (html: string, ctx: IndexHtmlTransformContext) => {
        return server.transformIndexHtml(ctx.path, html, ctx.originalUrl);
      };
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
      const resolvedPagesResult = await resolvePages(userOptions.build.pages);
      if (resolvedPagesResult.type === "error") {
        throw resolvedPagesResult.error;
      }
      resolvedPages = resolvedPagesResult.pages;
      files = await checkFilesExist(resolvedPages, userOptions, root);

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
      const clientManifestResult = tryManifest({
        root: root,
        outDir: join(userOptions.build.outDir, userOptions.build.client),
        ssrManifest: false,
      });
      if (clientManifestResult.type === "error") {
        throw clientManifestResult.error;
      }
      clientManifest = clientManifestResult.manifest;
    },
  };
}
