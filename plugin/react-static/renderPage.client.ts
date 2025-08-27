/**
 * renderPage.client.ts
 *
 * PURPOSE: Client-side static page rendering for React Server Components
 *
 * ARCHITECTURE OVERVIEW:
 * 
 * CLIENT-SIDE vs SERVER-SIDE:
 * - Server-side: RSC generation in main thread, HTML generation in worker
 * - Client-side: RSC generation in worker, HTML generation in main thread
 * 
 * FLOW:
 * 1. RSC Worker generates RSC content with HTML wrapper
 * 2. RSC content is buffered to allow dual consumption
 * 3. Buffered RSC stream is consumed twice:
 *    - For RSC file writing (index.rsc)
 *    - For HTML transformation (index.html)
 * 4. HTML transform processes RSC content in main thread
 * 5. Both files are written to filesystem
 * 
 * KEY INSIGHT: Node.js streams can only be consumed once, so we buffer the RSC
 * content to allow it to be used for both RSC file generation and HTML transformation.
 * This follows the pattern from collectRscContent.ts.
 * 
 * HELPER FUNCTIONS:
 * - createBufferedRscStream: Creates a buffered stream for dual consumption
 * - createRscToHtmlStream: Transforms RSC content to HTML in main thread
 * 
 * USAGE:
 * ```typescript
 * const result = await renderPage({
 *   route: "/",
 *   pagePath: "src/page/page.tsx",
 *   // ... other options
 * });
 * 
 * // result.html.pipe(htmlFileWriter);
 * // result.rsc.pipe(rscFileWriter);
 * ```
 */

import { createRenderMetrics } from "../metrics/createRenderMetrics.js";
import type { RenderMetrics } from "../metrics/types.js";
import { routeToURL } from "../utils/routeToURL.js";
import type { RenderPageFn } from "./types.js";
import { handleError } from "../error/handleError.js";
import { assertNonReactServer } from "../config/getCondition.js";

import { createRscStream } from "../stream/createRscStream.client.js";
import { resolveComponents } from "../helpers/resolveComponents.client.js";

import { join } from "node:path";

import { createStreamMetrics } from "../metrics/createStreamMetrics.js";
import { performance } from "node:perf_hooks";
import { createRscToHtmlStream } from "./rscToHtmlStream.client.js";
import { createBufferedRscStream } from "../helpers/createBufferedRscStream.js";


assertNonReactServer();

/**
 * Client version of renderPage that uses the react-client pattern
 * This works in REVERSE from the server plugin:
 * - Server: Main thread (RSC) + HTML worker (HTML)
 * - Client: RSC worker (RSC) + Main thread (HTML)
 */
export const renderPage: RenderPageFn = async function* _renderPageClient(
  handlerOptions
) {
  // Skip if no pagePath AND no PageComponent provided (fallback case)
  if (!handlerOptions.pagePath && !handlerOptions.PageComponent) {
    yield {
      type: "skip",
      reason: "No pagePath and no PageComponent provided",
      metrics: {
        rscFull: createRenderMetrics({
          route: handlerOptions.route,
          type: "rsc-full",
          fromMainThread: false,
          fromRscWorker: true,
          fromHtmlWorker: false,
        }) as RenderMetrics & { type: "rsc-full" },
        rscHeadless: createRenderMetrics({
          route: handlerOptions.route,
          type: "rsc-headless",
          fromMainThread: false,
          fromRscWorker: true,
          fromHtmlWorker: false,
        }) as RenderMetrics & { type: "rsc-headless" },
        html: createRenderMetrics({
          route: handlerOptions.route,
          type: "html",
          fromMainThread: true,
          fromRscWorker: false,
          fromHtmlWorker: false,
        }) as RenderMetrics & { type: "html" },
      },
    };
    return;
  }
  if (!handlerOptions.url) {
    handlerOptions.url = routeToURL(
      handlerOptions.route,
      handlerOptions.moduleBaseURL,
      handlerOptions.build.rscOutputPath
    );
  }

  const baseDir = join(
    handlerOptions.build.outDir,
    handlerOptions.build.static
  );
  const routePath = handlerOptions.route.replace(/^\//, "");

  // Create metrics upfront with proper types - REVERSE from server
  const htmlMetrics = createRenderMetrics({
    route: handlerOptions.route,
    type: "html",
    fromMainThread: true, // Client: HTML rendered on main thread
    fromRscWorker: false,
    fromHtmlWorker: false,
    baseDir,
    routePath,
    fileName: handlerOptions.build.htmlOutputPath,
    outputPath: join(baseDir, routePath, handlerOptions.build.htmlOutputPath),
  });
  
  const rscFullMetrics = createRenderMetrics({
    route: handlerOptions.route,
    type: "rsc-full",
    fromMainThread: false,
    fromRscWorker: true, // Client: RSC rendered on RSC worker
    fromHtmlWorker: false,
  });
  
  const rscHeadlessMetrics = createRenderMetrics({
    route: handlerOptions.route,
    type: "rsc-headless",
    fromMainThread: false,
    fromRscWorker: true, // Client: RSC rendered on RSC worker
    fromHtmlWorker: false,
    baseDir,
    routePath,
    fileName: handlerOptions.build.rscOutputPath,
    outputPath: join(baseDir, routePath, handlerOptions.build.rscOutputPath),
  });

  // Declare variables outside try block so they can be accessed in catch block
  let headlessRscStream: any = null;
  let fullRscStream: any = null;
  let htmlHandler: any = null;

  try {
    if (handlerOptions.verbose) {
      handlerOptions.logger?.info(
        `[renderPage.client] Client-side rendering for route: ${handlerOptions.route}`
      );
    }

    // Step 1: Resolve paths to built paths using the static manifest
    // This ensures the RSC worker generates client references with built paths
    // instead of source paths, which is what the HTML transform expects
    const resolvePathWithManifest = (path: string, manifest: any): string => {
      const entry = manifest[path];
      if (entry && entry.file) {
        return entry.file;
      }
      return path;
    };

    const staticManifest = handlerOptions.manifest || {};
    const resolvedPagePath = handlerOptions.pagePath ? resolvePathWithManifest(handlerOptions.pagePath, staticManifest) : undefined;
    const resolvedPropsPath = handlerOptions.propsPath ? resolvePathWithManifest(handlerOptions.propsPath, staticManifest) : undefined;
    const resolvedRootPath = handlerOptions.rootPath ? resolvePathWithManifest(handlerOptions.rootPath, staticManifest) : undefined;
    const resolvedHtmlPath = handlerOptions.htmlPath ? resolvePathWithManifest(handlerOptions.htmlPath, staticManifest) : undefined;

    if (handlerOptions.verbose) {
      handlerOptions.logger?.info(`[renderPage.client] Resolved paths for route ${handlerOptions.route}:`);
      handlerOptions.logger?.info(`  page: ${handlerOptions.pagePath} -> ${resolvedPagePath}`);
      handlerOptions.logger?.info(`  props: ${handlerOptions.propsPath} -> ${resolvedPropsPath}`);
      handlerOptions.logger?.info(`  root: ${handlerOptions.rootPath} -> ${resolvedRootPath}`);
      handlerOptions.logger?.info(`  html: ${handlerOptions.htmlPath} -> ${resolvedHtmlPath}`);
    }
    const worker = handlerOptions.worker ?? handlerOptions.rscWorker;

    // Step 2: Resolve components using the RSC worker with built paths
    // This separates component resolution from RSC generation, making the
    // subsequent RSC render completely synchronous
    if (!worker) {
      throw new Error("RSC worker is required for client-side component resolution");
    }
    
    // Preload components in the worker for faster subsequent RSC stream generation
    await resolveComponents({
      route: handlerOptions.route,
      pagePath: resolvedPagePath,
      propsPath: resolvedPropsPath,
      rootPath: resolvedRootPath,
      htmlPath: resolvedHtmlPath,
      pageExportName: handlerOptions.pageExportName,
      propsExportName: handlerOptions.propsExportName,
      rootExportName: handlerOptions.rootExportName,
      htmlExportName: handlerOptions.htmlExportName,
      worker: worker,
      rscWorker: worker,
      onMetrics: handlerOptions.onMetrics,
      logger: handlerOptions.logger,
      verbose: handlerOptions.verbose,
    });

    // Step 2: Create handler options
    // Components are now preloaded in the worker, so we can use the original handler options
    const newHandlerOptions = {
      ...handlerOptions,
      url: `${handlerOptions.url}`,
      route: `${handlerOptions.route}`,
      // Pass CSS information to the RSC worker and HTML transform
      cssFiles: handlerOptions.cssFiles || new Map(),
      globalCss: handlerOptions.globalCss || new Map(),
    };

    // Component resolution is already measured in resolveComponents
    // No need to measure module resolution time here anymore

    // Step 1: Create headless RSC stream using RSC worker (REVERSE from server)
    const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    
    headlessRscStream = createRscStream({
      ...newHandlerOptions,
      id: `${handlerOptions.route}-headless-${uniqueId}`,
      rscTimeout: handlerOptions.rscTimeout || 5000,
      onMetrics: handlerOptions.onMetrics,
      // Headless RSC: no HTML wrapper
      htmlPath: '',
    });

    // Component resolution is already measured in resolveComponents
    // No need to measure module resolution time here anymore

    // Step 2: Create full RSC stream for HTML transformation
    fullRscStream = createRscStream({
      ...newHandlerOptions,
      id: `${handlerOptions.route}-full-${uniqueId}`,
      rscTimeout: handlerOptions.rscTimeout || 5000,
      onMetrics: handlerOptions.onMetrics,
      htmlPath: handlerOptions.htmlPath || undefined,
    });

    // Step 3: Create HTML transform stream
    const htmlTransformStream = createRscToHtmlStream({
      ...newHandlerOptions,
      htmlTimeout: handlerOptions.htmlTimeout || 15000,
      route: handlerOptions.route,
      logger: handlerOptions.logger,
      verbose: handlerOptions.verbose,
    });

    // Create buffered stream for dual consumption
    const bufferedRscStreamFactory = createBufferedRscStream(fullRscStream.rscStream, {
      route: handlerOptions.route,
      logger: handlerOptions.logger,
      verbose: handlerOptions.verbose,
    });

    // Create HTML stream from buffered RSC
    const htmlRscStream = bufferedRscStreamFactory.createStream();
    htmlRscStream.pipe(htmlTransformStream);

    // Add error handling to prevent hanging
    htmlTransformStream.on("error", (error) => {
      if (handlerOptions.verbose) {
        handlerOptions.logger?.error(`[renderPage.client] HTML transform error: ${error.message}`);
      }
      // Don't throw here - let the error propagate through the stream
    });

    htmlHandler = {
      htmlStream: htmlTransformStream,
      abort: () => {
        htmlRscStream.destroy();
        htmlTransformStream.destroy();
      }
    };



    // Create stream wrappers for file writing
    const rscStreamWrapper = {
      pipe: <Writable extends NodeJS.WritableStream>(destination: Writable) => {
        const streamMetrics = createStreamMetrics();
        streamMetrics.startTime = performance.now();

        const rscFileStream = bufferedRscStreamFactory.createStream();

        rscFileStream.on("data", (chunk: Buffer) => {
          streamMetrics.chunks++;
          streamMetrics.bytes += chunk.length;
        });

        rscFileStream.on("end", () => {
          streamMetrics.duration = performance.now() - streamMetrics.startTime;
          streamMetrics.endTime = performance.now();

          rscHeadlessMetrics.streamMetrics = streamMetrics;
          rscHeadlessMetrics.chunkRate = streamMetrics.chunks / (streamMetrics.duration / 1000);
          rscHeadlessMetrics.processingTime = streamMetrics.duration;
          rscHeadlessMetrics.memoryUsage = process.memoryUsage();
          rscHeadlessMetrics.chunks = streamMetrics.chunks;
        });

        rscFileStream.pipe(destination);
        return destination;
      },
      abort: () => fullRscStream.abort(),
    };

    const htmlStreamWrapper = {
      pipe: <Writable extends NodeJS.WritableStream>(destination: Writable) => {
        // Collect metrics from the HTML transform stream as it flows
        const streamMetrics = createStreamMetrics();
        streamMetrics.startTime = performance.now();

        htmlHandler.htmlStream.on("data", (chunk: Buffer) => {
          streamMetrics.chunks++;
          streamMetrics.bytes += chunk.length;
        });

        htmlHandler.htmlStream.on("end", () => {
          streamMetrics.duration = performance.now() - streamMetrics.startTime;
          streamMetrics.endTime = performance.now();

                  // Update the metrics object for HTML generation
        htmlMetrics.streamMetrics = streamMetrics;
        htmlMetrics.chunkRate =
          streamMetrics.chunks / (streamMetrics.duration / 1000);
        htmlMetrics.processingTime = streamMetrics.duration;
        htmlMetrics.memoryUsage = process.memoryUsage();
        htmlMetrics.chunks = streamMetrics.chunks;
      });

      if (handlerOptions.verbose) {
        handlerOptions.logger?.info(
          `[renderPage.client] Piping HTML stream to destination for route: ${handlerOptions.route}`
        );
      }
      return htmlHandler.htmlStream.pipe(destination);
      },
      abort: () => {
        fullRscStream.abort();
        if (htmlHandler.abort) {
          htmlHandler.abort();
        }
      },
    };

    // Don't emit initial metrics - wait for file writes to complete
    // The onMetrics callback will be called after both file.write.done events

    yield {
      type: "success",
      html: htmlStreamWrapper,
      rsc: rscStreamWrapper,
      metrics: {
        rscFull: rscFullMetrics,
        rscHeadless: rscHeadlessMetrics,
        html: htmlMetrics,
      },
    } as const;
  } catch (error) {
    // Clean up resources
    try {
      if (headlessRscStream) headlessRscStream.abort();
      if (fullRscStream) fullRscStream.abort();
      if (htmlHandler?.abort) htmlHandler.abort();
    } catch (cleanupError: unknown) {
      handlerOptions.logger?.warn(`Failed to cleanup streams on error: ${cleanupError}`);
    }

    const panicError = handleError({
      error,
      logger: handlerOptions.logger,
      context: "renderPageClient",
      panicThreshold: handlerOptions.panicThreshold,
    });

    if (panicError != null) {
      yield {
        type: "error",
        error: panicError,
        metrics: {
          rscFull: rscFullMetrics,
          rscHeadless: rscHeadlessMetrics,
          html: htmlMetrics,
        },
      };
    } else {
      yield {
        type: "skip",
        reason: error,
        metrics: {
          rscFull: rscFullMetrics,
          rscHeadless: rscHeadlessMetrics,
          html: htmlMetrics,
        },
      };
    }
  }
}; 