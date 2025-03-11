import { join, dirname } from "node:path";
import { performance } from "node:perf_hooks";
import React from "react";
import {
  createLogger,
  type ResolvedConfig,
  type UserConfig,
  type ViteDevServer,
  type Manifest,
  type Plugin as VitePlugin,
} from "vite";
import { checkFilesExist } from "../checkFilesExist.js";
import { resolveOptions } from "../config/resolveOptions.js";
import { resolvePages } from "../config/resolvePages.js";
import { resolveUserConfig } from "../config/resolveUserConfig.js";
import type {
  BuildTiming,
  CheckFilesExistReturn,
  CssContent,
  ReactStreamPluginMeta,
  ResolvedUserOptions,
} from "../types.js";
import { type StreamPluginOptions } from "../types.js";
import { createHandler } from "../helpers/createHandler.js";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { getBundleManifest } from "../helpers/getBundleManifest.js";
import type { ServerResponse } from "node:http";
import { createInputNormalizer } from "../helpers/inputNormalizer.js";
import { MIME_TYPES } from "../config/mimeTypes.js";
import { InlineCssCollector } from "../css-collector-inline.js";
import { CssCollector } from "../css-collector.js";
import { collectModuleGraphCss } from "../collect-manifest-client-files.js";

let resolvedConfig: ResolvedConfig | null = null;
let serverManifestPath: string | null = null;
let loader: ((id: string) => Promise<Record<string, any>>) | null = null;

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
  // let define: Record<string, string>;
  let buildCssFiles = new Set<string>();
  let root: string = process.cwd();
  let userOptions: ResolvedUserOptions;
  let resolvedPages: string[];
  let serverManifest: Manifest = {};

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
      if (root !== server.config.root) {
        root = server.config.root;
      }
      if (typeof loader !== "function") {
        loader = (id: string) => import(id);
      }
      const normalize = createInputNormalizer({
        root,
        removeExtension: false,
        preserveModulesRoot: userOptions.build.preserveModulesRoot
          ? userOptions.moduleBase
          : undefined,
      });
      server.middlewares.use(async (req, res, next) => {
        const [key, value] = normalize(req.url);
        const fileRoot = key.startsWith("node_modules")
          ? root
          : join(root, userOptions.build.outDir, userOptions.build.static);
        try {
          const filePath = join(fileRoot, value);
          const stats = await stat(filePath);

          if (stats.isFile()) {
            const ext = value.slice(value.lastIndexOf("."));
            const contentType = MIME_TYPES[ext] || "application/octet-stream";
            res.setHeader("Content-Type", contentType);
            const content = await readFile(filePath);
            res.end(content);
            return;
          }
          next();
        } catch (error) {
          console.log("Error serving static file:", error);
          next();
        }
      });
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

      server.middlewares.use(async (req, res, next) => {
        if (req.headers.accept !== "text/x-component") return next();
        if (typeof loader !== "function") {
          loader = server.ssrLoadModule;
        }
        let route = req.url?.replace("/index.rsc", "");
        if (!route || route === "") {
          route = "/";
        }
        try {
          const handler = await createHandler({
            root: root,
            url:
              typeof userOptions.moduleBaseURL === "string" &&
              userOptions.moduleBaseURL !== ""
                ? new URL(route, userOptions.moduleBaseURL).href
                : route,
            route: route,
            getCss: async (id) => {
              const cssFiles = await collectModuleGraphCss({
                moduleGraph: server.moduleGraph,
                pagePath: id,
                onCss: undefined,
              })
              if (userOptions.inlineCss) {
                const InlineMap = new Map<string, CssContent>();
                await Promise.all(Array.from(cssFiles.entries()).map(async ([file, fileUrl]) => {
                  const content = await server.ssrLoadModule(fileUrl + "?inline");
                  if (content) {
                    InlineMap.set(file,  {
                      content: content['default'],
                      path: file,
                      type: "text/css",
                    });
                  }
                }));
                return InlineMap;
              }
              return cssFiles;
            },
            cssFiles: [],
            logger: createLogger(),
            loader,
            moduleBase: userOptions.moduleBase,
            moduleBasePath: userOptions.moduleBasePath,
            moduleBaseURL: userOptions.moduleBaseURL,
            moduleRootPath: root,
            pipableStreamOptions: userOptions.pipableStreamOptions,
            Html: React.Fragment,
            CssCollector: userOptions.inlineCss ? InlineCssCollector as any : CssCollector as any,
            onCssFile: undefined,
            inlineCss: userOptions.inlineCss,
            propsPath: files.urlMap.get(route)?.props ?? route,
            pagePath: files.urlMap.get(route)?.page ?? route,
            pageExportName: userOptions.pageExportName,
            propsExportName: userOptions.propsExportName,
          });
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
    async generateBundle(_options, bundle) {
      if (!resolvedConfig) {
        throw new Error("Resolved config not found");
      }

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
