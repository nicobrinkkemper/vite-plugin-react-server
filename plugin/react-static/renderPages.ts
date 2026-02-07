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
import type { RenderPagesFn } from "./types.js";
import { handleError } from "../error/handleError.js";
import { shouldCausePanic } from "../error/panicThresholdHandler.js";
import { fileWriter } from "./fileWriter.js";

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
export const renderPages: RenderPagesFn = (
  routes,
  handlerOptions,
  renderPage
) => {
  const {
    autoDiscoveredFiles,
    cssFilesByPage,
    manifest = {},
    ...options
  } = handlerOptions;
  const completedRoutes = new Set<string>();
  const failedRoutes = new Map<string, unknown>();
  const activeStreams = new Map<string, { html: { abort: (reason?: unknown) => void }, rsc: { abort: (reason?: unknown) => void } }>();

  const results = new Map<string, RenderPageResult>();

  if (!autoDiscoveredFiles.urlMap) {
    // Return an error result instead of throwing
    return (async function* _renderPages(): AsyncGenerator<RenderPagesResult, RenderPagesResult, unknown> {
      yield {
        type: "error",
        error: new Error("No urlMap provided to renderPages"),
        route: "",
        failedRoutes: new Map(),
        completedRoutes: new Set(),
        results: new Map(),
      } satisfies RenderPagesResult;
      return {
        type: "error",
        error: new Error("No urlMap provided to renderPages"),
        route: "",
        failedRoutes: new Map(),
        completedRoutes: new Set(),
        results: new Map(),
      } satisfies RenderPagesResult;
    })();
  }

  return (async function* _renderPages(): AsyncGenerator<RenderPagesResult, RenderPagesResult, unknown> {
    // First pass: render all routes normally
    for (const route of routes) {
      // Check for abort signal
      if (options.signal?.aborted) {
        yield {
          type: "error",
          error: options.signal.reason || new Error("Build aborted"),
          route: route,
          failedRoutes,
          completedRoutes,
          results,
        } satisfies RenderPagesResult;
        return {
          type: "error",
          error: options.signal.reason || new Error("Build aborted"),
          route: route,
          failedRoutes,
          completedRoutes,
          results,
        } satisfies RenderPagesResult;
      }
      const { page, props, root, html } =
        autoDiscoveredFiles.urlMap.get(route) || {};
      if (!page) continue;

      try {
        const resolvedPagePath = page
          ? resolvePathWithManifest(page, manifest)
          : undefined;
        const resolvedPropsPath = props
          ? resolvePathWithManifest(props, manifest)
          : undefined;
        const resolvedRootPath = root
          ? resolvePathWithManifest(root, manifest)
          : undefined;
        const resolvedHtmlPath = html
          ? resolvePathWithManifest(html, manifest)
          : undefined;

        if (options.verbose) {
          options.logger?.info(
            `[renderPages] Resolved paths for route ${route}:`
          );
          options.logger?.info(`  page: ${page} -> ${resolvedPagePath}`);
          options.logger?.info(`  props: ${props} -> ${resolvedPropsPath}`);
          options.logger?.info(`  root: ${root} -> ${resolvedRootPath}`);
          options.logger?.info(`  html: ${html} -> ${resolvedHtmlPath}`);
        }
        if (options.verbose) {
          options.logger?.info(
            `[renderPages] Global CSS: ${options.globalCss?.size} files`
          );
          for (const [key, value] of options.globalCss?.entries() ?? []) {
            options.logger?.info(
              `[renderPages] Global CSS: ${key} -> ${value.as} (${
                value.children ? "inline" : "link"
              })`
            );
          }
          options.logger?.info(
            `[renderPages] CSS files: ${cssFilesByPage.get(route)?.size} files`
          );
          for (const [key, value] of cssFilesByPage.get(route)?.entries() ??
            []) {
            options.logger?.info(
              `[renderPages] CSS file: ${key} -> ${value.as} (${
                value.children ? "inline" : "link"
              })`
            );
          }
        }

        // Create a wrapper onEvent that handles route.error events in renderPages
        const renderPageWrapperOnEvent = (event: any) => {
          // Call the original onEvent first
          if (options.onEvent) {
            options.onEvent(event);
          }

          // Handle route.error events here in renderPages
          if (event.type === "route.error") {
            // Make panic decision in the main thread based on panicThreshold
            const detectedPanicError = handleError({
              error: event.data.error,
              logger: options.logger,
              panicThreshold: event.data.panicThreshold,
              context: `route.error (${event.data.route})`,
            });
            
            if (detectedPanicError != null) {
              // This is a panic threshold error, add it to failed routes
              options.logger?.error(
                `[renderPages] Panic error for route ${event.data.route}: ${event.data.error.message}`
              );
              failedRoutes.set(event.data.route, event.data.error);
            } else {
              // For non-panic errors, just log and continue
              options.logger?.warn(
                `[renderPages] Non-panic error for route ${event.data.route}: ${event.data.error.message}`
              );
            }
          }
        };

        // Create unique handler options for this route
        const routeHandlerOptions = {
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
          // Generate unique ID for this route
          id: `${route}-${Date.now()}-${Math.random()
            .toString(36)
            .substring(2, 11)}`,
          // Override onEvent to use our wrapper
          onEvent: renderPageWrapperOnEvent,
        };

        const pageRenderer = renderPage(routeHandlerOptions);

        if (options.verbose) {
          options.logger?.info(
            `[renderPages] Starting to process route: ${route}`
          );
        }

        for await (const result of pageRenderer) {
          if (options.verbose) {
            options.logger?.info(
              `[renderPages] Received result for route ${route}: ${result.type}`
            );
          }

          if (result.type === "skip") {
            if (options.verbose) {
              options.logger?.info(
                `[renderPages] Skipping RSC for route ${route} due to error: ${result.reason}`
              );
            }

            // For skipped routes, we still want to write the HTML file (client-only)
            // but skip the RSC file since there was a server error
            failedRoutes.set(route, result.reason);

            // Store the result with the streams provided by renderPage
            results.set(route, {
              type: "success",
              html: result.html,
              rsc: result.rsc,
              metrics: result.metrics,
            });

            // Write both HTML and RSC files for skipped routes (RSC will be empty)
            try {
              const wrapperOnEvent = (event: any) => {
                if (options.onEvent) {
                  options.onEvent(event);
                }

                // Handle metrics for HTML-only writes
                if (
                  event.type === "file.write.done" &&
                  event.data.route === route &&
                  event.data.fileType === "html"
                ) {
                  const routeResult = results.get(route);
                  if (routeResult && routeResult.type === "success") {
                    const endTime = performance.now();
                    const htmlMetrics = createRenderMetrics({
                      route: route,
                      type: routeResult.metrics.html.type,
                      fromMainThread: routeResult.metrics.html.fromMainThread,
                      fromRscWorker: routeResult.metrics.html.fromRscWorker,
                      fromHtmlWorker: routeResult.metrics.html.fromHtmlWorker,
                      fileSize: event.data.content.length,
                      chunks: event.data.chunks || 0,
                      processingTime:
                        endTime -
                        routeResult.metrics.html.streamMetrics.startTime,
                      chunkRate:
                        (event.data.chunks || 0) /
                        ((endTime -
                          routeResult.metrics.html.streamMetrics.startTime) /
                          1000),
                      fileName: event.data.fileName,
                      outputPath: event.data.path,
                      baseDir: event.data.baseDir,
                      routePath: event.data.routePath,
                      streamMetrics: createStreamMetrics({
                        ...routeResult.metrics.html.streamMetrics,
                        chunks: event.data.chunks || 0,
                        bytes: event.data.content.length,
                        duration:
                          endTime -
                          routeResult.metrics.html.streamMetrics.startTime,
                        endTime: endTime,
                      }),
                    });

                    if (options.onMetrics) {
                      options.onMetrics(htmlMetrics);
                    }
                  }
                }
              };

              const rscWritePromise = fileWriter(
                result.rsc as any,
                "rsc",
                {
                  ...options,
                  route,
                  onEvent: wrapperOnEvent,
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
                  onEvent: wrapperOnEvent,
                  logger: options.logger,
                },
                options.signal
              );

              // Wait for both RSC and HTML files to be written
              await Promise.all([rscWritePromise, htmlWritePromise]);

              completedRoutes.add(route);

              if (options.verbose) {
                options.logger?.info(
                  `[renderPages] Wrote HTML-only file for skipped route: ${route}`
                );
              }
            } catch (writeError) {
              if (options.verbose) {
                options.logger?.error(
                  `[renderPages] Failed to write HTML for skipped route ${route}: ${writeError}`
                );
              }
              // Remove from completed routes if HTML write failed
              completedRoutes.delete(route);
            }

            continue;
          }

          if (result.type === "error") {
            if (options.verbose) {
              options.logger?.error(
                `[renderPages] Error for route ${route}: ${result.error}`
              );
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
              options.logger?.info(
                `[renderPages] Success for route ${route}, starting file writes`
              );
            }
            completedRoutes.add(route);
            // Store the result with the correct type structure
            results.set(route, {
              type: "success",
              html: result.html,
              rsc: result.rsc,
              metrics: result.metrics,
            });

            // Store active streams for potential abortion during cancellation
            activeStreams.set(route, {
              html: result.html,
              rsc: result.rsc,
            });

            // Write files directly in renderPages
            try {
              // Create a wrapper onEvent that calls both the renderPage's event handler and the original onEvent
              const wrapperOnEvent = (event: any) => {
                try {
                  // Call the original onEvent first
                  if (options.onEvent) {
                    options.onEvent(event);
                  }
                } catch (error) {
                  // If onEvent throws an error (e.g., build cancellation), we need to stop processing
                  // This prevents the worker from continuing to process after the build is cancelled
                  options.logger?.error(`[renderPages] onEvent handler threw error: ${(error as Error).message}`);
                  
                  // First, abort all active streams to stop data flow
                  // This is critical to prevent unhandled errors and memory leaks
                  for (const [, streams] of activeStreams) {
                    try {
                      streams.html.abort("Build cancelled");
                      streams.rsc.abort("Build cancelled");
                    } catch (abortError) {
                      // Streams may already be closed, ignore
                    }
                  }
                  
                  // Then send shutdown signal to worker to prevent it from continuing to process
                  if (options.rscWorker) {
                    try {
                      options.rscWorker.postMessage({
                        type: "SHUTDOWN",
                        id: "*",
                      });
                    } catch (shutdownError) {
                      // Worker may already be terminated, ignore
                    }
                  }
                  
                  // Re-throw the error to stop the build process
                  throw error;
                }

                // Handle route.error events
                if (event.type === "route.error") {
                  // Make panic decision in the main thread based on panicThreshold
                  const detectedPanicError = handleError({
                    error: event.data.error,
                    logger: options.logger,
                    panicThreshold: event.data.panicThreshold,
                    context: `route.error (${event.data.route})`,
                  });
                  
                  if (detectedPanicError != null) {
                    // This is a panic threshold error, add it to failed routes to be yielded
                    options.logger?.error(
                      `[renderPages] Panic error for route ${event.data.route}: ${event.data.error.message}`
                    );
                    failedRoutes.set(event.data.route, event.data.error);
                  } else {
                    // For non-panic errors, just log and continue
                    options.logger?.warn(
                      `[renderPages] Non-panic error for route ${event.data.route}: ${event.data.error.message}`
                    );
                  }
                }

                // Handle metrics collection here since the renderPage function's event handler is not being called
                if (
                  event.type === "file.write.done" &&
                  event.data.route === route
                ) {
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
                        processingTime:
                          endTime -
                          routeResult.metrics.html.streamMetrics.startTime,
                        chunkRate:
                          (event.data.chunks || 0) /
                          ((endTime -
                            routeResult.metrics.html.streamMetrics.startTime) /
                            1000),
                        fileName: event.data.fileName,
                        outputPath: event.data.path,
                        baseDir: event.data.baseDir,
                        routePath: event.data.routePath,
                        streamMetrics: createStreamMetrics({
                          ...routeResult.metrics.html.streamMetrics,
                          chunks: event.data.chunks || 0,
                          bytes: event.data.content.length,
                          duration:
                            endTime -
                            routeResult.metrics.html.streamMetrics.startTime,
                          endTime: endTime,
                        }),
                      });

                      if (options.onMetrics) {
                        options.onMetrics(htmlMetrics);
                      }

                      // Also emit RSC Full metrics (the RSC chunks sent to HTML worker)
                      // Only if metrics.rscFull exists (might be missing on errors)
                      if (routeResult.metrics?.rscFull) {
                        const rscFullEndTime = performance.now();
                        const rscFullMetrics = createRenderMetrics({
                          route: route,
                          type: routeResult.metrics.rscFull.type,
                          fromMainThread:
                            routeResult.metrics.rscFull.fromMainThread,
                          fromRscWorker:
                            routeResult.metrics.rscFull.fromRscWorker,
                          fromHtmlWorker:
                            routeResult.metrics.rscFull.fromHtmlWorker,
                          processingTime:
                            rscFullEndTime -
                            routeResult.metrics.rscFull.streamMetrics.startTime,
                          chunks:
                            routeResult.metrics.rscFull.streamMetrics.chunks,
                          chunkRate:
                            routeResult.metrics.rscFull.streamMetrics.chunks /
                            ((rscFullEndTime -
                              routeResult.metrics.rscFull.streamMetrics
                                .startTime) /
                              1000),
                          fileName: event.data.fileName,
                          outputPath: event.data.path,
                          baseDir: event.data.baseDir,
                          routePath: event.data.routePath,
                          streamMetrics: createStreamMetrics({
                            ...routeResult.metrics.rscFull.streamMetrics,
                            duration:
                              rscFullEndTime -
                              routeResult.metrics.rscFull.streamMetrics.startTime,
                            endTime: rscFullEndTime,
                          }),
                          // this stream is consumed by the html stream
                        });

                        if (options.onMetrics) {
                          options.onMetrics(rscFullMetrics);
                        }
                      }
                    } else if (event.data.fileType === "rsc") {
                      // Update RSC metrics with actual file data
                      const rscEndTime = performance.now();
                      const rscMetrics = createRenderMetrics({
                        route: route,
                        type: routeResult.metrics.rscHeadless.type,
                        fromMainThread:
                          routeResult.metrics.rscHeadless.fromMainThread,
                        fromRscWorker:
                          routeResult.metrics.rscHeadless.fromRscWorker,
                        fromHtmlWorker:
                          routeResult.metrics.rscHeadless.fromHtmlWorker,
                        fileSize: event.data.content.length,
                        chunks: event.data.chunks || 0,
                        processingTime:
                          rscEndTime -
                          routeResult.metrics.rscHeadless.streamMetrics
                            .startTime,
                        chunkRate:
                          (event.data.chunks || 0) /
                          ((rscEndTime -
                            routeResult.metrics.rscHeadless.streamMetrics
                              .startTime) /
                            1000),
                        fileName: event.data.fileName,
                        outputPath: event.data.path,
                        baseDir: event.data.baseDir,
                        routePath: event.data.routePath,
                        streamMetrics: createStreamMetrics({
                          ...routeResult.metrics.rscHeadless.streamMetrics,
                          chunks: event.data.chunks || 0,
                          bytes: event.data.content.length,
                          duration:
                            rscEndTime -
                            routeResult.metrics.rscHeadless.streamMetrics
                              .startTime,
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

              // Wait for both RSC and HTML files to be written
              await Promise.all([rscWritePromise, htmlWritePromise]);

              // Clean up active streams after successful completion
              activeStreams.delete(route);

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
              route: route,
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

        // If this is a panic error, yield it immediately to fail the build
        if (panicError != null) {
          yield {
            type: "error",
            error: panicError,
            route: route,
            failedRoutes,
            completedRoutes,
            results,
          } satisfies RenderPagesResult;
          break; // Stop processing additional routes for panic errors
        }

        // Clean up any resources that might have been created
        try {
          // Clear any cached state for this route
          results.delete(route);
          completedRoutes.delete(route);

          // Add to failed routes for non-panic errors
          failedRoutes.set(route, err);
        } catch (cleanupError) {
          options.logger?.warn(
            `Failed to cleanup resources for route ${route}: ${cleanupError}`
          );
        }

        yield {
          type: "success", // Change from error to success for non-panic route errors
          route: route,
          failedRoutes,
          completedRoutes,
          results,
        } satisfies RenderPagesResult;

        // For panicThreshold: "none", stop processing additional routes when there's an error
        // This prevents the build from continuing with broken pages
        if (options.panicThreshold === "none") {
          if (options.verbose) {
            options.logger.info(
              `[renderPages] Stopping render loop due to error with panicThreshold: "none"`
            );
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

    // Always yield a final result before checking panic threshold
    yield {
      type: "success",
      route: "", // No specific route for final result
      completedRoutes,
      failedRoutes,
      results,
    } satisfies RenderPagesResult;

    if (options.verbose) {
      options.logger.info(`[renderPages] Returning success result`);
    }

    if (options.verbose) {
      options.logger.info(`[renderPages] About to return success result`);
    }

    // Use centralized panic threshold logic
    const shouldPanic = failedRoutes.size > 0 && shouldCausePanic(
      Array.from(failedRoutes.values())[0], // Check first failed route
      { panicThreshold: options.panicThreshold }
    );

    if (options.verbose) {
      options.logger?.info(
        `[renderPages] Panic check - failedRoutes.size: ${failedRoutes.size}, panicThreshold: ${options.panicThreshold}, shouldPanic: ${shouldPanic}`
      );
    }

    if (shouldPanic) {
      const firstError = Array.from(failedRoutes.values())[0];
      if (options.verbose) {
        options.logger?.error(
          `[renderPages] Yielding panic error: ${firstError instanceof Error ? firstError.message : String(firstError)}`
        );
      }
      // Use yield for panic errors to maintain stream contract
      yield {
        type: "error",
        error: firstError instanceof Error ? firstError : new Error(String(firstError)),
        route: "", // No specific route for global panic
        completedRoutes,
        failedRoutes,
        results,
      } satisfies RenderPagesResult;
      return {
        type: "error",
        error: firstError instanceof Error ? firstError : new Error(String(firstError)),
        route: "",
        completedRoutes,
        failedRoutes,
        results,
      } satisfies RenderPagesResult;
    }

    return {
      type: "success",
      completedRoutes,
      failedRoutes: failedRoutes,
      results,
    } satisfies RenderPagesResult;
  })();
};
