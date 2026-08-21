/**
 * renderPage.server.ts
 *
 * PURPOSE: Server-side static page rendering for React Server Components
 *
 * ARCHITECTURE OVERVIEW:
 * 
 * SERVER-SIDE vs CLIENT-SIDE:
 * - Server-side: RSC generation in main thread, HTML generation in worker
 * - Client-side: RSC generation in worker, HTML generation in main thread
 * 
 * FLOW:
 * 1. Create headless RSC stream (for .rsc file)
 * 2. Create full RSC stream (for HTML generation)
 * 3. Create HTML transform stream that converts RSC to HTML
 * 4. Both streams are piped to file writers
 * 
 * SIMPLIFIED APPROACH:
 * This implementation follows the same simple pattern as the client side,
 * avoiding complex backpressure handling and race conditions.
 */

import { createPageRenderMetrics } from "./renderPageMetrics.js";
import { routeToURL } from "../utils/routeToURL.js";
import { describeProps } from "../helpers/describeProps.js";
import type { RenderPageFn } from "./types.js";
import { handleError } from "../error/handleError.js";
import { assertReactServer } from "../config/getCondition.js";

import { renderRscStream } from "../stream/renderRscStream.server.js";
import { createMainThreadHandlers } from "../stream/createMainThreadHandlers.js";
import { createRscToHtmlStream } from "./rscToHtmlStream.server.js";
import { resolveComponent } from "../helpers/resolveComponent.js";
import { resolvePageAndProps } from "../helpers/resolvePageAndProps.js";
import { createModuleResolutionMetrics } from "../metrics/createModuleResolutionMetrics.js";
import { createStreamMetrics } from "../metrics/createStreamMetrics.js";
import { createHeadlessStreamState, trackHeadlessStreamError, hasHeadlessStreamError } from "../helpers/headlessStreamState.js";

export const renderPage: RenderPageFn = async function* renderPage(
  handlerOptions
) {
  // Ensure we're in the correct environment
  assertReactServer();

  // Metrics topology — server: RSC on the main thread, HTML in the worker.
  const { htmlMetrics, rscFullMetrics, rscHeadlessMetrics } =
    createPageRenderMetrics(handlerOptions, {
      html: { fromMainThread: false, fromRscWorker: false, fromHtmlWorker: true },
      rscFull: { fromMainThread: true, fromRscWorker: false, fromHtmlWorker: false },
      rscHeadless: { fromMainThread: true, fromRscWorker: false, fromHtmlWorker: false },
    });

  // Declare variables outside try block
  let headlessRscHandler: any = null;
  let fullRscHandler: any = null;
  let htmlTransformStream: any = null;
  
  // Error tracking variables for headless stream
  let headlessStreamErrored = false;
  let headlessError: Error | null = null;
  
  // Error tracking variables for HTML stream
  let htmlStreamErrored = false;
  let htmlStreamError: Error | null = null;

  // Server-side stream reuse storage (similar to client-side headlessStreamElements)
  const headlessStreamState = createHeadlessStreamState();

  try {
    if (handlerOptions.verbose) {
      handlerOptions.logger?.info(
        `[renderPage.server] Server-side rendering for route: ${handlerOptions.route}`
      );
    }

    // Set URL if not provided
    if (!handlerOptions.url) {
      handlerOptions.url = routeToURL(
        handlerOptions.route,
        handlerOptions.moduleBaseURL,
        handlerOptions.build.rscOutputPath
      );
    }

    // Resolve components and props using the proper helper. The whole load
    // phase is timed and emitted as a module-resolution metric: on the first
    // (cold) batch this is where routes spend their time — module code
    // compiling and executing on the main thread — and without the metric the
    // watcher attributes all of it to "render".
    const resolveStartAt = Date.now();
    const resolveStart = performance.now();
    let PageComponent: any = null;
    let RootComponent: any = null;
    let HtmlComponent: any = null;
    let pageProps: any = {}; // Initialize as empty object - props function will populate it
    let layoutChain: any;

    // Use resolvePageAndProps helper to properly load page and props
    if (handlerOptions.pagePath) {
      try {
        const pageAndPropsResult = await resolvePageAndProps({
          pagePath: handlerOptions.pagePath,
          pageExportName: handlerOptions.pageExportName,
          propsPath: handlerOptions.propsPath,
          propsExportName: handlerOptions.propsExportName,
          loader: handlerOptions.loader,
          verbose: handlerOptions.verbose,
          logger: handlerOptions.logger,
          route: handlerOptions.route,
          url: handlerOptions.url,
          moduleBaseURL: handlerOptions.moduleBaseURL,
          routePatterns: handlerOptions.routePatterns,
          stripHtmlSuffix: handlerOptions.stripHtmlSuffix,
          layouts: handlerOptions.layouts,
          layoutExportName: handlerOptions.layoutExportName,
          build: {
            rscOutputPath: handlerOptions.build.rscOutputPath,
          },
        });

        if (pageAndPropsResult.type === "success") {
          PageComponent = pageAndPropsResult.PageComponent;
          // Always use the props returned from the props function
          // Root components can handle empty props with their defaults
          pageProps = pageAndPropsResult.pageProps || {};
          layoutChain = pageAndPropsResult.layoutChain;
          
          if (handlerOptions.verbose) {
            handlerOptions.logger?.info(
              `[renderPage.server] Successfully loaded page and props for route ${handlerOptions.route}: pageProps=${describeProps(pageProps)}`
            );
          }
        } else {
          handlerOptions.logger?.warn(
            `Failed to load page and props from ${handlerOptions.pagePath}: ${
              pageAndPropsResult.error?.message || "Unknown error"
            }`
          );
        }
      } catch (error) {
        handlerOptions.logger?.warn(
          `Error loading page and props from ${handlerOptions.pagePath}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    // Load Root component
    if (handlerOptions.rootPath) {
      try {
        const rootResult = await resolveComponent({
          componentPath: handlerOptions.rootPath,
          exportName: handlerOptions.rootExportName,
          loader: handlerOptions.loader,
        });
        if (rootResult.type === "success") {
          RootComponent = rootResult.component;
        } else {
          handlerOptions.logger?.warn(
            `Failed to load Root component from ${handlerOptions.rootPath}: ${
              rootResult.error?.message || "Unknown error"
            }`
          );
        }
      } catch (error) {
        handlerOptions.logger?.warn(
          `Error loading Root component from ${handlerOptions.rootPath}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    // Load Html component
    if (handlerOptions.htmlPath) {
      try {
        const htmlResult = await resolveComponent({
          componentPath: handlerOptions.htmlPath,
          exportName: handlerOptions.htmlExportName,
          loader: handlerOptions.loader,
        });
        if (htmlResult.type === "success") {
          HtmlComponent = htmlResult.component;
        } else {
          handlerOptions.logger?.warn(
            `Failed to load Html component from ${handlerOptions.htmlPath}: ${
              htmlResult.error?.message || "Unknown error"
            }`
          );
        }
      } catch (error) {
        handlerOptions.logger?.warn(
          `Error loading Html component from ${handlerOptions.htmlPath}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    // Use defaults if components are still not loaded. Imported lazily
    // (point-of-use) so the static plugin-import graph never pulls React in at
    // config eval.
    if (!RootComponent) {
      const { Root: DefaultRoot } = await import("../components/root.js");
      RootComponent = DefaultRoot as any;
    }
    if (!HtmlComponent) {
      const { Html: DefaultHtml } = await import("../components/html.js");
      HtmlComponent = DefaultHtml as any;
    }

    if (handlerOptions.onMetrics) {
      const resolutionTime = performance.now() - resolveStart;
      handlerOptions.onMetrics(
        createModuleResolutionMetrics({
          route: handlerOptions.route,
          workerType: "mainThread",
          resolutionTime,
          resolveStartAt,
          // Main-thread loads have no cache/wait split: the load IS the run.
          moduleRunAt: resolveStartAt,
          moduleRunTime: resolutionTime,
          description: `Module resolution for route ${handlerOptions.route}`,
        })
      );
    }

    // Ensure we have all required components
    if (!PageComponent || !RootComponent || !HtmlComponent) {
      yield {
        type: "error",
        error: new Error(
          `Component resolution failed: missing required components (Page: ${!!PageComponent}, Root: ${!!RootComponent}, Html: ${!!HtmlComponent})`
        ),
        metrics: {
          rscFull: rscFullMetrics,
          rscHeadless: rscHeadlessMetrics,
          html: htmlMetrics,
        },
      };
      return;
    }

    // Create handler options with resolved components and props
    const uniqueId = handlerOptions.id ?? `${handlerOptions.route}?id=${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    const newHandlerOptions = {
      ...handlerOptions,
      id: uniqueId,
      url: `${handlerOptions.url}`,
      route: `${handlerOptions.route}`,
      PageComponent,
      RootComponent,
      HtmlComponent,
      pageProps,
      layoutChain,
    };

    if (handlerOptions.verbose) {
      handlerOptions.logger?.info(
        `[renderPage.server] Created newHandlerOptions for route ${handlerOptions.route}`
      );
    }

    // Create headless RSC handler (for .rsc file) - with proper error handling
    const headlessHandlers = createMainThreadHandlers(
      handlerOptions,
      (error, isPanic) => {
        if (handlerOptions.verbose) {
          handlerOptions.logger?.info(
            `[renderPage.server] Headless stream error handler called for route ${handlerOptions.route}: ${error.message}, isPanic: ${isPanic}`
          );
        }
        
        // Track if the headless stream had errors
        headlessStreamErrored = true;
        headlessError = error instanceof Error ? error : new Error("Headless RSC stream failed");
        
        // Track headless stream errors for conditional reuse logic (like RSC worker)
        trackHeadlessStreamError(headlessStreamState, handlerOptions.route, headlessError);
        
        if (handlerOptions.verbose) {
          handlerOptions.logger?.info(
            `[renderPage.server] Stored headless stream error for route ${handlerOptions.route} in headlessStreamErrors map`
          );
        }
        
        // Store panic errors for later handling
        if (isPanic) {
          // For panic threshold "all_errors", the panic error will be handled by renderPages
          if (handlerOptions.verbose) {
            handlerOptions.logger?.info(
              `[renderPage.server] Panic error detected for route ${handlerOptions.route}, will be handled by renderPages`
            );
          }
        }
      }
    );
    
    // Override onData to track metrics
    headlessHandlers.onData = (_id, chunk) => {
      rscHeadlessMetrics.chunks++;
      rscHeadlessMetrics.streamMetrics.bytes += chunk.length;
    };
    
    headlessRscHandler = renderRscStream(
      {
        ...newHandlerOptions,
        htmlPath: '', // Headless RSC - no HTML wrapper
        // If we expect errors, provide a safe Page component that doesn't throw
        PageComponent: newHandlerOptions.PageComponent, // Use original for now, will be overridden if errors occur
      },
      headlessHandlers
    );
    
    // Note: Panic errors will be yielded from the error handler when they occur
    // No need to check shouldYieldPanicError here as it's set asynchronously

    // Store PageComponent for reuse when headless stream completes (like RSC worker)
    headlessRscHandler.rscStream.on('end', () => {
      // Only store if this is a headless stream and no errors occurred (like RSC worker)
      if (!hasHeadlessStreamError(headlessStreamState, handlerOptions.route)) {
        headlessStreamState.elements.set(uniqueId, {
          PageComponent: newHandlerOptions.PageComponent,
          errored: false
        });
        if (handlerOptions.verbose) {
          handlerOptions.logger?.info(`[renderPage.server] Stored PageComponent for headless stream ${uniqueId}`);
        }
      } else {
        if (handlerOptions.verbose) {
          handlerOptions.logger?.info(`[renderPage.server] Headless stream errored for route ${handlerOptions.route}, not storing PageComponent for reuse`);
        }
      }
    });

    // Create full RSC handler (for HTML generation) - reuse headless stream elements if no errors
    // For server-side, we create both streams in parallel like the client-side
    let fullPanicError: Error | null = null;
    const fullHandlers = createMainThreadHandlers(
      handlerOptions,
      (error, isPanic) => {
        // If this is a panic error, store it to be handled later
        if (isPanic) {
          fullPanicError = error instanceof Error ? error : new Error("Full RSC stream failed");
        }
      }
    );
    
    // Override onData to track metrics
    fullHandlers.onData = (_id, chunk) => {
      rscFullMetrics.chunks++;
      rscFullMetrics.streamMetrics.bytes += chunk.length;
    };
    
    // Create full RSC handler options - use React.Fragment if headless stream had errors (like RSC worker)
    // Check if there are any existing headless stream errors for this route
    const hasExistingHeadlessError = hasHeadlessStreamError(headlessStreamState, handlerOptions.route);
    const shouldUseFallback = headlessStreamErrored || hasExistingHeadlessError;
    
    if (handlerOptions.verbose) {
      handlerOptions.logger?.info(
        `[renderPage.server] Creating full RSC handler options for route ${handlerOptions.route}: headlessStreamErrored=${headlessStreamErrored}, hasExistingHeadlessError=${hasExistingHeadlessError}, shouldUseFallback=${shouldUseFallback}`
      );
    }
    
    // Create a wrapper PageComponent that returns null if there are headless stream errors
    const SafePageComponent = (props: any) => {
      // Check if there are any headless stream errors for this route
      const hasError = hasHeadlessStreamError(headlessStreamState, handlerOptions.route);
      if (hasError) {
        return null;
      }
      return newHandlerOptions.PageComponent(props);
    };
    
    const fullRscHandlerOptions = {
      ...newHandlerOptions,
      htmlPath: undefined, // Full RSC - include HTML wrapper
      headlessStreamElements: headlessStreamState.elements, // Pass the storage map for reuse
      // Use SafePageComponent that returns null when there are headless stream errors
      PageComponent: SafePageComponent,
    };
    
    
    // Create a PageComponent that uses React.use() to consume the headless stream and check for errors

    // Store the headless stream elements for reuse (like RSC worker does)
    
    // Listen for the headless stream to complete and store its elements
    headlessRscHandler.rscStream.on('end', () => {
      if (!hasHeadlessStreamError(headlessStreamState, handlerOptions.route)) {
        if (handlerOptions.verbose) {
          handlerOptions.logger?.info(
            `[renderPage.server] Headless stream completed successfully for route ${handlerOptions.route}`
          );
        }
      }
    });

    
    if (handlerOptions.verbose) {
      handlerOptions.logger?.info(
        `[renderPage.server] Created PageComponent that uses React.use() to consume headless stream for route ${handlerOptions.route}`
      );
    }
    
    fullRscHandler = renderRscStream(fullRscHandlerOptions, fullHandlers);
    
    // Check for panic error after creating the handler
    if (fullPanicError) {
      yield {
        type: "error",
        error: fullPanicError,
        metrics: {
          rscFull: rscFullMetrics,
          rscHeadless: rscHeadlessMetrics,
          html: htmlMetrics,
        },
      };
      return;
    }

    // Create HTML transform stream - need createRscToHtmlStream for async server actions
    htmlTransformStream = createRscToHtmlStream({
      // SSG render: the emitted HTML must BE the page (react-dom/static).
      prerender: true,
      id: handlerOptions.id,
      worker: handlerOptions.worker,
      route: handlerOptions.route,
      url: handlerOptions.url,
      moduleRootPath: handlerOptions.moduleRootPath,
      moduleBasePath: handlerOptions.moduleBasePath,
      moduleBaseURL: handlerOptions.moduleBaseURL,
      projectRoot: handlerOptions.projectRoot,
      build: handlerOptions.build,
      panicThreshold: handlerOptions.panicThreshold,
      verbose: handlerOptions.verbose,
      signal: handlerOptions.signal,
      logger: handlerOptions.logger,
      htmlWorker: handlerOptions.htmlWorker,
      clientPipeableStreamOptions: handlerOptions.clientPipeableStreamOptions,
      onMetrics: handlerOptions.onMetrics,
      htmlTimeout: handlerOptions.htmlTimeout || 15000,
      rscStream: fullRscHandler.rscStream,
      onError: (error, isPanic) => {
        // Track HTML stream errors
        htmlStreamErrored = true;
        htmlStreamError = error;
        
        if (isPanic) {
          // This is a panic error, it should be yielded as an error result
          if (handlerOptions.verbose) {
            handlerOptions.logger?.error(
              `[renderPage.server] HTML stream panic error for route ${handlerOptions.route}: ${error.message}`
            );
          }
        } else {
          // For non-panic errors, just log them
          if (handlerOptions.verbose) {
            handlerOptions.logger?.warn(
              `[renderPage.server] HTML stream error for route ${handlerOptions.route}: ${error.message}`
            );
          }
        }
      },
    });

    // Create stream wrappers for file writing - simplified like client side
    const rscStreamWrapper = {
      pipe: <Writable extends NodeJS.WritableStream>(destination: Writable) => {
        // Seed the span from the ORIGINAL metrics created at renderPage entry
        // — the same origin the html span counts from. Both indexes then share
        // one clock: the .rsc span reads "flight ready at X", the .html span
        // "document done at Y", and Y ≥ X structurally because the html render
        // consumes the flight. A pipe-time stamp here measured only the file
        // flush (1-7ms) and made the pair look unrelated.
        const streamMetrics = createStreamMetrics({
          startTime: rscHeadlessMetrics.streamMetrics.startTime,
          startAt: rscHeadlessMetrics.streamMetrics.startAt,
        });

        // Use the headless RSC stream directly for the .rsc file
        const rscFileStream = headlessRscHandler.rscStream;

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
      abort: () => headlessRscHandler.abort(),
    };

    const htmlStreamWrapper = {
      pipe: <Writable extends NodeJS.WritableStream>(destination: Writable) => {
        // Use the HTML transform stream's pipe method directly (same as client side)
        return htmlTransformStream.pipe(destination);
      },
      abort: () => {
        htmlTransformStream.abort();
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

    // Wait for HTML stream to complete or error before yielding success
    // This ensures that any errors from the HTML stream are caught before we yield success
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`HTML stream timeout for route ${handlerOptions.route}`));
      }, handlerOptions.htmlTimeout || 15000);

      // Check if HTML stream already errored
      if (htmlStreamErrored) {
        clearTimeout(timeout);
        resolve(); // Let the panic threshold logic handle this at the renderPages level
        return;
      }

      // Set up a flag to track if we've resolved
      let resolved = false;
      
      // Create a wrapper that resolves the promise when the stream completes
      const originalPipe = htmlTransformStream.pipe;
      htmlTransformStream.pipe = function(destination: any) {
        const result = originalPipe.call(this, destination);
        
        // Listen for the destination stream to end
        destination.on('finish', () => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            resolve();
          }
        });
        
        destination.on('error', (error: Error) => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            reject(error);
          }
        });
        
        return result;
      };
      
      // If we don't have a destination yet, resolve after a short delay
      // This handles the case where the stream is created but not yet piped
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve();
        }
      }, 100);
    });

    // Check for HTML stream errors after waiting for completion
    if (htmlStreamErrored) {
      yield {
        type: "error",
        error: htmlStreamError || new Error("HTML stream failed"),
        metrics: {
          rscFull: rscFullMetrics,
          rscHeadless: rscHeadlessMetrics,
          html: htmlMetrics,
        },
      };
      return;
    }

    // Yield success result - simplified like client side
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

  } catch (err) {
    if (handlerOptions.verbose) {
      handlerOptions.logger?.error(`[renderPage.server] Error: ${JSON.stringify(err)}`);
    }

    // Clean up any resources
    try {
      if (headlessRscHandler) headlessRscHandler.abort();
      if (fullRscHandler) fullRscHandler.abort();
      if (htmlTransformStream) htmlTransformStream.abort();
    } catch (cleanupError: unknown) {
      handlerOptions.logger?.warn(`Failed to cleanup streams on error: ${cleanupError}`);
    }

    const panicError = handleError({
      error: err,
      critical: false,
      logger: handlerOptions.logger,
      panicThreshold: handlerOptions.panicThreshold,
      context: `RenderPage Error (${handlerOptions.route})`,
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
        reason: err,
        html: {
          pipe: <Writable extends NodeJS.WritableStream>(destination: Writable) => {
            destination.end();
            return destination;
          },
          abort: () => {},
        },
        rsc: {
          pipe: <Writable extends NodeJS.WritableStream>(destination: Writable) => {
            destination.end();
            return destination;
          },
          abort: () => {},
        },
        metrics: {
          rscFull: rscFullMetrics,
          rscHeadless: rscHeadlessMetrics,
          html: htmlMetrics,
        },
      };
    }
  }
};