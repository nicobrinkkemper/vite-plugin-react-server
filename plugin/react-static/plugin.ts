import { join, dirname } from "node:path";
import { Worker } from "node:worker_threads";
import {
  type ResolvedConfig,
  type UserConfig,
  type Manifest,
  type IndexHtmlTransformHook,
  type Plugin as VitePlugin,
  createLogger,
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
  ReactStreamPluginMeta,
  ResolvedUserConfig,
  ResolvedUserOptions,
} from "../types.js";
import { type StreamPluginOptions } from "../types.js";
import { createWorker } from "../worker/createWorker.js";
import { renderPages } from "../worker/html/renderPages.js";
import { mkdir } from "node:fs/promises";
import { collectManifestClientFiles } from "../collect-manifest-client-files.js";
import { mkdirSync, copyFileSync } from "node:fs";
import { copyDir } from "../copy-dir.js";

let resolvedConfig: ResolvedConfig | null = null;
let loader: ((id: string) => Promise<Record<string, any>>) | null = null;
let worker: Worker;
let htmlTransform: IndexHtmlTransformHook | null = null;
let clientAssets = new Set<string>();

export function reactStaticPlugin(options: StreamPluginOptions): VitePlugin<{
  meta: ReactStreamPluginMeta;
}> {
  const timing: BuildTiming = {
    start: Date.now(),
  };

  let files: CheckFilesExistReturn;
  let root: string = process.cwd();
  let userConfig: ResolvedUserConfig;
  let userOptions: ResolvedUserOptions;
  let pages: string[];
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
      const resolvePagesResult = await resolvePages(userOptions.build.pages);
      if (resolvePagesResult.type === "error") {
        throw resolvePagesResult.error;
      }
      pages = resolvePagesResult.pages;
      files = await checkFilesExist(pages, userOptions, root);

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
      // copy whole client directory to static directory
      await mkdir(staticDir, { recursive: true });
      await copyDir(join(root, userOptions.build.outDir, userOptions.build.client), join(root, userOptions.build.outDir, userOptions.build.static));
      // Add global CSS from index.html - use client manifest
      const {cssFiles: indexCss} = collectManifestClientFiles({
        manifest: clientManifest,
        root: root,
        pagePath: 'index.html',
        moduleBase: userOptions.moduleBase,
        preserveModulesRoot: userOptions.build.preserveModulesRoot,
        testClient: ()=>true,
      });
      indexCss.forEach((css) => globalCss.add(css));

      // Add CSS for each route's page component - use server manifest
      for (const route of pages) {
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
          });
          routeCssMap.set(route, new Set([...globalCss, ...pageCss.cssFiles.keys()]));
        }
      }
      const bootstrapModules = clientManifest["index.html"]?.file
      ? [clientManifest["index.html"].file.startsWith("/")
          ? clientManifest["index.html"].file.slice(1)
          : clientManifest["index.html"].file]
      : [];
      
      const { failedRoutes, completedRoutes} = await renderPages(
        pages,
        files,
        {
          root: root,
          outDir: userOptions.build.outDir,
          htmlOutputPath: join( userOptions.build.outDir, userOptions.build.static, "index.html"),
          pipableStreamOptions: {
            bootstrapModules: bootstrapModules,
          },
          moduleRootPath: join(root, userOptions.build.outDir, userOptions.build.static, userOptions.moduleBasePath),
          moduleBasePath: userOptions.moduleBasePath,
          moduleBaseURL: userOptions.moduleBaseURL,
          inlineCss: userOptions.inlineCss,
          pageExportName: userOptions.pageExportName,
          propsExportName: userOptions.propsExportName,
          Html: userOptions.Html,
          CssCollector: userOptions.CssCollector,
          cssFiles: [],
          logger: createLogger(),
          moduleBase: userOptions.moduleBase,
          worker,
          clientManifest,
          serverManifest,
          loader,
          transformIndexHtml: htmlTransform!,
          onClientJSFile: (url) => {
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
      console.log(`Rendered ${completedRoutes.size} unique routes to ${join(userOptions.build.outDir, userOptions.build.static)}`);
      await worker.terminate();
    },
  };
}
