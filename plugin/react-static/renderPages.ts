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
import { createRenderMetrics } from "../helpers/metrics.js";
import { renderPage } from "./renderPage.js";
import type { PassThrough } from "node:stream";
import type {
  StreamMetrics,
  RenderPagesResult,
  AutoDiscoveredFiles,
  CssContent,
  MultiPageHandlerOptions,
  PagePropOpt,
  InlineCssOpt,
  AsOpt,
  PageName,
  PropsName,
} from "../types.js";

export type RenderPagesReturn = AsyncGenerator<RenderPagesResult, RenderPagesResult, unknown>;

export type RenderPagesFn = <
  Opt extends MultiPageHandlerOptions = MultiPageHandlerOptions
>(
  autoDiscoveredFiles: AutoDiscoveredFiles, 
  handlerOptions: Opt,
  cssFilesByPage: Map<string, Map<string, CssContent<boolean>>>
) => RenderPagesReturn;

export const renderPages: RenderPagesFn = async function* _renderPages(
  autoDiscoveredFiles,
  handlerOptions,
  cssFilesByPage
) {
  const routes = Array.from(autoDiscoveredFiles.urlMap.keys());
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

  for (const route of routes) {
    const { page, props } = autoDiscoveredFiles.urlMap.get(route) || {};
    if (!page) continue;

    try {
      const pageRenderer = renderPage({
        ...handlerOptions,
        route,
        pagePath: page as string,
        propsPath: props as string,
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

  if (failedRoutes.size > 0) {
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

  return {
    type: "success",
    completedRoutes,
    failedRoutes: undefined,
    htmlSizes: baseMetrics.htmlSizes,
    rscSizes: baseMetrics.rscSizes,
    streamMetrics: baseMetrics.streamMetrics,
    results,
  } as const;
}
