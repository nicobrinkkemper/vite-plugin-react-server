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

import type { RenderPagesResult, StreamMetrics } from "../types.js";
import type { RenderPagesFn} from "./types.js";
import { handleError } from "../error/handleError.js";
import { routeToURL } from "../utils/routeToURL.js";
import type { Manifest } from "vite";

// Helper function to resolve paths using manifest
function resolvePathWithManifest(path: string, manifest: Manifest): string {
  // Check if the path exists in the manifest
  const manifestEntry = manifest[path];
  if (manifestEntry && manifestEntry.file) {
    // Return the compiled file path
    return manifestEntry.file;
  }
  
  // If not found in manifest, return the original path
  // The build loader will handle finding the compiled version
  return path;
}

export const renderPages: RenderPagesFn = (routes, renderPage) => {
  return (handlerOptions) => {
    const { autoDiscoveredFiles, cssFilesByPage, manifest = {}, ...options } = handlerOptions;
    const completedRoutes = new Set<string>();
    const failedRoutes = new Map<string, unknown>();
    const baseMetrics = createRenderMetrics(routes[0]);
    const results = new Map<
      string,
      {
        html: { abort: (reason?: unknown) => void; pipe: <Writable extends NodeJS.WritableStream>(destination: Writable) => Writable; };
        rsc: { abort: (reason?: unknown) => void; pipe: <Writable extends NodeJS.WritableStream>(destination: Writable) => Writable; };
        metrics: {
          rscFull: StreamMetrics;
          rscHeadless: StreamMetrics;
        };
      }
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

          const pageRenderer = renderPage({
            ...options,
            manifest,
            route,
            pagePath: resolvedPagePath as string,
            propsPath: resolvedPropsPath as string,
            rootPath: resolvedRootPath as string,
            htmlPath: resolvedHtmlPath as string,
            cssFiles: cssFilesByPage.get(route) ?? new Map(),
            // Add required fields that are missing from RenderPagesHandlerOptions
            PageComponent: undefined as any,
            RootComponent: undefined as any,
            HtmlComponent: undefined as any,
            url: routeToURL(route, options.moduleBaseURL, options.build.rscOutputPath),
            pageProps: undefined,
          });

          for await (const result of pageRenderer) {
            if (result.type === "skip") continue;

            if (result.type === "error") {
              failedRoutes.set(route, result.error);
              yield {
                type: "error",
                error: result.error,
                route: route,
                failedRoutes,
                completedRoutes,
                htmlSizes: baseMetrics.htmlSizes,
                rscSizes: baseMetrics.rscSizes,
                streamMetrics: baseMetrics.streamMetrics,
                results,
              } as RenderPagesResult;
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
                failedRoutes,
                htmlSizes: baseMetrics.htmlSizes,
                rscSizes: baseMetrics.rscSizes,
                streamMetrics: baseMetrics.streamMetrics,
                results,
              } as RenderPagesResult;
            }
          }
        } catch (err) {
          const panicError = handleError({
            error: err,
            logger: options.logger,
            panicThreshold: options.panicThreshold,
            context: `renderPages(${route})`,
          });
          if (panicError != null) {
            failedRoutes.set(route, panicError);
          } else {
            failedRoutes.set(route, err);
          }
          yield {
            type: "error",
            failedRoutes,
            completedRoutes,
            htmlSizes: baseMetrics.htmlSizes,
            rscSizes: baseMetrics.rscSizes,
            streamMetrics: baseMetrics.streamMetrics,
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
        htmlSizes: baseMetrics.htmlSizes,
        rscSizes: baseMetrics.rscSizes,
        streamMetrics: baseMetrics.streamMetrics,
        results,
      } as RenderPagesResult;
    })();
  };
};
