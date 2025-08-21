import { createRenderMetrics } from "../metrics/createRenderMetrics.js";
import type { RenderMetrics } from "../metrics/types.js";
import { routeToURL } from "../utils/routeToURL.js";
import type { RenderPageFn } from "./types.js";
import { handleError } from "../error/handleError.js";
import { assertNonReactServer } from "../config/getCondition.js";

import { createRscStream } from "../stream/createRscStream.client.js";




import { join } from "node:path";
import { createModuleResolutionMetrics } from "../metrics/createModuleResolutionMetrics.js";
import { createStreamMetrics } from "../metrics/createStreamMetrics.js";
import { performance } from "node:perf_hooks";


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

    // For client-side, we pass the actual component paths to the RSC worker
    // The worker will load these components using its loader
    const pagePath = handlerOptions.pagePath;
    const rootPath = handlerOptions.rootPath;
    const htmlPath = handlerOptions.htmlPath;
    const propsPath = handlerOptions.propsPath;

    
    // Create new handler options with actual paths (client-side approach)
    const newHandlerOptions = {
      ...handlerOptions,
      url: `${handlerOptions.url}`,
      route: `${handlerOptions.route}`,
      // Client-side: Pass actual component paths to the worker
      propsPath,
      pagePath,
      rootPath,
      htmlPath,
      // Client-side: Never pass direct components NOR page props
      // should be resolved in react-server environment
      pageProps: undefined,
      PageComponent: undefined,
      RootComponent: undefined,
      HtmlComponent: undefined,
    };

    // Start measuring module resolution time for RSC stream creation
    const moduleResolutionStartTime = performance.now();

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

    // Module resolution is complete when the RSC stream is created
    const moduleResolutionTime = performance.now() - moduleResolutionStartTime;
    if (handlerOptions.onMetrics) {
      const moduleResolutionMetric = createModuleResolutionMetrics({
        route: handlerOptions.route,
        workerType: "rsc", // RSC is created on RSC worker in client builds
        resolutionTime: moduleResolutionTime,
        fromMainThread: false,
        fromRscWorker: true,
        fromHtmlWorker: false,
        description: `Module resolution for RSC stream creation on RSC worker for route ${handlerOptions.route}`,
      });
      handlerOptions.onMetrics(moduleResolutionMetric);
    }

    // Step 2: Create full RSC stream using RSC worker (REVERSE from server)
    fullRscStream = createRscStream({
      ...newHandlerOptions,
      id: `${handlerOptions.route}-full-${uniqueId}`,
      rscTimeout: handlerOptions.rscTimeout || 5000,
      onMetrics: handlerOptions.onMetrics,
      // Full RSC: with HTML wrapper component (undefined = use default HTML component)
      htmlPath: htmlPath || undefined,
    });

    // Step 3: THIS IS THE FUNCTION THAT CREATES THE HTML STREAM THAT CONSUMES THE RSC-FULL
    // Use the same worker-based approach as server-side but in main thread
    // Server-side: RSC stream -> HTML worker -> HTML stream
    // Client-side: RSC stream -> Main thread HTML transform -> HTML stream
    const { createRscToHtmlStream } = await import("../react-static/rscToHtmlStream.client.js");
    
    const htmlTransformStream = createRscToHtmlStream({
      ...newHandlerOptions,
      htmlTimeout: handlerOptions.htmlTimeout || 15000,
      route: handlerOptions.route,
      logger: handlerOptions.logger,
      verbose: handlerOptions.verbose,
    });
    
    htmlHandler = {
      htmlStream: htmlTransformStream,
      abort: () => {
        htmlTransformStream.destroy();
      }
    };



    // Create stream wrappers that match server-side API but with reverse conditions
    // Client-side: RSC from worker, HTML from main thread
    const rscStreamWrapper = {
      pipe: <Writable extends NodeJS.WritableStream>(destination: Writable) => {
        // Collect metrics from the RSC stream as it flows
        const streamMetrics = createStreamMetrics();
        streamMetrics.startTime = performance.now();

        headlessRscStream.rscStream.on("data", (chunk: Buffer) => {
          streamMetrics.chunks++;
          streamMetrics.bytes += chunk.length;
        });

        headlessRscStream.rscStream.on("end", () => {
          streamMetrics.duration = performance.now() - streamMetrics.startTime;
          streamMetrics.endTime = performance.now();

          // Update the metrics object
          rscHeadlessMetrics.streamMetrics = streamMetrics;
          rscHeadlessMetrics.chunkRate =
            streamMetrics.chunks / (streamMetrics.duration / 1000);
          rscHeadlessMetrics.processingTime = streamMetrics.duration;
          rscHeadlessMetrics.memoryUsage = process.memoryUsage();
          rscHeadlessMetrics.chunks = streamMetrics.chunks;
        });

        // Pipe the RSC stream to the destination (file writer)
        headlessRscStream.pipe(destination);
        return destination;
      },
      abort: () => {
        headlessRscStream.abort();
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

          // Update the metrics object
          htmlMetrics.streamMetrics = streamMetrics;
          htmlMetrics.chunkRate =
            streamMetrics.chunks / (streamMetrics.duration / 1000);
          htmlMetrics.processingTime = streamMetrics.duration;
          htmlMetrics.memoryUsage = process.memoryUsage();
          htmlMetrics.chunks = streamMetrics.chunks;
        });

        // Pipe the full RSC stream through the HTML transform stream to the destination
        // This matches the server-side pattern: RSC stream -> HTML transform -> destination
        return fullRscStream.rscStream.pipe(htmlHandler.htmlStream).pipe(destination);
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