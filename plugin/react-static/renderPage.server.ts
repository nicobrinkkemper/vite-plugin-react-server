import { createRenderMetrics } from "../metrics/createRenderMetrics.js";
import { createStreamMetrics } from "../metrics/createStreamMetrics.js";
import { createModuleResolutionMetrics } from "../metrics/createModuleResolutionMetrics.js";
import { routeToURL } from "../utils/routeToURL.js";
import type { RenderPageFn } from "./types.js";
import { handleError } from "../error/handleError.js";
import { assertReactServer } from "../config/getCondition.js";
import { createRenderToPipeableStreamHandler } from "../stream/createRenderToPipeableStreamHandler.server.js";
import { createRscToHtmlStream } from "./rscToHtmlStream.server.js";
import { resolveComponent } from "../helpers/resolveComponent.js";
import { resolveProps } from "../helpers/resolveProps.js";
import { Root as DefaultRoot } from "../components/root.js";
import { Html as DefaultHtml } from "../components/html.js";
import { React } from "../vendor/vendor.server.js";
import { join } from "node:path";

assertReactServer();

// Note: This module works best in react-server condition, but will adapt to other conditions

export const renderPage: RenderPageFn = async function* _renderPageServer(
  handlerOptions
) {
  if (handlerOptions.verbose) {
    handlerOptions.logger?.info(
      `[renderPage.server] onEvent callback exists: ${!!handlerOptions.onEvent}`
    );
    handlerOptions.logger?.info(
      `[renderPage.server] onMetrics callback exists: ${!!handlerOptions.onMetrics}`
    );
  }
  const baseDir = join(
    handlerOptions.build.outDir,
    handlerOptions.build.static
  );
  const routePath = handlerOptions.route.replace(/^\//, "");
  const htmlMetrics = createRenderMetrics({
    route: handlerOptions.route,
    type: "html",
    fromMainThread: false,
    fromRscWorker: false,
    // in .server., we can assume that the html can't be rendered from main-thread,
    // so we can set fromMainThread to false and fromHtmlWorker to true
    fromHtmlWorker: true,
    baseDir,
    routePath,
    fileName: handlerOptions.build.htmlOutputPath,
    outputPath: join(baseDir, routePath, handlerOptions.build.htmlOutputPath),
  });
  const rscFullMetrics = createRenderMetrics({
    route: handlerOptions.route,
    type: "rsc-full",
    // the rsc can be rendered from main-thread, so we can set fromMainThread to true
    fromMainThread: true,
    fromRscWorker: false,
    fromHtmlWorker: false,
  });
  const rscHeadlessMetrics = createRenderMetrics({
    route: handlerOptions.route,
    type: "rsc-headless",
    // the rsc can be rendered from main-thread, so we can set fromMainThread to true
    // so the user can understand why and where it was rendered from
    fromMainThread: true,
    fromRscWorker: false,
    fromHtmlWorker: false,
    baseDir,
    routePath,
    fileName: handlerOptions.build.rscOutputPath,
    outputPath: join(baseDir, routePath, handlerOptions.build.rscOutputPath),
  });
  if (handlerOptions.verbose) {
    handlerOptions.logger?.info(
      `[renderPage] renderPage - route: ${handlerOptions.route}, rootPath: ${handlerOptions.rootPath}, htmlPath: ${handlerOptions.htmlPath}`
    );
    handlerOptions.logger?.info(
      `[renderPage] CSS files received: ${
        handlerOptions.cssFiles?.size ?? 0
      } files`
    );
  }
  // Skip if no pagePath AND no PageComponent provided (fallback case)
  if (!handlerOptions.pagePath && !handlerOptions.PageComponent) {
    yield {
      type: "skip",
      reason: "No pagePath and no PageComponent provided",
      html: {
        pipe: <Writable extends NodeJS.WritableStream>(
          destination: Writable
        ) => {
          // No HTML content for skipped routes
          destination.end();
          return destination;
        },
        abort: () => {
          // No cleanup needed
        },
      },
      rsc: {
        pipe: <Writable extends NodeJS.WritableStream>(
          destination: Writable
        ) => {
          // No RSC content for skipped routes
          destination.end();
          return destination;
        },
        abort: () => {
          // No cleanup needed
        },
      },
      metrics: {
        rscFull: rscFullMetrics,
        rscHeadless: rscHeadlessMetrics,
        html: htmlMetrics,
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

  // Declare variables outside try block so they can be accessed in catch block
  let fullRscHandler: any = null;
  let htmlTransformStream: any = null;

  try {
    if (handlerOptions.verbose) {
      handlerOptions.logger.info(
        `[renderPage] renderPage - route: ${handlerOptions.route}, rootPath: ${handlerOptions.rootPath}, htmlPath: ${handlerOptions.htmlPath}`
      );
    }

    // Get components from handler options (with fallbacks)
    let PageComponent =
      handlerOptions.PageComponent || handlerOptions.components?.Page;
    let pageProps = handlerOptions.pageProps || { url: handlerOptions.url };
    let RootComponent =
      handlerOptions.RootComponent || handlerOptions.components?.Root;
    let HtmlComponent =
      handlerOptions.HtmlComponent || handlerOptions.components?.Html;

    // Load components at runtime if not provided
    if (!PageComponent && handlerOptions.pagePath) {
      try {
        const pageResult = await resolveComponent({
          componentPath: handlerOptions.pagePath,
          exportName: handlerOptions.pageExportName,
          loader: handlerOptions.loader,
        });

        if (pageResult.type === "success") {
          PageComponent = pageResult.component as any;
        } else {
          handlerOptions.logger?.warn(
            `Failed to load Page component from ${handlerOptions.pagePath}: ${
              pageResult.error?.message || "Unknown error"
            }`
          );
        }
      } catch (error) {
        handlerOptions.logger?.warn(
          `Error loading Page component from ${handlerOptions.pagePath}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    // Load props at runtime if not provided
    if (
      handlerOptions.propsPath &&
      (!pageProps || Object.keys(pageProps).length === 1)
    ) {
      try {
        const propsResult = await resolveProps({
          id: handlerOptions.propsPath,
          url: handlerOptions.url,
          exportName: handlerOptions.propsExportName,
          loader: handlerOptions.loader,
        });

        if (propsResult.type === "success" && propsResult.module) {
          const resolvedProps =
            propsResult.module[
              handlerOptions.propsExportName as keyof typeof propsResult.module
            ];
          if (resolvedProps && typeof resolvedProps === "object") {
            pageProps = { ...pageProps, ...resolvedProps };
          }
        } else if (propsResult.type === "error") {
          handlerOptions.logger?.warn(
            `Failed to load props from ${handlerOptions.propsPath}: ${
              propsResult.error?.message || "Unknown error"
            }`
          );
        }
      } catch (error) {
        handlerOptions.logger?.warn(
          `Error loading props from ${handlerOptions.propsPath}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    // Load Root component at runtime if not provided
    if (!RootComponent && handlerOptions.rootPath) {
      try {
        const rootResult = await resolveComponent({
          componentPath: handlerOptions.rootPath,
          exportName: handlerOptions.rootExportName,
          loader: handlerOptions.loader,
        });

        if (rootResult.type === "success") {
          RootComponent = rootResult.component as any;
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

    // Load Html component at runtime if not provided
    if (!HtmlComponent && handlerOptions.htmlPath) {
      try {
        const htmlResult = await resolveComponent({
          componentPath: handlerOptions.htmlPath,
          exportName: handlerOptions.htmlExportName,
          loader: handlerOptions.loader,
        });

        if (htmlResult.type === "success") {
          HtmlComponent = htmlResult.component as any;
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

    // Use defaults if components are still not loaded
    if (!RootComponent) {
      RootComponent = DefaultRoot as any;
    }
    if (!HtmlComponent) {
      HtmlComponent = DefaultHtml as any;
    }

    if (handlerOptions.verbose) {
      const source =
        handlerOptions.PageComponent !== undefined
          ? "PageComponent"
          : handlerOptions.components?.Page !== undefined
          ? "components.Page"
          : "pagePath resolution";
      handlerOptions.logger.info(
        `[renderPage] Using Page component from ${source} for route: ${handlerOptions.route}`
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

    const newHandlerOptions = {
      ...handlerOptions,
      url: `${handlerOptions.url}`,
      route: `${handlerOptions.route}`,
      PageComponent: PageComponent,
      pageProps: pageProps,
      RootComponent: RootComponent,
      HtmlComponent: HtmlComponent,
    };
    if (!HtmlComponent) {
      throw new Error("HtmlComponent is required");
    }

    // Create a wrapper onEvent handler to catch panic errors
    let panicError: Error | null = null;
    const wrapperOnEvent = (event: any) => {
      if (event.type === "route.error" && event.data?.isPanic) {
        panicError = event.data.error;
        if (handlerOptions.verbose) {
          handlerOptions.logger?.error(
            `[renderPage.server] Panic error detected for route ${handlerOptions.route}: ${panicError?.message}`
          );
        }
      }
      // Call the original onEvent handler
      handlerOptions.onEvent?.(event);
    };

    // Start measuring module resolution time for RSC stream creation
    const moduleResolutionStartTime = performance.now();

    // Create headless RSC handler first (without HTML wrapper) - this will be reused
    let headlessRscHandler;
    let headlessStreamErrored = false;
    let headlessError: unknown = null;
    let headlessPanicError = false;

    try {
      headlessRscHandler = createRenderToPipeableStreamHandler({
        ...newHandlerOptions,
        HtmlComponent: React.Fragment, // Headless RSC - no HTML wrapper
        onEvent: (event) => {
          // Track if the headless stream had errors
          if (event.type === "route.error") {
            const originalError = event.data.error ?? new Error("Error in headless RSC stream");
            headlessStreamErrored = true;
            
            // If the worker has already marked this as a panic error, use it directly
            if (event.data.isPanic) {
              headlessError = originalError;
              headlessPanicError = true;
            } else {
              // Otherwise, use handleError to determine if this should be a panic error
              const panicError = handleError({
                error: originalError,
                critical: false,
                logger: handlerOptions.logger,
                panicThreshold: handlerOptions.panicThreshold,
                context: `Headless RSC stream error for route ${handlerOptions.route}`,
              });
              
              // Store either the panic error or the original error
              headlessError = panicError || originalError;
              headlessPanicError = !!panicError;
            }
            
            // Don't call wrapperOnEvent for errors - let the error be handled gracefully
          } else {
            wrapperOnEvent(event);
          }
        },
        signal: handlerOptions.signal,
      });
    } catch (error) {
      const panicError = handleError({
        error: error,
        critical: false,
        logger: handlerOptions.logger,
        panicThreshold: handlerOptions.panicThreshold,
        context: `RenderPage Error (${handlerOptions.route})`,
      });
      // If the original PageComponent fails during creation, mark as errored
      if (panicError != null) {
        throw panicError;
      } else {
        headlessStreamErrored = true;
        headlessError = error;
      }

      if (handlerOptions.verbose) {
        handlerOptions.logger?.warn(
          `[renderPage.server] Original PageComponent failed during creation for route ${handlerOptions.route}: ${error}`
        );
      }

      // Create a minimal headless handler with React.Fragment
      headlessRscHandler = createRenderToPipeableStreamHandler({
        ...newHandlerOptions,
        PageComponent: React.Fragment,
        HtmlComponent: React.Fragment,
        onEvent: wrapperOnEvent,
        signal: handlerOptions.signal,
      });
    }

    // Module resolution is complete when the RSC stream is created
    const moduleResolutionTime = performance.now() - moduleResolutionStartTime;
    if (handlerOptions.onMetrics) {
      const moduleResolutionMetric = createModuleResolutionMetrics({
        route: handlerOptions.route,
        workerType: "rsc", // RSC is created on main thread in server builds
        resolutionTime: moduleResolutionTime,
        fromMainThread: true,
        fromRscWorker: false,
        fromHtmlWorker: false,
        description: `Module resolution for RSC stream creation on main thread for route ${handlerOptions.route}`,
      });
      handlerOptions.onMetrics(moduleResolutionMetric);
    }

    // Create full RSC handler using a conditional PageComponent
    const fullRscHandler = createRenderToPipeableStreamHandler({
      ...newHandlerOptions,
      PageComponent: (() => {
        // If the headless stream had errors, return null (no page content)
        // We'll handle panic errors at the generator level instead
        if (headlessStreamErrored) {
          return null;
        }
        return headlessRscHandler.elements;
      }) as any,
      onEvent: wrapperOnEvent,
      signal: handlerOptions.signal,
    });

    // Create the RSC-to-HTML transform stream for HTML generation
    htmlTransformStream = createRscToHtmlStream({
      id: handlerOptions.id, // Use the unique ID from handler options
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
      htmlTimeout: handlerOptions.htmlTimeout,
      rscStream: fullRscHandler.rscStream,
    });

    // Create stream wrappers that use the handlers
    const rscStreamWrapper = {
      pipe: <Writable extends NodeJS.WritableStream>(destination: Writable) => {
        // Use the headless RSC handler that was already created for stream reuse
        const rscHandlerForFile = headlessRscHandler;

        // Collect metrics from the RSC stream as it flows
        const streamMetrics = createStreamMetrics();
        streamMetrics.startTime = performance.now();

        rscHandlerForFile.rscStream.on("data", (chunk: Buffer) => {
          streamMetrics.chunks++;
          streamMetrics.bytes += chunk.length;
          
          // Check for React errors in the RSC stream
          const chunkStr = chunk.toString();
          if (chunkStr.includes('"name":"Error"') && chunkStr.includes('"env":"Server"')) {
            // This looks like a React error serialized in the RSC stream
            headlessStreamErrored = true;
            
            // Extract the error message from the RSC stream
            try {
              const errorMatch = chunkStr.match(/"message":"([^"]*)"/)
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

        rscHandlerForFile.rscStream.once("end", () => {
          streamMetrics.duration = performance.now() - streamMetrics.startTime;
          streamMetrics.endTime = performance.now();

          // Update the metrics object
          rscHeadlessMetrics.streamMetrics = streamMetrics;
          rscHeadlessMetrics.chunkRate =
            streamMetrics.chunks / (streamMetrics.duration / 1000);
          rscHeadlessMetrics.processingTime = streamMetrics.duration;
          rscHeadlessMetrics.memoryUsage = process.memoryUsage();
          rscHeadlessMetrics.chunks = streamMetrics.chunks;

          // End the destination when the RSC stream ends
          if (handlerOptions.verbose) {
            handlerOptions.logger?.info(
              `[renderPage.server] Ending RSC destination stream for route: ${handlerOptions.route}`
            );
          }
          (destination as any).end();

          // Clean up listeners after everything is done
          rscHandlerForFile.rscStream.removeAllListeners();
        });

        // Pipe the RSC handler to the destination (file writer)
        rscHandlerForFile.pipe(destination);

        return destination;
      },
      abort: () => {
        fullRscHandler.abort();
      },
    };

    const htmlStreamWrapper = {
      pipe: <Writable extends NodeJS.WritableStream>(destination: Writable) => {
        // Collect metrics from the full RSC stream as it flows
        const streamMetrics = createStreamMetrics();
        streamMetrics.startTime = performance.now();

        fullRscHandler.rscStream.on("data", (chunk: Buffer) => {
          streamMetrics.chunks++;
          streamMetrics.bytes += chunk.length;
        });

        fullRscHandler.rscStream.once("end", () => {
          streamMetrics.duration = performance.now() - streamMetrics.startTime;
          streamMetrics.endTime = performance.now();

          // Update the metrics object
          rscFullMetrics.streamMetrics = streamMetrics;
          rscFullMetrics.chunkRate =
            streamMetrics.chunks / (streamMetrics.duration / 1000);
          rscFullMetrics.processingTime = streamMetrics.duration;
          rscFullMetrics.memoryUsage = process.memoryUsage();
          rscFullMetrics.chunks = streamMetrics.chunks;

          // Clean up listeners after metrics are collected
          fullRscHandler.rscStream.removeAllListeners();
        });

        // Use the HTML transform stream's pipe method directly
        htmlTransformStream.pipe(destination);

        return destination;
      },
      abort: () => {
        fullRscHandler.abort();
        htmlTransformStream.abort();
      },
    };

    // Don't emit initial metrics - wait for file writes to complete
    // The onMetrics callback will be called after both file.write.done events

    // Check if there was a panic error from the headless stream
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
    } else {
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
    }
  } catch (err) {
    if (handlerOptions.verbose) {
      handlerOptions.logger.error(`[renderPage] Error: ${JSON.stringify(err)}`);
    }

    // Clean up any resources that might have been created
    try {
      // Ensure any streams are properly closed
      if (fullRscHandler) {
        fullRscHandler.abort();
      }
      if (htmlTransformStream) {
        htmlTransformStream.abort();
      }
    } catch (cleanupError: unknown) {
      handlerOptions.logger?.warn(
        `Failed to cleanup streams on error: ${cleanupError}`
      );
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
          pipe: <Writable extends NodeJS.WritableStream>(
            destination: Writable
          ) => {
            // No HTML content for skipped routes
            destination.end();
            return destination;
          },
          abort: () => {
            // No cleanup needed
          },
        },
        rsc: {
          pipe: <Writable extends NodeJS.WritableStream>(
            destination: Writable
          ) => {
            // No RSC content for skipped routes
            destination.end();
            return destination;
          },
          abort: () => {
            // No cleanup needed
          },
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
