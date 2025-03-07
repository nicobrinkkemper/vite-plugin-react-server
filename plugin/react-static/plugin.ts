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
import { mkdir } from "node:fs/promises";
import { createInputNormalizer } from "../helpers/inputNormalizer.js";
import { collectManifestClientFiles } from "../collect-manifest-client-files.js";
import { mkdirSync, copyFileSync, Stats } from "node:fs";

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
let htmlContent = new Map<string, string>();

function formatDuration(seconds: number): string {
  if (seconds < 0.001) {
    return `${(seconds * 1000000).toFixed(0)}μs`;
  }
  if (seconds < 1) {
    return `${(seconds * 1000).toFixed(0)}ms`;
  }
  return `${seconds.toFixed(2)}s`;
}

export function reactStaticPlugin(options: StreamPluginOptions): VitePlugin<{
  meta: ReactStreamPluginMeta;
}> {
  const timing: BuildTiming = {
    start: Date.now(),
  };

  let files: CheckFilesExistReturn;
  let clientComponents = new Set<string>();
  let buildCssFiles = new Set<string>();
  let root: string = process.cwd();
  let userConfig: ResolvedUserConfig;
  let userOptions: ResolvedUserOptions;
  let normalizer: InputNormalizer;
  let resolvedPages: string[];
  let serverManifest: Manifest = {};
  let clientManifest: Manifest = {};


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
    removeExtension: true,
    preserveModulesRoot:
      userOptions.build.preserveModulesRoot === true
        ? userOptions.moduleBase
        : undefined,
  });
  return {
    name: "vite:plugin-react-server/static",
    enforce: "post",
    api: {
      meta: { timing },
    },
    async config(config, configEnv): Promise<UserConfig> {
      if (
        typeof config.root === "string" &&
        config.root !== root &&
        config.root !== process.cwd() &&
        config.root !== ""
      ) {
        root = config.root;
      }
      const resolvedPagesResult = await resolvePages(userOptions.build.pages);
      if (resolvedPagesResult.type === "error") {
        throw resolvedPagesResult.error;
      }
      resolvedPages = resolvedPagesResult.pages;
      files = await checkFilesExist(resolvedPages, userOptions, root);

      const resolvedConfig = resolveUserConfig({
        isStatic: true,
        config,
        configEnv,
        userOptions,
        files,
      });

      if (resolvedConfig.type === "error") {
        throw resolvedConfig.error;
      }

      userConfig = resolvedConfig.userConfig;
      timing.configResolved = Date.now();
      return {};
    },
    async buildStart() {
      timing.buildStart = Date.now();
    },
    async closeBundle() {
      timing.renderStart = Date.now();

      // Create the loader
      const serverManifestResult = tryManifest({
        root: root,
        outDir: join(userOptions.build.outDir, userOptions.build.server),
        ssrManifest: false,
      });
      if (serverManifestResult.type === "error") {
        throw serverManifestResult.error;
      }
      serverManifest = serverManifestResult.manifest;

      // Get the client manifest
      const clientManifestResult = tryManifest({
        root: root,
        outDir: join(userOptions.build.outDir, userOptions.build.client),
        ssrManifest: false,
      });

      if (clientManifestResult.type === "error") {
        throw clientManifestResult.error;
      }
      clientManifest = clientManifestResult.manifest;

      // Ensure static directory exists
      const staticDir = join(root, userOptions.build.outDir, userOptions.build.static);
      await mkdir(staticDir, { recursive: true });

      worker = await createWorker({
        projectRoot: root,
        workerPath: userOptions.htmlWorkerPath,
        condition: "react-server",
        reverseCondition: true,
        mode: (resolvedConfig?.mode ?? "production") as "production" | "development",
      });

      if (!resolvedPages) {
        const resolvedPagesResult = await resolvePages(userOptions.build.pages);
        if (resolvedPagesResult.type === "error") {
          throw resolvedPagesResult.error;
        }
        resolvedPages = resolvedPagesResult.pages;
      }

      if (typeof loader !== "function") {
        loader = createBuildLoader({
          root: root,
          userConfig,
          userOptions,
          pluginContext: this,
          serverManifest,
          clientManifest,
        });
      }

      // Collect CSS files per route
      const routeCssMap = new Map<string, Set<string>>();
      const globalCss = new Set<string>();

      // Add global CSS from index.html - use client manifest
      const {cssFiles: indexCss} = collectManifestClientFiles({
        manifest: clientManifest,
        root: root,
        pagePath: 'index.html',
        moduleBase: userOptions.moduleBase,
        preserveModulesRoot: userOptions.build.preserveModulesRoot,
        onClientModule: (css, parentUrl) => {
          // copy the css file to the static directory
          const targetPath = join(root, userOptions.build.outDir, userOptions.build.client, css);
          const destinationPath = join(root, userOptions.build.outDir, userOptions.build.static, css);
          mkdirSync(dirname(destinationPath), { recursive: true });
          copyFileSync(targetPath, destinationPath);
        },
        testClient: ()=>true,
      });
      indexCss.forEach((css) => globalCss.add(css));

      // Add CSS for each route's page component - use server manifest
      for (const route of resolvedPages) {
        const routeFiles = files.urlMap.get(route);
        if (routeFiles) {
          const pageCss = collectManifestClientFiles({
            manifest: serverManifest,
            root: root,
            pagePath: routeFiles.page,
            moduleBase: userOptions.moduleBase,
            preserveModulesRoot: userOptions.build.preserveModulesRoot,
            onClientModule(path) {
              // copy the css file to the static directory
              const targetPath = join(root, userOptions.build.outDir, userOptions.build.server, path);
              const destinationPath = join(root, userOptions.build.outDir, userOptions.build.static, path);
              mkdirSync(dirname(destinationPath), { recursive: true });
              copyFileSync(targetPath, destinationPath);
            },
            testClient: userOptions.autoDiscover.cssPattern,
            testJson: userOptions.autoDiscover.jsonPattern,
            testCss: userOptions.autoDiscover.cssPattern,
          });
          routeCssMap.set(route, new Set([...globalCss, ...pageCss.cssFiles.keys()]));
        }
      }
      const bootstrapModules = clientManifest["index.html"]?.file
      ? [clientManifest["index.html"].file.startsWith("/")
          ? clientManifest["index.html"].file.slice(1)
          : clientManifest["index.html"].file]
      : [];
      
      const { failedRoutes, completedRoutes } = await renderPages(
        this,
        resolvedPages,
        files,
        {
          pipableStreamOptions: {
            bootstrapModules: clientManifest["index.html"]?.file
              ? [clientManifest["index.html"].file.startsWith("/")
                  ? clientManifest["index.html"].file.slice(1)
                  : clientManifest["index.html"].file]
              : [],
          },
          moduleBasePath: userOptions.moduleBase,
          moduleBaseURL: userOptions.moduleBaseURL,
          userConfig,
          pluginOptions: userOptions,
          worker,
          clientManifest,
          serverManifest,
          loader,
          transformIndexHtml: htmlTransform!,
          onClientJSFile: (url: string, parentUrl: string) => {
            if (!clientAssets.has(url)) {
              const clientPath = join(root, userOptions.build.outDir, userOptions.build.client, url);
              const targetPath = join(root, userOptions.build.outDir, userOptions.build.static, url);
              mkdirSync(dirname(targetPath), { recursive: true });
              copyFileSync(clientPath, targetPath);
              clientAssets.add(url);
            }
          }
        }
      );

      if (failedRoutes.size > 0) {
        console.error(
          "[vite-plugin-react-server] Failed to render routes:",
          failedRoutes
        );
      }

      await worker.terminate();
    },
  };
}
