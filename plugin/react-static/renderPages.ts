/**
 * renderPages.ts
 *
 * PURPOSE: Processes React Server Components (RSC) streams and writes output files
 *
 * This module:
 * 1. Creates RSC and HTML streams for each route
 * 2. Pipes RSC stream directly to .rsc files
 * 3. Transforms RSC to HTML via worker and pipes to .html files
 * 4. Collects metrics and handles errors
 * 5. Retries failed routes with no-op Page component for minimal HTML shells
 */
import { createRenderMetrics } from "../metrics/createRenderMetrics.js";
import { renderPage } from "./renderPage.js";
import type { PassThrough } from "node:stream";
import type {
  StreamMetrics,
  RenderPagesResult,
  AutoDiscoveredFiles,
  CssContent,
  CreateHandlerOptions,
} from "../types.js";

export type RenderPagesReturn = AsyncGenerator<
  RenderPagesResult,
  RenderPagesResult,
  unknown
>;

export type RenderPagesHandlerOptions = Omit<
  CreateHandlerOptions,
  | "pagePath"
  | "route"
  | "cssFiles"
  | "propsPath"
  | "rootPath"
  | "htmlPath"
  | "pageProps"
  | "PageComponent"
  | "RootComponent"
  | "HtmlComponent"
  | "url"
> & {
  autoDiscoveredFiles: AutoDiscoveredFiles;
  cssFilesByPage: Map<string, Map<string, CssContent>>;
};

export type RenderPagesFn = (
  routes: string[]
) => (handlerOptions: RenderPagesHandlerOptions) => RenderPagesReturn;

export const renderPages: RenderPagesFn = (routes) => {
  return (handlerOptions) => {
    const { autoDiscoveredFiles, cssFilesByPage, ...options } = handlerOptions;
    const completedRoutes = new Set<string>();
    const failedRoutes = new Set<string>();
    const baseMetrics = createRenderMetrics(routes[0]);
    const results = new Map<
      string,
      {
        html: PassThrough;
        rsc: PassThrough;
        metrics: {
          rscFull: StreamMetrics;
          rscHeadless: StreamMetrics;
        };
      }
    >();
    const errors: Error[] = [];

    if (!autoDiscoveredFiles.urlMap) {
      throw new Error("No urlMap provided to renderPages");
    }

    return (async function* _renderPages() {
      // First pass: render all routes normally
      for (const route of routes) {
        const { page, props, root, html } =
          autoDiscoveredFiles.urlMap.get(route) || {};
        if (!page) continue;

        try {
          const pageRenderer = renderPage({
            ...options,
            route,
            pagePath: page as string,
            propsPath: props as string,
            rootPath: root as string,
            htmlPath: html as string,
            cssFiles: cssFilesByPage.get(route) ?? new Map(),
          });

          for await (const result of pageRenderer) {
            if (result.type === "skip") continue;

            if (result.type === "error") {
              failedRoutes.add(route);
              errors.push(result.error);
              yield {
                type: "error",
                error: result.error,
                failedRoutes,
                completedRoutes,
                htmlSizes: baseMetrics.htmlSizes,
                rscSizes: baseMetrics.rscSizes,
                streamMetrics: baseMetrics.streamMetrics,
                results,
              } as const;
              continue;
            }

            if (result.type === "success") {
              completedRoutes.add(route);
              results.set(route, {
                html: result.html,
                rsc: result.rsc,
                metrics: result.metrics,
              });

              // Update metrics
              baseMetrics.htmlSizes.set(route, result.metrics.rscFull.bytes);
              baseMetrics.rscSizes.set(route, result.metrics.rscHeadless.bytes);
              baseMetrics.streamMetrics = {
                ...baseMetrics.streamMetrics,
                chunks: Math.max(
                  baseMetrics.streamMetrics.chunks,
                  result.metrics.rscFull.chunks
                ),
                bytes: Math.max(
                  baseMetrics.streamMetrics.bytes,
                  result.metrics.rscFull.bytes
                ),
                duration: Math.max(
                  baseMetrics.streamMetrics.duration,
                  result.metrics.rscFull.duration
                ),
                startTime: Math.min(
                  baseMetrics.streamMetrics.startTime,
                  result.metrics.rscFull.startTime
                ),
              };

              yield {
                type: "success",
                completedRoutes,
                htmlSizes: baseMetrics.htmlSizes,
                rscSizes: baseMetrics.rscSizes,
                streamMetrics: baseMetrics.streamMetrics,
                results,
              } as const;
            }
          }
        } catch (err) {
          failedRoutes.add(route);
          errors.push(err instanceof Error ? err : new Error(String(err)));
          yield {
            type: "error",
            error: err instanceof Error ? err : new Error(String(err)),
            failedRoutes,
            completedRoutes,
            htmlSizes: baseMetrics.htmlSizes,
            rscSizes: baseMetrics.rscSizes,
            streamMetrics: baseMetrics.streamMetrics,
            results,
          } as const;
        }
              }

        // Second pass: retry failed routes with React.Fragment as Page component
        if (failedRoutes.size > 0) {
          if (options.verbose) {
            options.logger.info(`[renderPages] Retrying ${failedRoutes.size} failed routes with React.Fragment`);
          }

          const retryRoutes = Array.from(failedRoutes);
          failedRoutes.clear(); // Clear for the retry pass

          for (const route of retryRoutes) {
                      const { page, root, html } =
            autoDiscoveredFiles.urlMap.get(route) || {};
            if (!page) {
              if (options.verbose) {
                options.logger.warn(`[renderPages] No page found for route: ${route}, skipping fallback render`);
              }
              continue;
            }

            try {
              if (options.verbose) {
                options.logger.info(`[renderPages] Attempting fallback render for route: ${route}`);
              }
              const pageRenderer = renderPage({
                ...options,
                route,
                // Use empty strings for fallback render to prevent page loading
                // The resolveComponents function will handle empty strings correctly
                pagePath: "",
                propsPath: "",
                rootPath: root as string,
                htmlPath: html as string,
                cssFiles: cssFilesByPage.get(route) ?? new Map(),
                // Override PageComponent with a minimal fallback component
                // This bypasses the problematic page component
                PageComponent: () => null,
                components: {
                  Page: () => null,
                }
              });

              for await (const result of pageRenderer) {
                if (result.type === "skip") continue;

                if (result.type === "error") {
                  failedRoutes.add(route);
                  const fallbackError = new Error(`Fallback render failed for route: ${route} - ${result.error.message}`);
                  errors.push(fallbackError);
                  if (options.verbose) {
                    options.logger.warn(`[renderPages] ${fallbackError.message}`);
                  }
                  continue;
                }

                if (result.type === "success") {
                  completedRoutes.add(route);
                  results.set(route, {
                    html: result.html,
                    rsc: result.rsc,
                    metrics: result.metrics,
                  });

                  // Update metrics
                  baseMetrics.htmlSizes.set(route, result.metrics.rscFull.bytes);
                  baseMetrics.rscSizes.set(route, result.metrics.rscHeadless.bytes);
                  baseMetrics.streamMetrics = {
                    ...baseMetrics.streamMetrics,
                    chunks: Math.max(
                      baseMetrics.streamMetrics.chunks,
                      result.metrics.rscFull.chunks
                    ),
                    bytes: Math.max(
                      baseMetrics.streamMetrics.bytes,
                      result.metrics.rscFull.bytes
                    ),
                    duration: Math.max(
                      baseMetrics.streamMetrics.duration,
                      result.metrics.rscFull.duration
                    ),
                    startTime: Math.min(
                      baseMetrics.streamMetrics.startTime,
                      result.metrics.rscFull.startTime
                    ),
                  };

                  if (options.verbose) {
                    options.logger.info(`[renderPages] Fallback render successful for route: ${route}`);
                  }

                  yield {
                    type: "success",
                    completedRoutes,
                    htmlSizes: baseMetrics.htmlSizes,
                    rscSizes: baseMetrics.rscSizes,
                    streamMetrics: baseMetrics.streamMetrics,
                    results,
                  } as const;
                }
              }
            } catch (err) {
              failedRoutes.add(route);
              const fallbackError = new Error(`Fallback render failed for route: ${route} - ${err instanceof Error ? err.message : String(err)}`);
              errors.push(fallbackError);
              if (options.verbose) {
                options.logger.warn(`[renderPages] ${fallbackError.message}`);
              }
            }
          }
          
          if (options.verbose && failedRoutes.size > 0) {
            options.logger.warn(`[renderPages] ${failedRoutes.size} routes still failed after fallback render`);
          }
          
          if (options.verbose) {
            options.logger.info(`[renderPages] Fallback pass completed. completedRoutes: ${completedRoutes.size}, failedRoutes: ${failedRoutes.size}`);
          }
        }

      if (options.verbose) {
        options.logger.info(`[renderPages] Final state - completedRoutes: ${completedRoutes.size}, failedRoutes: ${failedRoutes.size}`);
      }
      
      if (failedRoutes.size > 0) {
        if (options.verbose) {
          options.logger.warn(`[renderPages] Returning error result due to ${failedRoutes.size} failed routes`);
        }
        return {
          type: "error",
          error: errors[0],
          failedRoutes,
          completedRoutes,
          htmlSizes: baseMetrics.htmlSizes,
          rscSizes: baseMetrics.rscSizes,
          streamMetrics: baseMetrics.streamMetrics,
          results,
        } as const;
      }

      if (options.verbose) {
        options.logger.info(`[renderPages] Returning success result`);
      }
      
      return {
        type: "success",
        completedRoutes,
        failedRoutes: undefined,
        htmlSizes: baseMetrics.htmlSizes,
        rscSizes: baseMetrics.rscSizes,
        streamMetrics: baseMetrics.streamMetrics,
        results,
      } as const;
    })();
  };
};
