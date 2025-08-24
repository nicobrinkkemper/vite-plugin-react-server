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

    // Step 2: Resolve components using the RSC worker with built paths
    // This separates component resolution from RSC generation, making the
    // subsequent RSC render completely synchronous
    if (!handlerOptions.worker) {
      throw new Error("RSC worker is required for client-side component resolution");
    }
    
    const resolvedComponents = await resolveComponents({
      route: handlerOptions.route,
      pagePath: resolvedPagePath,
      propsPath: resolvedPropsPath,
      rootPath: resolvedRootPath,
      htmlPath: resolvedHtmlPath,
      pageExportName: handlerOptions.pageExportName,
      propsExportName: handlerOptions.propsExportName,
      rootExportName: handlerOptions.rootExportName,
      htmlExportName: handlerOptions.htmlExportName,
      worker: handlerOptions.worker,
      onMetrics: handlerOptions.onMetrics,
      logger: handlerOptions.logger,
      verbose: handlerOptions.verbose,
    });

    // Step 2: Create handler options with resolved components
    // Now we have the actual components with proper built paths
    const newHandlerOptions = {
      ...handlerOptions,
      url: `${handlerOptions.url}`,
      route: `${handlerOptions.route}`,
      // Use resolved components instead of paths
      PageComponent: resolvedComponents.PageComponent,
      pageProps: resolvedComponents.pageProps,
      RootComponent: resolvedComponents.RootComponent,
      HtmlComponent: resolvedComponents.HtmlComponent,
      // Keep original paths for createRscStream compatibility
      pagePath: handlerOptions.pagePath,
      propsPath: handlerOptions.propsPath,
      rootPath: handlerOptions.rootPath,
      htmlPath: handlerOptions.htmlPath,
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

    // Step 2: Create single RSC stream using RSC worker (REVERSE from server)
    // 
    // ARCHITECTURE OVERVIEW:
    // - Server-side: RSC generation in main thread, HTML generation in worker
    // - Client-side: RSC generation in worker, HTML generation in main thread
    // 
    // The RSC worker generates the full RSC content with HTML wrapper.
    // We need to consume this stream twice: once for RSC file, once for HTML transformation.
    // Since Node.js streams can only be consumed once, we buffer the content.
    fullRscStream = createRscStream({
      ...newHandlerOptions,
      id: `${handlerOptions.route}-full-${uniqueId}`,
      rscTimeout: handlerOptions.rscTimeout || 5000,
      onMetrics: handlerOptions.onMetrics,
      // Full RSC: with HTML wrapper component (undefined = use default HTML component)
      htmlPath: handlerOptions.htmlPath || undefined,
    });

    // Step 3: Create a buffered RSC stream factory for dual consumption
    // 
    // PROBLEM: Node.js streams can only be consumed once, but we need to:
    // 1. Write the RSC content to index.rsc file
    // 2. Transform the RSC content to HTML for index.html file
    // 
    // SOLUTION: Buffer all RSC chunks and create a factory that can generate
    // multiple readable streams from the same buffered data
    const { createBufferedRscStream } = await import("../helpers/createBufferedRscStream.js");
    const bufferedRscStreamFactory = createBufferedRscStream(fullRscStream.rscStream, {
      route: handlerOptions.route,
      logger: handlerOptions.logger,
      verbose: handlerOptions.verbose,
    });

    // Step 4: Create HTML transform stream that will consume the buffered RSC stream
    // 
    // FLOW: RSC Worker -> RSC Stream -> Buffer -> HTML Transform -> HTML Stream
    // This mirrors the server-side flow but with roles reversed:
    // - Server: RSC Stream -> HTML Worker -> HTML Stream  
    // - Client: RSC Stream -> Main Thread HTML Transform -> HTML Stream
    
    const htmlTransformStream = createRscToHtmlStream({
      ...newHandlerOptions,
      htmlTimeout: handlerOptions.htmlTimeout || 15000,
      route: handlerOptions.route,
      logger: handlerOptions.logger,
      verbose: handlerOptions.verbose,
    });
    
    // Create a separate stream from the factory for HTML transformation
    const htmlRscStream = bufferedRscStreamFactory.createStream();
    
    // Pipe the HTML RSC stream to the HTML transform
    htmlRscStream.pipe(htmlTransformStream);

    htmlHandler = {
      htmlStream: htmlTransformStream,
      abort: () => {
        htmlTransformStream.destroy();
      }
    };



    // Create stream wrappers that match server-side API but with reverse conditions
    // 
    // CLIENT-SIDE ARCHITECTURE:
    // - RSC generation: Worker thread (via createRscStream)
    // - HTML generation: Main thread (via createRscToHtmlStream)
    // - File writing: Main thread (via fileWriter)
    // 
    // The buffered RSC stream allows us to consume the same RSC content twice:
    // 1. For RSC file writing (index.rsc)
    // 2. For HTML transformation (index.html)
    const rscStreamWrapper = {
      pipe: <Writable extends NodeJS.WritableStream>(destination: Writable) => {
        // Collect metrics from the RSC stream as it flows
        const streamMetrics = createStreamMetrics();
        streamMetrics.startTime = performance.now();

        // Create a separate stream from the factory for RSC file generation
        const rscFileStream = bufferedRscStreamFactory.createStream();

        // Use the buffered RSC stream for RSC file generation
        // This stream contains the same content as the HTML transform
        rscFileStream.on("data", (chunk: Buffer) => {
          streamMetrics.chunks++;
          streamMetrics.bytes += chunk.length;
        });

        rscFileStream.on("end", () => {
          streamMetrics.duration = performance.now() - streamMetrics.startTime;
          streamMetrics.endTime = performance.now();

          // Update the metrics object for RSC file generation
          rscHeadlessMetrics.streamMetrics = streamMetrics;
          rscHeadlessMetrics.chunkRate =
            streamMetrics.chunks / (streamMetrics.duration / 1000);
          rscHeadlessMetrics.processingTime = streamMetrics.duration;
          rscHeadlessMetrics.memoryUsage = process.memoryUsage();
          rscHeadlessMetrics.chunks = streamMetrics.chunks;
        });

        // Pipe the RSC file stream to the destination (RSC file writer)
        // This is a separate stream from the HTML transform stream
        rscFileStream.pipe(destination);
        return destination;
      },
      abort: () => {
        fullRscStream.abort();
      },
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

      // Add debugging to see if HTML stream is being piped correctly
      if (handlerOptions.verbose) {
        handlerOptions.logger?.info(
          `[renderPage.client] Piping HTML stream to destination for route: ${handlerOptions.route}`
        );
        
        htmlHandler.htmlStream.on("data", (chunk: Buffer) => {
          handlerOptions.logger?.info(
            `[renderPage.client] HTML stream chunk: ${chunk.length} bytes`
          );
        });
        
        htmlHandler.htmlStream.on("end", () => {
          handlerOptions.logger?.info(
            `[renderPage.client] HTML stream ended for route: ${handlerOptions.route}`
          );
        });
      }

      // Pipe the HTML transform stream to the destination (HTML file writer)
      // This stream contains the transformed HTML content from the RSC stream
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
    // Clean up any resources that might have been created
    try {
      if (headlessRscStream) {
        headlessRscStream.abort();
      }
      if (fullRscStream) {
        fullRscStream.abort();
      }
      if (htmlHandler) {
        htmlHandler.abort();
      }
    } catch (cleanupError: unknown) {
      handlerOptions.logger?.warn(
        `Failed to cleanup streams on error: ${cleanupError}`
      );
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