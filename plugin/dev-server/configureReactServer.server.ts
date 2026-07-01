import type { ServerResponse } from "http";
import { React } from "../vendor/vendor.server.js";
import { collectViteModuleGraphCss } from "../helpers/collectViteModuleGraphCss.js";
import { createRscStream } from "../stream/createRscStream.server.js";
import { createRenderToPipeableStreamHandler } from "../stream/createRenderToPipeableStreamHandler.server.js";
import { createWorker } from "../worker/createWorker.js";
import type { Worker } from "node:worker_threads";
import { serializedOptions } from "../helpers/serializeUserOptions.js";
import { requestInfo } from "../helpers/requestInfo.js";
import { getRouteFiles } from "../helpers/getRouteFiles.js";
import { handleServerAction } from "./handleServerAction.server.js";
import type { ConfigureReactServerFn } from "./types.js";
import { handleError } from "../error/handleError.js";
import { cleanupWorker } from "../helpers/workerCleanup.js";
import { mergeConfig, type ResolvedConfig } from "vite";
import { resolvePageAndProps } from "../helpers/resolvePageAndProps.js";

export const configureReactServer: ConfigureReactServerFn =
  function _configureReactServer({
    server,
    autoDiscoveredFiles,
    userOptions: _userOptions,
    serverManifest,
    resolvedConfig,
  }) {
    const activeStreams = new Set<ServerResponse>();
    const activeControllers = new Map<
      ServerResponse,
      { abort: (reason?: unknown) => void }
    >();
    let isRestarting = false;
    
    
    const logger = server.config.customLogger || server.config.logger;
    const {
      Html: _UserHtmlComponent,
      // loader config isn't important here, since that's used by the transformer
      loader: _loaderConfig,
      verbose,
      // we can use these directly to create the handler
      ...userHandlerOptions
    } = _userOptions;

    server.config = mergeConfig(
      server.config,
      resolvedConfig
    ) as ResolvedConfig;


    // Handle Vite server restarts
    server.ws.on("restart", (path) => {
      logger.info(
        "[vite-plugin-react-server] 🔧 Plugin changed, preparing for restart:",
        path
      );

      isRestarting = true;

      // Abort all active streams first, then close responses
      for (const res of activeStreams) {
        const controller = activeControllers.get(res);
        if (controller) {
          try {
            controller.abort("Server restarting");
          } catch (e) {
            // Ignore abort errors
          }
        }

        res.writeHead(503, {
          "Content-Type": "text/x-component; charset=utf-8",
          "Retry-After": "1",
        });
        res.end(
          `0:E{"digest":"","name":"Error","message":"Server restarting...","stack":"","env":"Server"}`
        );
      }
      activeStreams.clear();
      activeControllers.clear();

      // Fallback: reset restart flag after a timeout
      setTimeout(() => {
        if (isRestarting) {
          isRestarting = false;
          logger.info(
            "[vite-plugin-react-server] ⏰ Restart timeout, resuming normal operation"
          );
        }
      }, 5000); // 5 second timeout
    });

    // Handle restart completion
    server.ws.on("full-reload", () => {
      isRestarting = false;
      logger.info("[vite-plugin-react-server] ✅ Server restart completed");
    });

    const loader = async (id: string) => {
      const [moduleID, exportName] = id.split("#");
      
      // Determine the full module path
      let fullModulePath: string;
      
      // Check if already an absolute path (from server environment module graph)
      if (moduleID.startsWith(_userOptions.projectRoot)) {
        fullModulePath = moduleID;
      } else {
        // Resolve relative path against project root
        const resolvedModuleID = moduleID.startsWith("/") 
          ? moduleID.slice(1) 
          : moduleID;
        fullModulePath = `${_userOptions.projectRoot}/${resolvedModuleID}`;
      }
      
      // Use server environment runner for proper react-server condition handling
      // This ensures client components are transformed to registerClientReference
      const serverEnv = server.environments['server'];
      let result: Record<string, unknown>;
      
      if (serverEnv && 'runner' in serverEnv && serverEnv.runner) {
        // Vite 6 Environment API: use server environment runner for RSC
        result = await (serverEnv.runner as { import: (url: string) => Promise<Record<string, unknown>> }).import(fullModulePath);
      } else {
        // Fallback to ssrLoadModule (should not happen in Vite 6+)
        result = await server.ssrLoadModule(fullModulePath);
      }
      if (result == null)
        throw new Error(`Module \"${moduleID}\" does not have any exports`);

      if (!Object.keys(result).length && exportName.length)
        throw new Error(
          `Module \"${moduleID}\" is a module, but does not have any exports so it can't find ${exportName}`
        );

      // Always return the full module - callers will extract the specific export if needed
      // This is consistent with how resolvePage and resolveProps work
      return result;
    };
    server.middlewares.use(async (req, res, next) => {
      if (!req.url) {
        return next();
      }
      const handlerOptions = {
        ...userHandlerOptions,
        moduleBaseURL: server.config.base,
        moduleBasePath: userHandlerOptions.moduleBasePath,
        projectRoot: _userOptions.projectRoot,
        css: userHandlerOptions.css,
        loader: loader,
        verbose,
        logger,
        rscStream: res
      };
      const info = requestInfo(req, handlerOptions, "");

      // Handle server actions
      if (info.isServerActionRequest) {
        return handleServerAction(req, res, server, handlerOptions);
      }
      if (!info.isRscRequest) {
        return next();
      }

      // If server is restarting, return 503 immediately
      if (isRestarting) {
        res.writeHead(503, {
          "Content-Type": "text/x-component; charset=utf-8",
          "Retry-After": "1",
        });
        res.end(
          `0:E{"digest":"","name":"Error","message":"Server restarting...","stack":"","env":"Server"}`
        );
        return;
      }

      // Create RSC worker for consistent RSC stream formats
      let rscWorker: Worker | undefined;
      
      try {
        const routeFiles = await getRouteFiles(
          info.route,
          autoDiscoveredFiles,
          _userOptions,
          logger
        );
        if (routeFiles.type === "error") {
          const panicError = handleError({
            error: routeFiles.error,
            logger: logger,
            panicThreshold: userHandlerOptions.panicThreshold,
            critical: false,
            context: "configureReactServer",
          });
          if (panicError != null) {
            return next(panicError);
          }
          return next();
        }
        const pagePath = routeFiles.page;
        const propsPath = routeFiles.props;
        const rootPath = routeFiles.root;

        // Check if we have a page path - if not, skip this route
        if (!pagePath) {
          if (verbose) {
            logger.info(`No page found for route: ${info.route}, skipping`);
          }
          return next();
        }

        if (verbose) {
          logger.info(
            `Components resolved successfully for route: ${info.route}`
          );
        }

        if (verbose) {
          logger.info(
            `PageComponent is valid, creating handler options for route: ${info.route}`
          );
        }

        const handlerOptions = {
          ...userHandlerOptions,
          route: info.route,
          pagePath,
          propsPath,
          logger: logger,
          manifest: serverManifest,
          server,
          moduleBaseURL: server.config.base,
          projectRoot: _userOptions.projectRoot,
          loader: loader,
          verbose: verbose,
        };

        // Load actual components first - this registers them in the module graph
        // which is required for CSS collection to work.
        // The default Root is imported lazily (point-of-use) so the static
        // plugin-import graph never pulls React in at config eval.
        const { Root: DefaultRoot } = await import("../components/root.js");
        let PageComponent: React.ComponentType<any> = React.Fragment;
        let RootComponent: React.ComponentType<any> = DefaultRoot;
        let pageProps: any = {};
        
        // Load the Root component
        if (rootPath) {
          try {
            const rootExportName = userHandlerOptions.rootExportName || "Root";
            const rootModule = await loader(rootPath);

            if (rootModule && rootModule[rootExportName] && typeof rootModule[rootExportName] === 'function') {
              RootComponent = rootModule[rootExportName] as React.ComponentType<any>;
              if (verbose) {
                logger.info(`Loaded Root component for route ${info.route} from ${rootPath}#${rootExportName}`);
              }
            } else if (rootModule && rootModule['default'] && typeof rootModule['default'] === 'function') {
              RootComponent = rootModule['default'] as React.ComponentType<any>;
              if (verbose) {
                logger.info(`Loaded default export as Root component for route ${info.route}`);
              }
            } else {
              if (verbose) {
                logger.warn(`Root component not found in ${rootPath}, using React.Fragment`);
              }
            }
          } catch (error) {
            // A Root-module load failure must not be silently swallowed — that
            // hides real bugs behind the DefaultRoot fallback. Log
            // unconditionally and honor panicThreshold like sibling error paths.
            const panicError = handleError({
              error,
              logger,
              panicThreshold: userHandlerOptions.panicThreshold,
              critical: true,
              context: `configureReactServer: load Root from ${rootPath}`,
              log: true,
            });
            if (panicError != null) {
              return next(panicError);
            }
          }
        }

        // Load the page component (registers it in module graph for CSS collection)
        if (pagePath) {
          try {
            const pageExportName = userHandlerOptions.pageExportName || "Page";
            const pageModule = await loader(pagePath);
            if (pageModule && pageModule[pageExportName] && typeof pageModule[pageExportName] === 'function') {
              PageComponent = pageModule[pageExportName] as React.ComponentType<any>;
              if (verbose) {
                logger.info(`Loaded Page component for route ${info.route} from ${pagePath}#${pageExportName}`);
              }
            } else if (pageModule && pageModule['default'] && typeof pageModule['default'] === 'function') {
              PageComponent = pageModule['default'] as React.ComponentType<any>;
              if (verbose) {
                logger.info(`Loaded default export as Page component for route ${info.route}`);
              }
            } else if (pageModule && typeof pageModule === 'function') {
              PageComponent = pageModule as React.ComponentType<any>;
              if (verbose) {
                logger.info(`Loaded module as Page component for route ${info.route}`);
              }
            } else {
              if (verbose) {
                logger.warn(`Page component not found in ${pagePath}, using React.Fragment`);
              }
            }
          } catch (error) {
            // A page-module load failure was previously swallowed under
            // !verbose, leaving the route to render as a blank Fragment with no
            // error surfaced anywhere. Log unconditionally and honor
            // panicThreshold like sibling error paths.
            const panicError = handleError({
              error,
              logger,
              panicThreshold: userHandlerOptions.panicThreshold,
              critical: true,
              context: `configureReactServer: load Page from ${pagePath}`,
              log: true,
            });
            if (panicError != null) {
              return next(panicError);
            }
          }
        }

        // NOW collect CSS - page is registered in module graph
        if (verbose) {
          logger.info(`Collecting CSS files for route: ${info.route}`);
        }

        const serverEnv = server.environments['server'];
        const moduleGraphForCss = serverEnv?.moduleGraph ?? server.moduleGraph;
        
        const cssFilesResult = await collectViteModuleGraphCss({
          moduleGraph: moduleGraphForCss,
          parentUrl: pagePath,
          handlerOptions: handlerOptions,
        });

        if (verbose) {
          logger.info(`CSS collection completed for route: ${info.route}`);
        }

        if (cssFilesResult.type === "skip") {
          if (verbose) {
            logger.info(`CSS collection skipped for route: ${info.route}, continuing with RSC rendering`);
          }
        }
        if (cssFilesResult.type === "error") {
          return next(cssFilesResult.error);
        }

        const collectedCssFiles = cssFilesResult.type === "success" ? cssFilesResult.cssFiles : new Map();

        if (verbose) {
          logger.info(`Creating RSC handler for route: ${info.route}`);
        }

        // Load props using the resolvePageAndProps helper
        try {
          if (verbose) {
            logger.info(`[configureReactServer] Loading props for route ${info.route}, pagePath: ${pagePath}, propsPath: ${propsPath}, url: ${info.url}`);
          }
          
          // A Web Request for loaders that read headers/cookies. Available only
          // on this dev request thread (undefined in worker/static/edge).
          const reqHeaders = new Headers();
          for (const [k, v] of Object.entries(req.headers)) {
            if (typeof v === "string") reqHeaders.set(k, v);
            else if (Array.isArray(v)) reqHeaders.set(k, v.join(", "));
          }
          const request = new Request(
            new URL(req.url ?? info.url, `http://${req.headers.host ?? "localhost"}`),
            { method: req.method ?? "GET", headers: reqHeaders }
          );

          const propsResult = await resolvePageAndProps({
            pagePath,
            propsPath,
            pageExportName: userHandlerOptions.pageExportName,
            propsExportName: userHandlerOptions.propsExportName,
            url: info.url,
            route: info.route,
            moduleBaseURL: server.config.base,
            routePatterns: userHandlerOptions.routePatterns,
            request,
            loader,
            verbose,
            logger,
            build: {
              rscOutputPath: userHandlerOptions.build?.rscOutputPath || ".rsc",
            },
          });

          if (verbose) {
            logger.info(`[configureReactServer] Props resolution result type: ${propsResult.type}`);
          }

          if (propsResult.type === "success") {
            pageProps = propsResult.pageProps || {};
            if (verbose) {
              logger.info(`[configureReactServer] Loaded props for route ${info.route}: ${JSON.stringify(pageProps, null, 2)}`);
            }
          } else if (propsResult.type === "skip") {
            if (verbose) {
              logger.info(`[configureReactServer] Props resolution skipped for route ${info.route}, using empty props`);
            }
            pageProps = {};
          } else {
            if (verbose) {
              logger.warn(`[configureReactServer] Failed to load props for route ${info.route}: ${propsResult.error}`);
            }
            pageProps = {};
          }
        } catch (error) {
          if (verbose) {
            logger.warn(`[configureReactServer] Error loading props for route ${info.route}: ${error}`);
            if (error instanceof Error) {
              logger.warn(`[configureReactServer] Error stack: ${error.stack}`);
            }
          }
          // Continue with empty props if loading fails
          pageProps = {};
        }

        // DEV MODE OPTIMIZATION: Skip worker, use direct rendering on main thread
        // 
        // Why: In dev:rsc mode, the main thread already has react-server condition and 
        // loads modules via Vite's environment runner which handles HMR automatically.
        // The worker uses raw import() which bypasses Vite's module graph and HMR.
        //
        // Benefits of direct rendering in dev:
        // - Proper HMR: file changes are picked up immediately via Vite's module graph
        // - No module caching issues: environment runner handles cache invalidation
        // - Simpler debugging: all code runs in main thread
        //
        // The worker is still valuable for:
        // - Production builds (isolation, consistent behavior)
        // - Future: Running RSC in different runtimes (workerd, etc.)
        //
        // Users can opt-in to worker in dev via config if needed for testing production behavior.
        const useWorkerInDev = _userOptions.dev?.useRscWorker === true;
        
        if (useWorkerInDev) {
          try {
            if (verbose) {
              logger.info(`Creating RSC worker for route: ${info.route} (useRscWorker=true)`);
            }
            
            const workerResult = await createWorker({
              projectRoot: _userOptions.projectRoot || server.config.root,
              workerData: {
                userOptions: serializedOptions(_userOptions, autoDiscoveredFiles),
                resolvedConfig: server.config,
                configEnv: { command: "serve", mode: "development" },
              },
              verbose,
              logger,
            });
            
            if (workerResult.type === "success") {
              rscWorker = workerResult.worker;
              if (verbose) {
                logger.info(`RSC worker created successfully for route: ${info.route}`);
              }
            } else {
              if (verbose) {
                logger.warn(`RSC worker creation skipped for route: ${info.route}: ${workerResult.reason}`);
              }
            }
          } catch (error) {
            if (verbose) {
              logger.warn(`Failed to create RSC worker for route: ${info.route}: ${error}`);
            }
          }
        } else {
          if (verbose) {
            logger.info(`[dev:rsc] Using direct rendering (no worker) for proper HMR support`);
          }
        }

        // Use worker-based RSC stream if worker is available, otherwise fall back to direct rendering
        // CRITICAL: For RSC requests, use htmlPath: "" for headless mode (no Html wrapper)
        // This prevents hydration errors where <html> would be rendered inside #root div
        const rscResult = rscWorker 
          ? createRscStream({
              ...handlerOptions,
              url: info.url,
              pagePath,
              propsPath,
              rootPath,  // Pass the root path for worker to load
              htmlPath: "",  // Empty string = headless RSC (no Html wrapper)
              rscWorker,
              cssFiles: collectedCssFiles,
              globalCss: new Map(),
            })
          : createRenderToPipeableStreamHandler({
              ...handlerOptions,
              url: info.url,
              PageComponent: PageComponent as any,
              RootComponent: RootComponent as any,
              HtmlComponent: React.Fragment,  // Headless stream - no Html wrapper
              pageProps: pageProps,  // Pass the loaded props
              cssFiles: collectedCssFiles,
            });

        if (verbose) {
          logger.info(
            `RSC handler created for route: ${
              info.route
            }, result type: ${typeof rscResult}, has pipe: ${typeof rscResult?.pipe}, has abort: ${typeof rscResult?.abort}`
          );
        }

        if (rscResult && typeof rscResult.pipe === "function") {
          if (verbose) {
            logger.info(`Setting up RSC stream for route: ${info.route}`);
          }

          // set headers
          res.setHeader("Content-Type", "text/x-component; charset=utf-8");
          
          // CRITICAL: Disable caching in development mode
          // Without this, browsers cache RSC streams and don't show updates
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
          res.setHeader("Pragma", "no-cache");
          res.setHeader("Expires", "0");
          
          // Add CORS headers for RSC files
          const origin = req.headers.origin;
          if (origin && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
            res.setHeader("Access-Control-Allow-Origin", origin);
          } else {
            res.setHeader("Access-Control-Allow-Origin", "*");
          }
          res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
          res.setHeader("Access-Control-Allow-Headers", "Accept, Content-Type");
          res.setHeader("Access-Control-Max-Age", "86400");
          rscResult.pipe(res);

          // Store the controller for potential abort during restart
          activeControllers.set(res, rscResult);
        } else {
          if (verbose) {
            logger.error(
              `RSC handler failed for route: ${
                info.route
              }, invalid result: ${typeof rscResult}`
            );
          }
          // Handle the error case
          res.statusCode = 500;
          res.end("Internal Server Error");
        }
        activeStreams.add(res);
        res.on("close", () => {
          activeStreams.delete(res);
          
          // Abort the RSC stream to clean up MessagePorts
          const controller = activeControllers.get(res);
          if (controller && typeof controller.abort === "function") {
            try {
              controller.abort();
            } catch (error) {
              // Ignore cleanup errors
            }
          }
          activeControllers.delete(res);
          
          // Clean up worker when request completes
          cleanupWorker(rscWorker);
        });
      } catch (error) {
        // Always log RSC stream errors (regardless of verbose) so a misconfigured
        // app surfaces the underlying error in the dev server log without
        // forcing the user to flip `verbose: true`.
        const panicError = handleError({
          error,
          logger,
          panicThreshold: handlerOptions.panicThreshold,
          critical: false,
          context: "configureReactServer",
          log: true,
        });
        if (panicError != null) {
          return next(panicError);
        }

        // Surface the failure to the HTTP client. Previously we set status 500
        // but never ended the response, so the request would hang and any
        // already-flushed bytes (none yet, since we set headers right before
        // pipe()) would be all the caller saw. Emit a text/plain 500 with the
        // error message so dev clients (curl, the React fetcher) get a clear
        // failure instead of an empty 200 / hanging socket.
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
        }
        if (!res.writableEnded) {
          const message = error instanceof Error ? error.message : String(error);
          res.end(`RSC render failed: ${message}\n`);
        }

        // Note: Worker cleanup is handled by the response close handler
      }
    });
  };
