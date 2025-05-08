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
 */
import type {
  RenderPagesResult,
  CreateHandlerOptions,
  AutoDiscoveredFiles,
  CssContent,
} from "../types.js";
import { createRenderMetrics } from "../helpers/metrics.js";
import { renderPage } from "./renderPage.js";

export async function* renderPages(
  { urlMap }: AutoDiscoveredFiles,
  handlerOptions: Omit<
    CreateHandlerOptions,
    "route" | "pagePath" | "propsPath" | "Page" | "props" | "cssFiles"
  >,
  cssFilesByPage: Map<string, Map<string, CssContent>>,
): AsyncGenerator<RenderPagesResult, void, unknown> {
  if (!urlMap) {
    throw new Error("No urlMap provided to renderPages");
  }
  const routes = Array.from(urlMap.keys());
  const completedRoutes = new Set<string>();
  const failedRoutes = new Set<string>();
  const baseMetrics = createRenderMetrics(routes[0]);
  const results: RenderPagesResult["results"] = new Map();

  for (const route of routes) {
    const { page, props } = urlMap.get(route) || {};
    if (!page) continue;

    try {
      const pageRenderer = renderPage({
        ...handlerOptions,
        route,
        pagePath: page,
        propsPath: props,
        cssFiles: cssFilesByPage.get(route) ?? new Map(),
      });

      for await (const result of pageRenderer) {
        if (result.type === "skip") continue;

        if (result.type === "error") {
          failedRoutes.add(route);
          yield {
            type: "error",
            error: result.error,
            failedRoutes,
            completedRoutes,
            htmlSizes: baseMetrics.htmlSizes,
            rscSizes: baseMetrics.rscSizes,
            totalChunks: baseMetrics.totalChunks,
            streamMetrics: baseMetrics.streamMetrics,
            results,
          };
          return;
        }

        if (result.type === "success") {
          completedRoutes.add(route);
          results.set(route, result);

          // Update metrics
          baseMetrics.htmlSizes.set(route, result.html.length);
          baseMetrics.rscSizes.set(route, result.rsc.length);
          baseMetrics.totalChunks +=
            result.metrics.rscFull.chunks + result.metrics.rscHeadless.chunks;
        }
      }
    } catch (err) {
      failedRoutes.add(route);
      yield {
        type: "error",
        error: err instanceof Error ? err : new Error(String(err)),
        failedRoutes,
        completedRoutes,
        htmlSizes: baseMetrics.htmlSizes,
        rscSizes: baseMetrics.rscSizes,
        totalChunks: baseMetrics.totalChunks,
        streamMetrics: baseMetrics.streamMetrics,
        results,
      };
      return;
    }
  }

  // Update final metrics
  baseMetrics.processingTime = Date.now() - baseMetrics.streamMetrics.startTime;
  baseMetrics.htmlSize = Array.from(baseMetrics.htmlSizes.values()).reduce(
    (sum, size) => sum + size,
    0
  );
  baseMetrics.rscSize = Array.from(baseMetrics.rscSizes.values()).reduce(
    (sum, size) => sum + size,
    0
  );
  baseMetrics.chunkRate =
    baseMetrics.totalChunks / (baseMetrics.processingTime / 1000);

  yield {
    type: "success",
    completedRoutes,
    failedRoutes: undefined,
    htmlSizes: baseMetrics.htmlSizes,
    rscSizes: baseMetrics.rscSizes,
    totalChunks: baseMetrics.totalChunks,
    streamMetrics: baseMetrics.streamMetrics,
    results,
  };
}
