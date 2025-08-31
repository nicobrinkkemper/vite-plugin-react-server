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
    // Create empty stream wrappers for skip case
    const emptyStreamWrapper = {
      pipe: <Writable extends NodeJS.WritableStream>(destination: Writable) => {
        destination.end();
        return destination;
      },
      abort: () => {
        // No cleanup needed
      },
    };

    yield {
      type: "skip",
      reason: "No pagePath and no PageComponent provided",
      html: emptyStreamWrapper,
      rsc: emptyStreamWrapper,
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
  
  // Error tracking variables for RSC stream error detection
  let headlessStreamErrored = false;
  let headlessError: Error | null = null;
  let headlessPanicError = false;

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
    try {
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
    } catch (componentResolutionError) {
      // Handle component resolution failures gracefully
      const error = componentResolutionError instanceof Error 
        ? componentResolutionError 
        : new Error(String(componentResolutionError));
      
      // Check if this component resolution error should cause a panic based on panicThreshold
      const panicError = handleError({
        error,
        critical: false,
        logger: handlerOptions.logger,
        panicThreshold: handlerOptions.panicThreshold,
        context: `Component resolution failed for route ${handlerOptions.route}`,
      });
      
             // If this should cause a panic, yield error and return
       if (panicError) {
         yield {
           type: "error",
           error: panicError,
           metrics: {
             rscFull: rscFullMetrics,
             rscHeadless: rscHeadlessMetrics,
             html: htmlMetrics,
           },
         };
         return;
       }
       
       // Otherwise, treat this as a non-critical error and continue with client-only HTML
       // This allows the build to complete with a client-only page
       handlerOptions.logger?.warn(
         `[renderPage.client] Component resolution failed for route ${handlerOptions.route}, continuing with client-only HTML: ${error.message}`
       );
       
       // Create a client-only HTML stream wrapper with minimal HTML
       const clientOnlyHtmlStreamWrapper = {
         pipe: <Writable extends NodeJS.WritableStream>(destination: Writable) => {
           // Write a minimal client-only HTML structure
           const minimalHtml = `<!DOCTYPE html><html><head><link rel="expect" href="#«R»" blocking="render"/></head><body><div id="root"></div><template id="«R»"></template></body></html>`;
           destination.write(minimalHtml);
           destination.end();
           return destination;
         },
         abort: () => {
           // No cleanup needed for simple HTML string
         },
       };
       
       // Create an empty RSC stream wrapper
       const emptyRscStreamWrapper = {
         pipe: <Writable extends NodeJS.WritableStream>(destination: Writable) => {
           // No RSC content for failed component resolution
           destination.end();
           return destination;
         },
         abort: () => {
           // No cleanup needed
         },
       };
       
       // Yield skip result with client-only HTML and empty RSC
       yield {
         type: "skip",
         reason: error,
         html: clientOnlyHtmlStreamWrapper,
         rsc: emptyRscStreamWrapper,
         metrics: {
           rscFull: rscFullMetrics,
           rscHeadless: rscHeadlessMetrics,
           html: htmlMetrics,
         },
       };
       return;
    }

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

    if (handlerOptions.verbose) {
      handlerOptions.logger?.info(
        `[renderPage.client] handlerOptions.clientPipeableStreamOptions: ${JSON.stringify(handlerOptions.clientPipeableStreamOptions)}`
      );
      handlerOptions.logger?.info(
        `[renderPage.client] newHandlerOptions.clientPipeableStreamOptions: ${JSON.stringify(newHandlerOptions.clientPipeableStreamOptions)}`
      );
    }

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

    // Add error detection to headless RSC stream
    headlessRscStream.rscStream.on("data", (chunk: Buffer) => {
      // Check for React errors in the RSC stream
      const chunkStr = chunk.toString();
      if (chunkStr.includes('"name":"Error"') && chunkStr.includes('"env":"Server"')) {
        // This looks like a React error serialized in the RSC stream
        headlessStreamErrored = true;
        
        // Extract the error message from the RSC stream
        try {
          const errorMatch = chunkStr.match(/"message":"([^"]*)"/);
          const errorMessage = errorMatch ? errorMatch[1] : "React error detected in RSC stream";
          headlessError = new Error(errorMessage);
        } catch {
          headlessError = new Error("React error detected in RSC stream");
        }
        
        // Check if this React error should cause a panic based on panicThreshold
        const panicError = handleError({
          error: headlessError,
          critical: false,
          logger: handlerOptions.logger,
          panicThreshold: handlerOptions.panicThreshold,
          context: `React error in RSC stream for route ${handlerOptions.route}`,
        });
        
        // Store either the panic error or the original error
        headlessError = panicError || headlessError;
        headlessPanicError = !!panicError;
      }
    });

    // Component resolution is already measured in resolveComponents
    // No need to measure module resolution time here anymore

    // Step 2: Create full RSC stream for HTML transformation
    // The RSC worker will handle fallback components internally when headless errors are detected
    fullRscStream = createRscStream({
      ...newHandlerOptions,
      id: `${handlerOptions.route}-full-${uniqueId}`,
      rscTimeout: handlerOptions.rscTimeout || 5000,
      onMetrics: handlerOptions.onMetrics,
      htmlPath: handlerOptions.htmlPath || undefined,
    });

    // Step 3: Create HTML transform stream
    if (handlerOptions.verbose) {
      handlerOptions.logger?.info(
        `[renderPage.client] Creating HTML transform stream with clientPipeableStreamOptions: ${JSON.stringify(newHandlerOptions.clientPipeableStreamOptions)}`
      );
    }
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

    // Check for panic errors from RSC stream
    if (headlessStreamErrored && headlessPanicError) {
      yield {
        type: "error",
        error: headlessError,
        metrics: {
          rscFull: rscFullMetrics,
          rscHeadless: rscHeadlessMetrics,
          html: htmlMetrics,
        },
      };
      return;
    }

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
      // For non-panic errors, we still want to write the HTML file (client-only)
      // but skip the RSC file since there was a server error
      
      // Create a fallback RSC stream with React.Fragment (same as server environment)
      const fallbackRscStream = createRscStream({
        ...handlerOptions,
        url: `${handlerOptions.url}`,
        route: `${handlerOptions.route}`,
        cssFiles: handlerOptions.cssFiles || new Map(),
        globalCss: handlerOptions.globalCss || new Map(),
        id: `${handlerOptions.route}-fallback-${Date.now()}`,
        rscTimeout: handlerOptions.rscTimeout || 5000,
        onMetrics: handlerOptions.onMetrics,
        // Use React.Fragment as fallback (same as server environment)
        pagePath: '', // This will cause the default page to be used, but we'll override it
        // Override the page component to use React.Fragment
        PageComponent: undefined,
        HtmlComponent: undefined,
      });
      
      // Create HTML stream that processes the fallback RSC stream to ensure performance timing script is injected
      const fallbackHtmlStream = createRscToHtmlStream({
        id: handlerOptions.id,
        route: handlerOptions.route,
        url: handlerOptions.url,
        moduleRootPath: handlerOptions.moduleRootPath,
        moduleBasePath: handlerOptions.moduleBasePath,
        moduleBaseURL: handlerOptions.moduleBaseURL,
        projectRoot: handlerOptions.projectRoot,
        panicThreshold: handlerOptions.panicThreshold,
        verbose: handlerOptions.verbose,
        signal: handlerOptions.signal,
        logger: handlerOptions.logger,
        htmlTimeout: handlerOptions.htmlTimeout,
        clientPipeableStreamOptions: handlerOptions.clientPipeableStreamOptions,
      });
      
      // Create a wrapper that pipes the fallback RSC stream through the HTML transform
      const clientOnlyHtmlStreamWrapper = {
        pipe: <Writable extends NodeJS.WritableStream>(destination: Writable) => {
          // Pipe the fallback RSC stream through the HTML transform to ensure performance timing script is injected
          return fallbackRscStream.rscStream.pipe(fallbackHtmlStream).pipe(destination);
        },
        abort: () => {
          // Clean up the fallback RSC stream
          fallbackRscStream.abort();
        },
      };
      
      // Create an empty RSC stream wrapper
      const emptyRscStreamWrapper = {
        pipe: <Writable extends NodeJS.WritableStream>(destination: Writable) => {
          // No RSC content for skipped routes
          destination.end();
          return destination;
        },
        abort: () => {
          // No cleanup needed
        },
      };
      
      yield {
        type: "skip",
        reason: error,
        html: clientOnlyHtmlStreamWrapper,
        rsc: emptyRscStreamWrapper,
        metrics: {
          rscFull: rscFullMetrics,
          rscHeadless: rscHeadlessMetrics,
          html: htmlMetrics,
        },
      };
    }
  }
}; 