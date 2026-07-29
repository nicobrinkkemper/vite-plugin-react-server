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
import { isLoaderSignal, isRedirect } from "../router/loaderSignals.js";
import { fileWriter } from "./fileWriter.js";
import type { Manifest } from "vite";
import { emitFileWriteMetrics } from "./emitFileWriteMetrics.js";
import { lockReactFamily } from "../vendor/lazyVendorModule.js";

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
  batch?: { index: number; size: number },
): Promise<{ route: string; results: RenderPageResult[]; error?: Error }> {
  const { autoDiscoveredFiles, cssFilesByPage, ...options } = handlerOptions;
  const { page, props, root, html, layouts } = autoDiscoveredFiles.urlMap?.get(route) || {};

  if (!page) {
    return { route, results: [], error: new Error(`No page found for route ${route}`) };
  }

  try {
    const resolvedPagePath = page ? resolvePathWithManifest(page, manifest) : undefined;
    const resolvedPropsPath = props ? resolvePathWithManifest(props, manifest) : undefined;
    const resolvedRootPath = root ? resolvePathWithManifest(root, manifest) : undefined;
    const resolvedHtmlPath = html ? resolvePathWithManifest(html, manifest) : undefined;
    // Nested layouts: manifest-resolve each built layer so the RSC worker folds
    // the chain into the flight (mirrors page/props resolution above).
    const resolvedLayouts = layouts?.map((l) => ({
      component: l.component ? resolvePathWithManifest(l.component, manifest) : undefined,
      props: l.props ? resolvePathWithManifest(l.props, manifest) : undefined,
      error: l.error ? resolvePathWithManifest(l.error, manifest) : undefined,
      loading: l.loading ? resolvePathWithManifest(l.loading, manifest) : undefined,
      head: l.head ? resolvePathWithManifest(l.head, manifest) : undefined,
    }));

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
        // Loader control flow (redirect()/notFound()) at prerender: the page
        // is skipped by the render loop; don't count it as a failed route.
        if (isLoaderSignal(event.data.error)) {
          options.logger?.warn(
            `[renderPagesBatched] route ${event.data.route} signalled ${
              isRedirect(event.data.error)
                ? `redirect -> ${(event.data.error as { to?: string }).to}`
                : "notFound"
            } during prerender; page skipped`
          );
          return;
        }
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

      // Handle metrics collection on file.write.done; the batch tag lets the
      // watcher show which routes rendered concurrently.
      emitFileWriteMetrics(event, route, routeResults, { ...options, batch });
    };

    const routeHandlerOptions = {
      ...options,
      manifest,
      route,
      pagePath: resolvedPagePath as string,
      propsPath: resolvedPropsPath as string,
      rootPath: resolvedRootPath as string,
      htmlPath: resolvedHtmlPath as string,
      layouts: resolvedLayouts,
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
        // A loader redirect()/notFound() at prerender is control flow the
        // static build cannot answer — skip the page loudly, don't fail it.
        if (isLoaderSignal(result.error)) {
          const err = result.error as Error & { to?: string };
          options.logger?.warn(
            `[renderPagesBatched] route ${route} signalled ${
              isRedirect(err) ? `redirect -> ${err.to}` : "notFound"
            } during prerender; page skipped`
          );
          continue;
        }
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
  // Pin react + jsx-runtime to ONE dev/prod variant before any page module
  // loads in-process — a page's jsx-runtime import otherwise samples
  // NODE_ENV at load time and can disagree with the cached react/renderer
  // when tooling flipped NODE_ENV after plugin import.
  lockReactFamily();

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
    // The first route renders SOLO as a warm-up. On a cold module graph a
    // full-width first batch gains nothing from parallelism — every route in
    // it serializes on the same one-time module load, so N routes all report
    // the whole cold-load wall time and the real rendering only starts after
    // it anyway. One route pays the cold load once; every batch after renders
    // against a warm graph at full width.
    const batches =
      routeArray.length > 1
        ? [[routeArray[0]], ...chunk(routeArray.slice(1), batchSize)]
        : chunk(routeArray, batchSize);

    if (options.verbose) {
      options.logger?.info(
        `[renderPagesBatched] Rendering ${routeArray.length} pages: 1 warm-up + ${batches.length - 1} batches of ${batchSize}`
      );
    }

    for (const [batchIndex, batch] of batches.entries()) {
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
        renderSingleRoute(route, handlerOptions, renderPage, manifest, failedRoutes, {
          index: batchIndex,
          size: batch.length,
        })
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
          // Only count the route as completed when something actually
          // rendered — a loader redirect()/notFound() skip leaves pageResults
          // without a success/skip entry and must not inflate the summary.
          const rendered = pageResults.some(
            (r) => r.type === "success" || r.type === "skip"
          );
          if (rendered) completedRoutes.add(route);

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
