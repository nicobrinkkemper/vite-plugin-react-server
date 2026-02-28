/**
 * renderPagesBatched.ts
 *
 * Batched version of renderPages that renders multiple pages concurrently.
 * Uses Promise.all on batches to parallelize rendering while preserving
 * the async generator interface for compatibility.
 */
import type { RenderPagesResult, RenderPageResult } from "../types.js";
import type { RenderPagesFn, RenderPageFn, RenderPagesHandlerOptions } from "./types.js";
import { handleError } from "../error/handleError.js";
import { fileWriter } from "./fileWriter.js";
import type { Manifest } from "vite";
import { createRenderMetrics } from "../metrics/createRenderMetrics.js";
import { createStreamMetrics } from "../metrics/createStreamMetrics.js";

const DEFAULT_BATCH_SIZE = 8;

function resolvePathWithManifest(path: string, manifest: Manifest): string {
  const entry = manifest[path];
  if (entry && entry.file) {
    return entry.file;
  }
  return path;
}

/**
 * Renders a single route completely, consuming all yields from renderPage
 * and writing the RSC and HTML files. Collects metrics and handles events
 * identically to the sequential renderPages.
 */
async function renderSingleRoute(
  route: string,
  handlerOptions: RenderPagesHandlerOptions,
  renderPage: RenderPageFn,
  manifest: Manifest,
  failedRoutes: Map<string, unknown>,
): Promise<{ route: string; results: RenderPageResult[]; error?: Error }> {
  const { autoDiscoveredFiles, cssFilesByPage, ...options } = handlerOptions;
  const { page, props, root, html } = autoDiscoveredFiles.urlMap?.get(route) || {};
  
  if (!page) {
    return { route, results: [], error: new Error(`No page found for route ${route}`) };
  }

  try {
    const resolvedPagePath = page ? resolvePathWithManifest(page, manifest) : undefined;
    const resolvedPropsPath = props ? resolvePathWithManifest(props, manifest) : undefined;
    const resolvedRootPath = root ? resolvePathWithManifest(root, manifest) : undefined;
    const resolvedHtmlPath = html ? resolvePathWithManifest(html, manifest) : undefined;

    // Store results for metrics tracking
    const routeResults = new Map<string, RenderPageResult>();

    // Create onEvent wrapper that handles route.error and metrics collection
    // This mirrors the sequential renderPages behavior exactly
    const wrapperOnEvent = (event: any) => {
      // Call the original onEvent first
      if (options.onEvent) {
        options.onEvent(event);
      }

      // Handle route.error events
      if (event.type === "route.error") {
        const detectedPanicError = handleError({
          error: event.data.error,
          logger: options.logger,
          panicThreshold: event.data.panicThreshold,
          context: `route.error (${event.data.route})`,
        });
        
        if (detectedPanicError != null) {
          options.logger?.error(
            `[renderPagesBatched] Panic error for route ${event.data.route}: ${event.data.error.message}`
          );
          failedRoutes.set(event.data.route, event.data.error);
        } else {
          options.logger?.warn(
            `[renderPagesBatched] Non-panic error for route ${event.data.route}: ${event.data.error.message}`
          );
        }
      }

      // Handle metrics collection on file.write.done
      if (event.type === "file.write.done" && event.data.route === route) {
        const routeResult = routeResults.get(route);
        if (routeResult && routeResult.type === "success") {
          if (event.data.fileType === "html") {
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

            // Also emit RSC Full metrics if available
            if (routeResult.metrics?.rscFull) {
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
              });

              if (options.onMetrics) {
                options.onMetrics(rscFullMetrics);
              }
            }
          } else if (event.data.fileType === "rsc") {
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

    const routeHandlerOptions = {
      ...options,
      manifest,
      route,
      pagePath: resolvedPagePath as string,
      propsPath: resolvedPropsPath as string,
      rootPath: resolvedRootPath as string,
      htmlPath: resolvedHtmlPath as string,
      cssFiles: cssFilesByPage?.get(route) ?? new Map(),
      globalCss: options.globalCss ?? new Map(),
      id: `${route}-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      onEvent: wrapperOnEvent,
    };

    const pageRenderer = renderPage(routeHandlerOptions);
    const results: RenderPageResult[] = [];
    let routeError: Error | undefined;

    // Consume all yields from the page renderer and write files
    for await (const result of pageRenderer) {
      results.push(result);
      
      if (result.type === "error" && result.error) {
        routeError = result.error instanceof Error ? result.error : new Error(String(result.error));
      }
      
      if (result.type === "success" || result.type === "skip") {
        // Store result for metrics tracking (wrapperOnEvent needs this)
        routeResults.set(route, result);

        const rscWritePromise = fileWriter(
          result.rsc as any,
          "rsc",
          { ...options, route, onEvent: wrapperOnEvent, logger: options.logger },
          options.signal
        );

        const htmlWritePromise = fileWriter(
          result.html as any,
          "html",
          { ...options, route, onEvent: wrapperOnEvent, logger: options.logger },
          options.signal
        );

        await Promise.all([rscWritePromise, htmlWritePromise]);
      }
    }

    if (routeError) {
      return { route, results, error: routeError };
    }

    return { route, results };
  } catch (error) {
    return { route, results: [], error: error as Error };
  }
}

/**
 * Splits array into chunks of specified size
 */
function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Batched version of renderPages that renders pages in parallel batches
 */
export const renderPagesBatched: RenderPagesFn = (
  routes,
  handlerOptions,
  renderPage
) => {
  const {
    autoDiscoveredFiles,
    manifest = {},
    ...options
  } = handlerOptions;

  const batchSize = (options as any).batchSize ?? DEFAULT_BATCH_SIZE;
  const completedRoutes = new Set<string>();
  const failedRoutes = new Map<string, unknown>();
  const results = new Map<string, RenderPageResult>();

  if (!autoDiscoveredFiles?.urlMap) {
    return (async function* _renderPagesBatched(): AsyncGenerator<RenderPagesResult, RenderPagesResult, unknown> {
      const errorResult: RenderPagesResult = {
        type: "error",
        error: new Error("No urlMap provided to renderPages"),
        route: "",
        failedRoutes: new Map(),
        completedRoutes: new Set(),
        results: new Map(),
      };
      yield errorResult;
      return errorResult;
    })();
  }

  return (async function* _renderPagesBatched(): AsyncGenerator<RenderPagesResult, RenderPagesResult, unknown> {
    const routeArray = Array.from(routes);
    const batches = chunk(routeArray, batchSize);
    
    if (options.verbose) {
      options.logger?.info(
        `[renderPagesBatched] Rendering ${routeArray.length} pages in ${batches.length} batches of ${batchSize}`
      );
    }

    for (const batch of batches) {
      // Check for abort signal
      if (options.signal?.aborted) {
        const abortResult: RenderPagesResult = {
          type: "error",
          error: options.signal.reason || new Error("Build aborted"),
          route: batch[0] || "",
          failedRoutes,
          completedRoutes,
          results,
        };
        yield abortResult;
        return abortResult;
      }

      // Render all pages in this batch concurrently
      const batchPromises = batch.map(route => 
        renderSingleRoute(route, handlerOptions, renderPage, manifest, failedRoutes)
      );

      const batchResults = await Promise.all(batchPromises);

      // Process results from this batch
      for (const { route, results: pageResults, error } of batchResults) {
        if (error) {
          const panicError = handleError({
            error,
            logger: options.logger,
            panicThreshold: options.panicThreshold,
            context: `renderPagesBatched(${route})`,
          });

          if (panicError != null) {
            failedRoutes.set(route, error);
            options.logger?.error(`[renderPagesBatched] Panic error for route ${route}: ${error.message}`);
            const errorResult: RenderPagesResult = {
              type: "error",
              error,
              route,
              failedRoutes,
              completedRoutes,
              results,
            };
            yield errorResult;
            return errorResult;
          } else {
            options.logger?.warn(`[renderPagesBatched] Non-panic error for route ${route}: ${error.message}`);
          }
        } else {
          completedRoutes.add(route);
          
          for (const result of pageResults) {
            if (result.type === "success" || result.type === "skip") {
              results.set(route, result);
              yield {
                type: "success",
                route,
                failedRoutes,
                completedRoutes,
                results,
              } satisfies RenderPagesResult;
            }
          }
        }
      }

      if (options.verbose) {
        options.logger?.info(
          `[renderPagesBatched] Completed batch: ${completedRoutes.size}/${routeArray.length} pages`
        );
      }
    }

    // Final success result
    const finalResult: RenderPagesResult = {
      type: "success",
      route: "",
      failedRoutes,
      completedRoutes,
      results,
    };

    return finalResult;
  })();
};
