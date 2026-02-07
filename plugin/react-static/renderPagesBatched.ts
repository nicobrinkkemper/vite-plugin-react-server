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
 * and writing the RSC and HTML files
 */
async function renderSingleRoute(
  route: string,
  handlerOptions: RenderPagesHandlerOptions,
  renderPage: RenderPageFn,
  manifest: Manifest,
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
    };

    const pageRenderer = renderPage(routeHandlerOptions);
    const results: RenderPageResult[] = [];
    let routeError: Error | undefined;

    // Consume all yields from the page renderer and write files
    for await (const result of pageRenderer) {
      results.push(result);
      
      // Track error results
      if (result.type === "error" && result.error) {
        routeError = result.error instanceof Error ? result.error : new Error(String(result.error));
      }
      
      // Write files for success and skip results
      if ((result.type === "success" || result.type === "skip") && result.html && result.rsc) {
        const rscWritePromise = fileWriter(
          result.rsc as any,
          "rsc",
          { ...options, route, logger: options.logger },
          options.signal
        );

        const htmlWritePromise = fileWriter(
          result.html as any,
          "html",
          { ...options, route, logger: options.logger },
          options.signal
        );

        await Promise.all([rscWritePromise, htmlWritePromise]);
      }
    }

    // Return error if any result was an error
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
        renderSingleRoute(route, handlerOptions, renderPage, manifest)
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
          } else {
            options.logger?.warn(`[renderPagesBatched] Non-panic error for route ${route}: ${error.message}`);
          }
        } else {
          completedRoutes.add(route);
          
          // Yield each result from this page
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

    // Check if we should panic based on failed routes
    if (failedRoutes.size > 0) {
      const firstError = Array.from(failedRoutes.values())[0];
      const panicError = handleError({
        error: firstError,
        logger: options.logger,
        panicThreshold: options.panicThreshold,
        context: `renderPagesBatched final check`,
      });

      if (panicError != null) {
        if (options.verbose) {
          options.logger?.error(
            `[renderPagesBatched] Build failed due to panic threshold: ${failedRoutes.size} routes failed`
          );
        }
        // Yield error before returning
        const errorResult: RenderPagesResult = {
          type: "error",
          error: panicError,
          route: "",
          failedRoutes,
          completedRoutes,
          results,
        };
        yield errorResult;
        return errorResult;
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
