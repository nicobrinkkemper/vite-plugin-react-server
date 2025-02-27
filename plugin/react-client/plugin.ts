import { type Manifest, type Plugin, type ResolvedConfig } from "vite";
import type {
  CheckFilesExistReturn,
  ResolvedUserConfig,
  ResolvedUserOptions,
  StreamPluginOptions,
} from "../types.js";
import { resolveOptions } from "../config/resolveOptions.js";
import { resolveUserConfig } from "../config/resolveUserConfig.js";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getBundleManifest } from "../helpers/getBundleManifest.js";
import { checkFilesExist } from "../checkFilesExist.js";
import { resolvePages } from "../config/resolvePages.js";
import { tryManifest } from "../helpers/tryManifest.js";
import { createInputNormalizer } from "../helpers/inputNormalizer.js";
import { createWorker } from "../worker/createWorker.js";
import type { Worker } from "node:worker_threads";
import { getPluginRoot } from "../config/getPaths.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import type {
  RscRenderMessage,
  RscWorkerMessage,
  RscWorkerResponse,
} from "../worker/types.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("react-client");
let userOptions: ResolvedUserOptions;
let userConfig: ResolvedUserConfig;
let clientManifest: Manifest = {};
let resolvedConfig: ResolvedConfig;
let root: string;
let loader: (id: string) => Promise<Record<string, any>> = (id: string) =>
  import(id);
let worker: Worker;
let files: CheckFilesExistReturn;

export function reactClientPlugin(options: StreamPluginOptions): Plugin {
  const resolvedOptions = resolveOptions(options, true);
  if (resolvedOptions.type === "error") {
    throw resolvedOptions.error;
  }
  userOptions = resolvedOptions.userOptions;
  root = userOptions.projectRoot;
  const rscWorkerPath = join(getPluginRoot(), DEFAULT_CONFIG.RSC_WORKER_PATH);

  log.info("RSC worker path:" + rscWorkerPath);

  return {
    name: "vite:react-client",

    async config(config, configEnv) {
      if (
        typeof config.root === "string" &&
        config.root !== root &&
        config.root !== process.cwd() &&
        config.root !== ""
      ) {
        root = config.root;
        console.log("[vite:react-client] Root updated:", root);
      }
      if (configEnv.command === "serve" && !configEnv.isPreview && !worker) {
        worker = await createWorker({
          projectRoot: root,
          workerPath: rscWorkerPath,
          reverseCondition: true,
        });
      }
      const pages = await resolvePages(userOptions.build.pages);
      if (pages.type === "error") {
        throw pages.error;
      }

      if (pages.pages.length > 0) {
        files = await checkFilesExist(pages.pages, userOptions, root);
      } else {
        files = {
          pageMap: new Map(),
          propsMap: new Map(),
          propsSet: new Set(),
          pageSet: new Set(),
          urlMap: new Map(),
          errors: [],
        };
      }

      const resolvedConfig = resolveUserConfig({
        isClient: true,
        config,
        configEnv,
        userOptions,
        files,
      });

      if (resolvedConfig.type === "error") {
        throw resolvedConfig.error;
      }

      userConfig = resolvedConfig.userConfig;
      return userConfig;
    },

    configResolved(config) {
      resolvedConfig = config;
    },

    async generateBundle(options, bundle) {
      // Create manifest entries for each chunk
      clientManifest = getBundleManifest(this, bundle, undefined);

      // Write manifest immediately after generation
      const manifestPath = join(
        root,
        resolvedConfig.environments["client"].build.outDir as string,
        resolvedConfig.environments["client"].build.manifest as string
      );
      await mkdir(dirname(manifestPath), { recursive: true });

      return await writeFile(
        manifestPath,
        JSON.stringify(clientManifest, null, 2)
      );
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
        console.log("req.url", req.url);
        const [key, value] = normalize(req.url);
        const fileRoot = key.startsWith("node_modules")
          ? root
          : join(root, userOptions.build.outDir, userOptions.build.client);
        if (value.endsWith(".js")) {
          try {
            const stats = await stat(join(fileRoot, value));
            if (stats.isFile()) {
              const content = await readFile(join(fileRoot, value), "utf-8");
              res.setHeader("Content-Type", "application/javascript");
              res.end(content);
              return;
            } else {
              next();
            }
          } catch (error) {
            const { manifest: clientManifest } = tryManifest({
              root,
              outDir: join(userOptions.build.outDir, userOptions.build.client),
            });
            const { manifest: serverManifest } = tryManifest({
              root,
              outDir: join(userOptions.build.outDir, userOptions.build.server),
            });
            if (clientManifest && value in clientManifest) {
              res.setHeader("Content-Type", "application/javascript");
              res.end(clientManifest[value]);
              return;
            } else if (serverManifest && value in serverManifest) {
              res.setHeader("Content-Type", "application/javascript");
              res.end(serverManifest[value]);
              return;
            }
            const foundClient =
              clientManifest &&
              Object.entries(clientManifest).find(
                ([key, value]) =>
                  value === key ||
                  value === value.file ||
                  value === value.src ||
                  value === value.name
              );
            if (foundClient) {
              res.setHeader("Content-Type", "application/javascript");
              res.end(foundClient);
            }
            const foundServer =
              serverManifest &&
              Object.entries(serverManifest).find(
                ([key, value]) =>
                  value === key ||
                  value === value.file ||
                  value === value.src ||
                  value === value.name
              );

            if (foundServer) {
              res.setHeader("Content-Type", "application/javascript");
              res.end(foundServer);
              return;
            }
            next();
          }
        } else {
          next();
        }
      });
    },
    // setup dev server
    async configureServer(server) {
      if (typeof loader !== "function") {
        loader = server.ssrLoadModule;
      }
      if (!worker) {
        log.info("Creating RSC worker...");
        worker = await createWorker({
          projectRoot: root,
          workerPath: rscWorkerPath,
          condition: "react-client",
        });
        log.info("RSC worker created");
      }
      const normalize = createInputNormalizer({
        root,
        removeExtension: false,
        preserveModulesRoot: userOptions.build.preserveModulesRoot
          ? userOptions.moduleBase
          : undefined,
      });
      server.middlewares.use(async (req, res, next) => {
        if (!req.url) {
          next();
          return;
        }
        if (
          req.url.endsWith(".rsc") ||
          req.headers.accept?.includes("text/x-component")
        ) {
          try {
            const path = req.url?.includes("index.rsc")
              ? req.url.replace("index.rsc", "")
              : req.url?.replace(".rsc", "");
            let [key, value] = normalize(path);

            let pageImport = DEFAULT_CONFIG.PAGE as string;
            let propsImport = DEFAULT_CONFIG.PROPS as string;
            // PAGE
            if (files.urlMap.has(req.url)) {
              pageImport = files.urlMap.get(req.url)!.page;
              propsImport = files.urlMap.get(req.url)!.props;
            } else if (files.urlMap.has(path)) {
              pageImport = files.urlMap.get(path)!.page;
              propsImport = files.urlMap.get(path)!.props;
            } else if (files.urlMap.has(value)) {
              pageImport = files.urlMap.get(value)!.page;
              propsImport = files.urlMap.get(value)!.props;
            } else if (files.urlMap.has(key)) {
              pageImport = files.urlMap.get(key)!.page;
              propsImport = files.urlMap.get(key)!.props;
            } else {
              console.warn("Page/props import not found:", req.url, path, value, key, 'available pages:', Array.from(files.urlMap.keys()));
            }

            // Set headers early
            res.setHeader("Content-Type", "text/x-component");
            res.setHeader("Transfer-Encoding", "chunked");
            res.setHeader("Connection", "keep-alive");

            let hasError = false;
            const timeout = setTimeout(() => {
              if (!hasError) {
                hasError = true;
                res.statusCode = 500;
                res.end("RSC render timeout");
              }
            }, 5000);

            const messageHandler = (
              message: RscWorkerMessage | RscWorkerResponse
            ) => {
              try {
                switch (message.type) {
                  case "RSC_CHUNK":
                    // Write chunk directly to response
                    if (!hasError) {
                      res.write(message.chunk);
                    }
                    break;

                  case "RSC_END":
                    clearTimeout(timeout);
                    if (!hasError) {
                      res.end();
                    }
                    worker.off("message", messageHandler);
                    break;

                  case "ERROR":
                    clearTimeout(timeout);
                    log.error("Render error", message);
                    if (!hasError) {
                      hasError = true;
                      res.statusCode = 500;
                      res.end(message.error);
                    }
                    worker.off("message", messageHandler);
                    break;
                }
              } catch (error) {
                clearTimeout(timeout);
                if (!hasError) {
                  hasError = true;
                  res.statusCode = 500;
                  res.end(
                    error instanceof Error ? error.message : String(error)
                  );
                }
                worker.off("message", messageHandler);
              }
            };

            worker.on("message", messageHandler);
            worker.once("error", (error) => {
              clearTimeout(timeout);
              if (!hasError) {
                hasError = true;
                res.statusCode = 500;
                res.end(error instanceof Error ? error.message : String(error));
              }
              worker.off("message", messageHandler);
            });
            worker.postMessage({
              type: "RSC_RENDER",
              id: value,
              pageImport,
              propsImport,
              url: req.url ?? "/",
              pageExportName:
                userOptions.pageExportName ?? DEFAULT_CONFIG.PAGE_EXPORT_NAME,
              propsExportName:
                userOptions.propsExportName ?? DEFAULT_CONFIG.PROPS_EXPORT_NAME,
              outDir: userOptions.build.outDir,
              projectRoot: root,
              moduleRootPath:
                userOptions.build.preserveModulesRoot === true
                  ? userOptions.moduleBase
                  : "",
              moduleBaseURL: ``,
              moduleBasePath: '/',
              pipableStreamOptions: userOptions.pipableStreamOptions,
              cssFiles: []
            } satisfies RscRenderMessage);
          } catch (error) {
            log.error("Middleware error:", error);
            res.statusCode = 500;
            res.end(error instanceof Error ? error.message : String(error));
          }
        } else {
          next();
        }
      });
    },
  };
}
