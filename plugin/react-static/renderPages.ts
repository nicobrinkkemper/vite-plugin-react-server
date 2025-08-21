/**
 * renderPages.ts
 *
 * PURPOSE: Renders multiple pages in parallel with proper error handling
 *
 * This module:
 * 1. Takes a list of routes and renders each page
 * 2. Handles errors gracefully with configurable panic thresholds
 * 3. Collects metrics for each rendered page
 * 4. Supports retrying failed routes with fallback components
 * 5. Retries failed routes with no-op Page component for minimal HTML shells
 */
import type { RenderPagesResult, RenderPageResult } from "../types.js";
import type { RenderPagesFn} from "./types.js";
import { handleError } from "../error/handleError.js";
import { fileWriter } from "./fileWriter.js";
import { routeToURL } from "../utils/routeToURL.js";
import type { Manifest } from "vite";
import { createRenderMetrics } from "../metrics/createRenderMetrics.js";
import { createStreamMetrics } from "../metrics/createStreamMetrics.js";

function resolvePathWithManifest(path: string, manifest: Manifest): string {
  const entry = manifest[path];
  if (entry && entry.file) {
    return entry.file;
  }
  return path;
}

/**
 * Renders all pages for static generation
 * 
 * This function:
 * 1. Iterates through all routes in the urlMap
 * 2. Renders each page using the provided renderPage function
 * 3. Writes both RSC and HTML files for each route
 * 4. Handles errors according to panic threshold
 * 5. Retries failed routes with no-op Page component for minimal HTML shells
 */
export const renderPages: RenderPagesFn = (routes, handlerOptions, renderPage) => {
  const { autoDiscoveredFiles, cssFilesByPage, manifest = {}, ...options } = handlerOptions;
  const completedRoutes = new Set<string>();
  const failedRoutes = new Map<string, unknown>();

  const results = new Map<
    string,
    RenderPageResult
  >();

  if (!autoDiscoveredFiles.urlMap) {
    throw new Error("No urlMap provided to renderPages");
  }

  return (async function* _renderPages() {
    // First pass: render all routes normally
    for (const route of routes) {
      // Check for abort signal
      if (options.signal?.aborted) {
        throw options.signal.reason || new Error("Build aborted");
      }
      const { page, props, root, html } =
        autoDiscoveredFiles.urlMap.get(route) || {};
      if (!page) continue;

      try {
        
        const resolvedPagePath = page ? resolvePathWithManifest(page, manifest) : undefined;
        const resolvedPropsPath = props ? resolvePathWithManifest(props, manifest) : undefined;
        const resolvedRootPath = root ? resolvePathWithManifest(root, manifest) : undefined;
        const resolvedHtmlPath = html ? resolvePathWithManifest(html, manifest) : undefined;

        if (options.verbose) {
          options.logger?.info(`[renderPages] Resolved paths for route ${route}:`);
          options.logger?.info(`  page: ${page} -> ${resolvedPagePath}`);
          options.logger?.info(`  props: ${props} -> ${resolvedPropsPath}`);
          options.logger?.info(`  root: ${root} -> ${resolvedRootPath}`);
          options.logger?.info(`  html: ${html} -> ${resolvedHtmlPath}`);
        }
        if(options.verbose) { 
          options.logger?.info(`[renderPages] Global CSS: ${options.globalCss?.size} files`);
          for (const [key, value] of options.globalCss?.entries() ?? []) {
            options.logger?.info(`[renderPages] Global CSS: ${key} -> ${value.as} (${value.children ? 'inline' : 'link'})`);
          }
          options.logger?.info(`[renderPages] CSS files: ${cssFilesByPage.get(route)?.size} files`);      
          for (const [key, value] of cssFilesByPage.get(route)?.entries() ?? []) {
            options.logger?.info(`[renderPages] CSS file: ${key} -> ${value.as} (${value.children ? 'inline' : 'link'})`);
          }
        } 

        const pageRenderer = renderPage({
          ...options,
          manifest,
          route,
          pagePath: resolvedPagePath as string,
          propsPath: resolvedPropsPath as string,
          rootPath: resolvedRootPath as string,
          htmlPath: resolvedHtmlPath as string,
          cssFiles: cssFilesByPage.get(route) ?? new Map(),
          // Ensure global CSS is available to Html component
          globalCss: options.globalCss ?? new Map(),
          // Add required fields that are missing from RenderPagesHandlerOptions
          PageComponent: undefined as any,
          RootComponent: undefined as any,
          HtmlComponent: undefined as any,
          url: routeToURL(route, options.moduleBaseURL, options.build.rscOutputPath),
          pageProps: undefined,
          // Ensure onMetrics and onEvent are passed through
          onMetrics: options.onMetrics,
          onEvent: options.onEvent,
        });

        if (options.verbose) {
          options.logger?.info(`[renderPages] Starting to process route: ${route}`);
        }

        for await (const result of pageRenderer) {
          if (options.verbose) {
            options.logger?.info(`[renderPages] Received result for route ${route}: ${result.type}`);
          }

          if (result.type === "skip") {
            if (options.verbose) {
              options.logger?.info(`[renderPages] Skipping route ${route}: ${result.reason}`);
            }
            continue;
          }

          if (result.type === "error") {
            if (options.verbose) {
              options.logger?.error(`[renderPages] Error for route ${route}: ${result.error}`);
            }
            failedRoutes.set(route, result.error);
            yield {
              type: "error",
              error: result.error,
              route: route,
              failedRoutes,
              completedRoutes,
              results,
            } satisfies RenderPagesResult;
            continue;
          }

          if (result.type === "success") {
            if (options.verbose) {
              options.logger?.info(`[renderPages] Success for route ${route}, starting file writes`);
            }
            completedRoutes.add(route);
            // Store the result with the correct type structure
            results.set(route, {
              type: "success",
              html: result.html,
              rsc: result.rsc,
              metrics: result.metrics,
            });
            
            // Write files directly in renderPages
            try {
              // Create a wrapper onEvent that calls both the renderPage's event handler and the original onEvent
              const wrapperOnEvent = (event: any) => {
                // Call the original onEvent first
                if (options.onEvent) {
                  options.onEvent(event);
                }
                
                // Handle route.error events
                if (event.type === "route.error") {
                  if (event.data.isPanic) {
                    // This is a panic threshold error, throw it to cause the build to fail
                    throw event.data.error;
                  }
                  // For non-panic errors, just log and continue
                  options.logger?.warn(`[renderPages] Non-panic error for route ${event.data.route}: ${event.data.error.message}`);
                }
                
                // Handle metrics collection here since the renderPage function's event handler is not being called
                if (event.type === "file.write.done" && event.data.route === route) {
                  const routeResult = results.get(route);
                  if (routeResult && routeResult.type === "success") {
                    if (event.data.fileType === "html") {
                      // Update HTML metrics with actual file data
                      const endTime = performance.now();
                      const htmlMetrics = createRenderMetrics({
                        route: route,
                        type: routeResult.metrics.html.type,
                        fromMainThread: routeResult.metrics.html.fromMainThread,
                        fromRscWorker: routeResult.metrics.html.fromRscWorker,
                        fromHtmlWorker: routeResult.metrics.html.fromHtmlWorker,
                        fileSize: event.data.content.length,
                        chunks: event.data.chunks || 0,
                        processingTime: endTime - routeResult.metrics.html.streamMetrics.startTime,
                        chunkRate: (event.data.chunks || 0) / ((endTime - routeResult.metrics.html.streamMetrics.startTime) / 1000),
                        fileName: event.data.fileName,
                        outputPath: event.data.path,
                        baseDir: event.data.baseDir,
                        routePath: event.data.routePath,
                        streamMetrics: createStreamMetrics({
                          ...routeResult.metrics.html.streamMetrics,
                          chunks: event.data.chunks || 0,
                          bytes: event.data.content.length,
                          duration: endTime - routeResult.metrics.html.streamMetrics.startTime,
                          endTime: endTime,
                        }),
                      });
                      
                      if (options.onMetrics) {
                        options.onMetrics(htmlMetrics);
                      }
                      
                      // Also emit RSC Full metrics (the RSC chunks sent to HTML worker)
                      const rscFullEndTime = performance.now();
                      const rscFullMetrics = createRenderMetrics({
                        route: route,
                        type: routeResult.metrics.rscFull.type,
                        fromMainThread: routeResult.metrics.rscFull.fromMainThread,
                        fromRscWorker: routeResult.metrics.rscFull.fromRscWorker,
                        fromHtmlWorker: routeResult.metrics.rscFull.fromHtmlWorker,
                        processingTime: rscFullEndTime - routeResult.metrics.rscFull.streamMetrics.startTime,
                        chunks: routeResult.metrics.rscFull.streamMetrics.chunks,
                        chunkRate: routeResult.metrics.rscFull.streamMetrics.chunks / ((rscFullEndTime - routeResult.metrics.rscFull.streamMetrics.startTime) / 1000),
                        fileName: event.data.fileName,
                        outputPath: event.data.path,
                        baseDir: event.data.baseDir,
                        routePath: event.data.routePath,
                        streamMetrics: createStreamMetrics({
                          ...routeResult.metrics.rscFull.streamMetrics,
                          duration: rscFullEndTime - routeResult.metrics.rscFull.streamMetrics.startTime,
                          endTime: rscFullEndTime,
                        }),
                        // this stream is consumed by the html stream
                      });
                      
                      if (options.onMetrics) {
                        options.onMetrics(rscFullMetrics);
                      }
                      
                    } else if (event.data.fileType === "rsc") {
                      // Update RSC metrics with actual file data
                      const rscEndTime = performance.now();
                      const rscMetrics = createRenderMetrics({
                        route: route,
                        type: routeResult.metrics.rscHeadless.type,
                        fromMainThread: routeResult.metrics.rscHeadless.fromMainThread,
                        fromRscWorker: routeResult.metrics.rscHeadless.fromRscWorker,
                        fromHtmlWorker: routeResult.metrics.rscHeadless.fromHtmlWorker,
                        fileSize: event.data.content.length,
                        chunks: event.data.chunks || 0,
                        processingTime: rscEndTime - routeResult.metrics.rscHeadless.streamMetrics.startTime,
                        chunkRate: (event.data.chunks || 0) / ((rscEndTime - routeResult.metrics.rscHeadless.streamMetrics.startTime) / 1000),
                        fileName: event.data.fileName,
                        outputPath: event.data.path,
                        baseDir: event.data.baseDir,
                        routePath: event.data.routePath,
                        streamMetrics: createStreamMetrics({
                          ...routeResult.metrics.rscHeadless.streamMetrics,
                          chunks: event.data.chunks || 0,
                          bytes: event.data.content.length,
                          duration: rscEndTime - routeResult.metrics.rscHeadless.streamMetrics.startTime,
                          endTime: rscEndTime,
                        }),
                      });
                      
                      if (options.onMetrics) {
                        options.onMetrics(rscMetrics);
                      }
                    }
                  }
                }
              };

              // Create a wrapper that calls the renderPage's event handler
              const renderPageOnEvent = (event: any) => {
                // This will be called by the renderPage function's event handler
                wrapperOnEvent(event);
              };

              const rscWritePromise = fileWriter(
                result.rsc as any,
                "rsc",
                {
                  ...options,
                  route,
                  onEvent: renderPageOnEvent,
                  logger: options.logger,
                },
                options.signal
              );

              const htmlWritePromise = fileWriter(
                result.html as any,
                "html",
                {
                  ...options,
                  route,
                  onEvent: renderPageOnEvent,
                  logger: options.logger,
                },
                options.signal
              );

              // Wait for both files to be written
              await Promise.all([rscWritePromise, htmlWritePromise]);

              // Metrics are now handled by the individual renderPage functions
              // No need to duplicate metrics collection here

              if (options.verbose) {
                options.logger?.info(
                  `[renderPages] Successfully wrote files for route: ${route}`
                );
              }
            } catch (error) {
              if (options.verbose) {
                options.logger?.error(
                  `[renderPages] Failed to write files for route: ${route}: ${error}`
                );
              }
              // If file writing fails, treat it as a failed route
              failedRoutes.set(route, error);
              completedRoutes.delete(route);
              results.delete(route);
            }

            // Yield after each page is completed
            yield {
              type: "success",
              completedRoutes,
              failedRoutes,
              results,
            } satisfies RenderPagesResult;
          }
        }
      } catch (err) {
        const panicError = handleError({
          error: err,
          logger: options.logger,
          panicThreshold: options.panicThreshold,
          context: `renderPages(${route})`,
        });
        
        // Clean up any resources that might have been created
        try {
          // Clear any cached state for this route
          results.delete(route);
          completedRoutes.delete(route);
          
          // Add to failed routes
          if (panicError != null) {
            failedRoutes.set(route, panicError);
          } else {
            failedRoutes.set(route, err);
          }
        } catch (cleanupError) {
          options.logger?.warn(`Failed to cleanup resources for route ${route}: ${cleanupError}`);
        }
        
        yield {
          type: "error",
          failedRoutes,
          completedRoutes,
          results,
        } satisfies RenderPagesResult;
    
        // For panicThreshold: "none", stop processing additional routes when there's an error
        // This prevents the build from continuing with broken pages
        if (options.panicThreshold === "none") {
          if (options.verbose) {
            options.logger.info(`[renderPages] Stopping render loop due to error with panicThreshold: "none"`);
          }
          break;
        }
      }
    }

    if (options.verbose) {
      options.logger.info(
        `[renderPages] Final state - completedRoutes: ${completedRoutes.size}, failedRoutes: ${failedRoutes.size}`
      );
    }

    if (options.verbose) {
      options.logger.info(`[renderPages] Returning success result`);
    }

    if (options.verbose) {
      options.logger.info(`[renderPages] About to return success result`);
    }

    const isError =
      options.panicThreshold === "all_errors" && failedRoutes.size > 0;

    return {
      type: isError ? "error" : "success",
      completedRoutes,
      failedRoutes: failedRoutes,
      results,
    } satisfies RenderPagesResult;
  })();
};

