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
 * KEY INSIGHT: Node.js streams can only be consumed once, so instead of buffering
 * we open two RSC streams that share a single render: a headless stream feeds the
 * HTML transform, and a full stream (via reuseHeadlessStreamId) is written to the
 * .rsc file. Both consume the same underlying render without re-executing it.
 *
 * HELPER FUNCTIONS:
 * - createRscStream: Opens an RSC stream (headless + full share one render via reuseHeadlessStreamId)
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
import { createPageRenderMetrics } from "./renderPageMetrics.js";
import type { RenderMetrics } from "../metrics/types.js";
import { routeToURL } from "../utils/routeToURL.js";
import type { RenderPageFn } from "./types.js";
import { handleError } from "../error/handleError.js";
import { isLoaderSignal } from "../router/loaderSignals.js";
import { assertNonReactServer } from "../config/getCondition.js";

import { createRscStream } from "../stream/createRscStream.client.js";
import { resolveComponents } from "../helpers/resolveComponents.client.js";

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
  if (handlerOptions.verbose) {
    handlerOptions.logger?.info(
      `[renderPage.client] onEvent callback exists: ${!!handlerOptions.onEvent}`
    );
    handlerOptions.logger?.info(
      `[renderPage.client] onMetrics callback exists: ${!!handlerOptions.onMetrics}`
    );
  }

  // Track if we've yielded a result to prevent multiple yields
  let hasYielded = false;
  let errorResult: any = null;

  // Create a wrapper around onEvent to handle route.error events
  const wrappedOnEvent = (event: any) => {
    // Call the original onEvent first
    if (handlerOptions.onEvent) {
      handlerOptions.onEvent(event);
    }
    
    // Handle route.error events by storing result for later yielding
    if (event.type === "route.error" && !hasYielded) {
      hasYielded = true;

      // Loader control flow (redirect()/notFound()): pass the signal up as
      // this route's error so the page loop skips the page — not a panic,
      // not a client-only skip shell.
      if (isLoaderSignal(event.data.error)) {
        errorResult = {
          type: "error",
          error: event.data.error,
          metrics: {
            rscHeadless: { duration: 0, chunks: 0, bytes: 0 },
            html: { duration: 0, chunks: 0, bytes: 0 },
          },
        };
        return;
      }

      // Check if this should cause a panic
      const panicError = handleError({
        error: event.data.error,
        logger: handlerOptions.logger,
        panicThreshold: event.data.panicThreshold,
        context: `route.error (${event.data.route})`,
      });
      
      if (panicError != null) {
        // This is a panic error, store error result
        errorResult = {
          type: "error",
          error: panicError,
          metrics: {
            rscHeadless: { duration: 0, chunks: 0, bytes: 0 },
            html: { duration: 0, chunks: 0, bytes: 0 },
          },
        };
      } else {
        // This is a non-panic error, store skip result
        errorResult = {
          type: "skip",
          reason: event.data.error.message || "Non-panic error occurred",
          html: { duration: 0, chunks: 0, bytes: 0 },
          rsc: { duration: 0, chunks: 0, bytes: 0 },
          metrics: {
            rscHeadless: { duration: 0, chunks: 0, bytes: 0 },
            html: { duration: 0, chunks: 0, bytes: 0 },
          },
        };
      }
    }
  };

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

  // Metrics topology — client: RSC in the worker, HTML on the main thread
  // (reverse of server).
  const { htmlMetrics, rscFullMetrics, rscHeadlessMetrics } =
    createPageRenderMetrics(handlerOptions, {
      html: { fromMainThread: true, fromRscWorker: false, fromHtmlWorker: false },
      rscFull: { fromMainThread: false, fromRscWorker: true, fromHtmlWorker: false },
      rscHeadless: { fromMainThread: false, fromRscWorker: true, fromHtmlWorker: false },
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

    // Step 1: Resolve paths to built paths using the server manifest
    // The client version needs to use the server manifest to get the built paths
    // for the page components, not the static manifest
    const resolvePathWithManifest = (path: string, manifest: any): string => {
      const entry = manifest[path];
      if (entry && entry.file) {
        return entry.file;
      }
      return path;
    };

    // Use manifest for page component resolution (client version works in reverse)
    const manifest = handlerOptions.manifest || {};
    const resolvedPagePath = handlerOptions.pagePath ? resolvePathWithManifest(handlerOptions.pagePath, manifest) : undefined;
    const resolvedPropsPath = handlerOptions.propsPath ? resolvePathWithManifest(handlerOptions.propsPath, manifest) : undefined;
    const resolvedRootPath = handlerOptions.rootPath ? resolvePathWithManifest(handlerOptions.rootPath, manifest) : undefined;
    const resolvedHtmlPath = handlerOptions.htmlPath ? resolvePathWithManifest(handlerOptions.htmlPath, manifest) : undefined;

    if (handlerOptions.verbose) {
      handlerOptions.logger?.info(`[renderPage.client] Resolved paths for route ${handlerOptions.route}:`);
      handlerOptions.logger?.info(`  page: ${handlerOptions.pagePath} -> ${resolvedPagePath}`);
      handlerOptions.logger?.info(`  props: ${handlerOptions.propsPath} -> ${resolvedPropsPath}`);
      handlerOptions.logger?.info(`  root: ${handlerOptions.rootPath} -> ${resolvedRootPath}`);
      handlerOptions.logger?.info(`  html: ${handlerOptions.htmlPath} -> ${resolvedHtmlPath}`);
      handlerOptions.logger?.info(`  manifest keys: ${Object.keys(manifest).join(', ')}`);
      handlerOptions.logger?.info(`  HTML path issue: htmlPath='${handlerOptions.htmlPath}', resolved='${resolvedHtmlPath}', manifest has Html entry: ${!!manifest[handlerOptions.htmlPath || '']}`);
      handlerOptions.logger?.info(`  About to pass htmlPath='${resolvedHtmlPath}' to RSC stream`);
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

      // A loader redirect()/notFound() is control flow, not a failure: yield
      // it as this route's error so the page loop skips the page (no files,
      // no panic, no client-only fallback shell).
      if (isLoaderSignal(error)) {
        yield {
          type: "error",
          error,
          metrics: {
            rscFull: rscFullMetrics,
            rscHeadless: rscHeadlessMetrics,
            html: htmlMetrics,
          },
        };
        return;
      }

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
      // Pass page paths to the RSC worker so it knows what to render
      pagePath: resolvedPagePath,
      propsPath: resolvedPropsPath,
      rootPath: resolvedRootPath,
      htmlPath: resolvedHtmlPath,
    };

    if (handlerOptions.verbose) {
      handlerOptions.logger?.info(
        `[renderPage.client] handlerOptions.clientPipeableStreamOptions: ${JSON.stringify(handlerOptions.clientPipeableStreamOptions)}`
      );
      handlerOptions.logger?.info(
        `[renderPage.client] newHandlerOptions.clientPipeableStreamOptions: ${JSON.stringify(newHandlerOptions.clientPipeableStreamOptions)}`
      );
      handlerOptions.logger?.info(
        `[renderPage.client] newHandlerOptions page paths: pagePath=${newHandlerOptions.pagePath}, propsPath=${newHandlerOptions.propsPath}, rootPath=${newHandlerOptions.rootPath}, htmlPath=${newHandlerOptions.htmlPath}`
      );
    }

    // Component resolution is already measured in resolveComponents
    // No need to measure module resolution time here anymore

    // Create headless RSC stream first (for .rsc file)
    const uniqueId = handlerOptions.id ?? `${handlerOptions.route}-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    
    const headlessRscStreamLocal = createRscStream({
      ...newHandlerOptions,
      id: `${handlerOptions.route}-headless-${uniqueId}`,
      rscTimeout: handlerOptions.rscTimeout || 5000,
      onMetrics: handlerOptions.onMetrics,
      // Headless RSC stream: page content only (for .rsc file)
      htmlPath: '', // No HTML wrapper - just page content
      pagePath: newHandlerOptions.pagePath || '', // Ensure pagePath is always a string
      url: newHandlerOptions.url || '', // Ensure url is always a string
      pageProps: newHandlerOptions.pageProps || {}, // Ensure pageProps is always an object
      onEvent: wrappedOnEvent,
    });

    // Create full RSC stream that reuses the headless stream elements
    const fullRscStreamLocal = createRscStream({
      ...newHandlerOptions,
      id: `${handlerOptions.route}-full-${uniqueId}`,
      rscTimeout: handlerOptions.rscTimeout || 5000,
      onMetrics: handlerOptions.onMetrics,
      // Full RSC stream: include HTML wrapper (for HTML generation)
      // Pass through the resolved htmlPath so custom Html components work in client mode
      htmlPath: resolvedHtmlPath,
      pagePath: newHandlerOptions.pagePath || '', // Ensure pagePath is always a string
      url: newHandlerOptions.url || '', // Ensure url is always a string
      pageProps: newHandlerOptions.pageProps || {}, // Ensure pageProps is always an object
      // Reuse headless stream elements - the worker will handle this with the unique ID
      reuseHeadlessStreamId: headlessRscStreamLocal.id,
      onEvent: wrappedOnEvent,
    });

    // Assign to the outer variables
    headlessRscStream = headlessRscStreamLocal;
    fullRscStream = fullRscStreamLocal;

    // The headless stream will be consumed naturally by the file writing
    // The full stream will reuse the headless stream elements for HTML generation

    // Step 3: Create HTML transform stream
    if (handlerOptions.verbose) {
      handlerOptions.logger?.info(
        `[renderPage.client] Creating HTML transform stream with clientPipeableStreamOptions: ${JSON.stringify(newHandlerOptions.clientPipeableStreamOptions)}`
      );
    }
    // Create HTML stream using the full RSC stream (which reuses headless stream elements)
    const htmlTransformStream = createRscToHtmlStream({
      ...newHandlerOptions,
      // SSG render: the emitted HTML must BE the page (react-dom/static).
      prerender: true,
      htmlTimeout: handlerOptions.htmlTimeout || 15000,
      route: handlerOptions.route,
      logger: handlerOptions.logger,
      verbose: handlerOptions.verbose,
      rscStream: fullRscStreamLocal.rscStream,
    });

    htmlHandler = {
      htmlStream: htmlTransformStream,
      abort: () => {
        htmlTransformStream.abort();
      }
    };

    // Create stream wrappers for file writing
    const rscStreamWrapper = {
      pipe: <Writable extends NodeJS.WritableStream>(destination: Writable) => {
        // Seed from the entry-stamped metrics — same origin as the html span
        // (see renderPage.server: both indexes share one clock, html ≥ rsc).
        const streamMetrics = createStreamMetrics({
          startTime: rscHeadlessMetrics.streamMetrics.startTime,
          startAt: rscHeadlessMetrics.streamMetrics.startAt,
        });

        // Use the headless RSC stream directly for the .rsc file
        const rscFileStream = headlessRscStream.rscStream;

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
      abort: () => headlessRscStream.abort(),
    };

    const htmlStreamWrapper = {
      pipe: <Writable extends NodeJS.WritableStream>(destination: Writable) => {
        if (handlerOptions.verbose) {
          handlerOptions.logger?.info(
            `[renderPage.client] Piping HTML stream to destination for route: ${handlerOptions.route}`
          );
        }
        
        // Use the HTML transform stream's pipe method directly (same as server side)
        return htmlTransformStream.pipe(destination);
      },
      abort: () => {
        fullRscStream.abort();
        if (htmlHandler.abort) {
          htmlHandler.abort();
        }
      },
      on: (event: string, listener: (...args: any[]) => void) => {
        // Forward error events from the HTML transform stream to the wrapper
        if (event === 'error') {
          // Access the actual stream from the transform result
          const htmlStream = (htmlTransformStream as any).htmlStream;
          if (htmlStream && typeof htmlStream.on === 'function') {
            htmlStream.on('error', listener);
          }
        }
        return htmlStreamWrapper;
      },
    };

    // Don't emit initial metrics - wait for file writes to complete
    // The onMetrics callback will be called after both file.write.done events

    // Check if we have an error result to yield (with timeout protection)
    // Wait a short time for any pending route.error events
    await new Promise(resolve => setTimeout(resolve, 100));
    
    if (errorResult) {
      yield errorResult;
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
        pageProps: {}, // Ensure pageProps is always an object
      });
      
      // Create HTML stream that processes the fallback RSC stream to ensure performance timing script is injected
      const fallbackHtmlStream = createRscToHtmlStream({
        prerender: true,
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
        onMetrics: handlerOptions.onMetrics,
        build: handlerOptions.build,
      });
      
      // Create a wrapper that pipes the fallback RSC stream through the HTML transform
      const clientOnlyHtmlStreamWrapper = {
        pipe: <Writable extends NodeJS.WritableStream>(destination: Writable) => {
          // Pipe the fallback RSC stream through the HTML transform to ensure performance timing script is injected
          return fallbackHtmlStream.pipe(destination);
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