import { createElementWithReact } from "../helpers/createElementWithReact.js";
import { React, ReactDOMServer } from "../vendor/vendor.server.js";
import { assertReactServer } from "../config/getCondition.js";
import { handleError } from "../error/handleError.js";
import { createStreamMetrics } from "../helpers/metrics.js";
import type { CreateRenderToPipeableStreamHandlerFn } from "./createRenderToPipeableStreamHandler.types.js";

import { PassThrough } from "node:stream";

assertReactServer();

/**
 * Creates an RSC stream from React elements using ReactDOMServer.renderToPipeableStream.
 *
 * **Purpose**: Converts React elements to React Server Components (RSC) format for server-side rendering.
 * **When to use**:
 * - You have React elements and need to create RSC streams
 * - You're in a server environment (Node.js server or server-side worker)
 * - You need to create .rsc files or serve RSC content
 * - You want to serialize React components for client-side hydration
 *
 * **Flow**: React Elements → RSC Stream
 *
 * @example
 * ```typescript
 * // Create RSC stream from React elements
 * const rscHandler = createRenderToPipeableStreamHandler({
 *   route: "/about",
 *   PageComponent: AboutPage,
 *   RootComponent: RootLayout,
 *   HtmlComponent: HtmlDocument,
 *   pageProps: { title: "About Us" },
 *   logger: myLogger,
 * });
 *
 * // Pipe to file or response
 * rscHandler.pipe(fileStream);
 * ```
 *
 * @example
 * ```typescript
 * // Create headless RSC (no HTML wrapper)
 * const rscHeadless = createRenderToPipeableStreamHandler({
 *   route: "/about",
 *   PageComponent: AboutPage,
 *   HtmlComponent: React.Fragment, // No HTML wrapper
 *   pageProps: { title: "About Us" },
 * });
 * ```
 *
 * @param handlerOptions - Options for RSC stream creation
 * @returns RSC stream with pipe/abort interface
 */
export const createRenderToPipeableStreamHandler: CreateRenderToPipeableStreamHandlerFn<"server"> =
  function _createRscStreamHandler(handlerOptions) {
    const {
      route,
      logger,
      verbose = false,
      panicThreshold = "none",
      rscStream,
      serverPipeableStreamOptions = {},
      // Component resolution options
      PageComponent,
      RootComponent,
      HtmlComponent,
      pageProps,
      // CSS options
      cssFiles = new Map(),
      globalCss = new Map(),
      // Stream reuse options
      reuseHeadlessStreamId,
      headlessStreamElements,
    } = handlerOptions;

    // Type assertion for headlessStreamElements
    const streamElements = headlessStreamElements as Map<string, { PageComponent: any; errored: boolean }> | undefined;

    if (verbose) {
      logger?.info(`[createRscStream:${route}] Starting RSC stream creation`);
    }

    try {
      // Check if we should reuse a Page component from a headless stream
      let finalPageComponent = PageComponent;
      if (reuseHeadlessStreamId && streamElements?.has(reuseHeadlessStreamId)) {
        const reusableData = streamElements.get(reuseHeadlessStreamId);
        if (reusableData && !reusableData.errored) {
          finalPageComponent = reusableData.PageComponent;
          if (verbose) {
            logger?.info(`[createRscStream:${route}] Reusing Page component from headless stream ${reuseHeadlessStreamId}`);
          }
        }
      }

      // Create React element from components and props
      const children =
        "children" in handlerOptions
          ? handlerOptions.children
          : createElementWithReact(React, {
              ...handlerOptions,
              url: handlerOptions.url,
              moduleBase: handlerOptions.moduleBase || "",
              manifest: handlerOptions.manifest || {},
              projectRoot: handlerOptions.projectRoot || process.cwd(),
              PageComponent: finalPageComponent || React.Fragment,
              RootComponent: RootComponent || React.Fragment,
              HtmlComponent: HtmlComponent || React.Fragment,
              pageProps,
              cssFiles,
              globalCss,
            });

      if (verbose) {
        logger?.info(
          `[createRscStream:${route}] Created React element, starting RSC rendering`
        );
      }

      // Configure pipeable stream options for RSC
      const pipeableStreamOptions = {
        ...serverPipeableStreamOptions,

        onError(error: unknown) {
          if (verbose) {
            logger?.error(
              `[createRscStream:${route}] onError called with error: ${error instanceof Error ? error.message : String(error)}`
            );
          }

          // Handle error according to panic threshold
          const panicError = handleError({
            error: error,
            logger: logger,
            panicThreshold: panicThreshold,
            context: `RSC stream onError for route ${route}`,
          });

          if (panicError != null) {
            // This is a panic threshold error, emit event to notify parent
            handlerOptions.onEvent?.({
              type: "route.error",
              data: {
                route: route,
                error: panicError,
                isPanic: true,
                panicThreshold: panicThreshold,
              },
            });
          } else {
            // For non-panic errors, just log and send event
            handlerOptions.onEvent?.({
              type: "route.error",
              data: {
                route: route,
                error: error,
              },
            });
          }

          // Call the original onError handler if it exists
          serverPipeableStreamOptions.onError?.(error);
        },
        onShellError(error: unknown) {
          if (verbose) {
            logger?.error(
              `[createRscStream:${route}] onShellError called with error: ${error instanceof Error ? error.message : String(error)}`
            );
          }

          // Handle shell error according to panic threshold
          const panicError = handleError({
            error: error,
            logger: logger,
            panicThreshold: panicThreshold,
            context: `RSC stream onShellError for route ${route}`,
          });

          if (panicError != null) {
            // This is a panic threshold error, emit event to notify parent
            handlerOptions.onEvent?.({
              type: "route.error",
              data: {
                route: route,
                error: panicError,
                isPanic: true,
                panicThreshold: panicThreshold,
              },
            });
          } else {
            // For non-panic errors, just log and send event
            handlerOptions.onEvent?.({
              type: "route.error",
              data: {
                route: route,
                error: error,
              },
            });
          }

          (serverPipeableStreamOptions as any).onShellError?.(error);
        },
      };

      // Create the pipeable stream
      let result: any;
      
      // Get children from either provided children or loaded PageComponent
      let finalChildren = children;

      try {
        
        if (!finalChildren && handlerOptions.PageComponent) {
          // Create React element from the loaded PageComponent
          finalChildren = React.createElement(handlerOptions.PageComponent);
          if (verbose) {
            logger?.info(
              `[createRscStream:${route}] Using loaded PageComponent for rendering`
            );
          }
        }
        
        if (!finalChildren) {
          throw new Error(
            `[createRscStream:${route}] No children or elements provided for RSC rendering, and no PageComponent loaded`
          );
        }

        const element = React.isValidElement(finalChildren)
          ? finalChildren
          : typeof finalChildren === "function"
          ? React.createElement(finalChildren)
          : typeof finalChildren === "string"
          ? React.createElement(React.Fragment, {}, finalChildren)
          : typeof finalChildren === "number" || typeof finalChildren === "bigint" || typeof finalChildren === "boolean"
          ? React.createElement(React.Fragment, {}, finalChildren)
          : React.createElement(React.Fragment, {}, finalChildren);

        if (verbose) {
          logger?.info(
            `[createRscStream:${route}] RSC rendering started successfully`
          );
        }

        result = ReactDOMServer.renderToPipeableStream(
          element,
          handlerOptions.moduleBasePath || "",
          pipeableStreamOptions
        );
      } catch (error) {
        if (verbose) {
          logger?.error(
            `[createRscStream:${route}] Synchronous error from React rendering: ${error}`
          );
        }

        const panicError = handleError({
          error: error,
          logger: logger,
          panicThreshold: panicThreshold,
          context: `RSC stream synchronous React error for route ${route}`,
        });

        if (panicError != null) {
          handlerOptions.onEvent?.({
            type: "route.error",
            data: {
              route: route,
              error: panicError,
              isPanic: true,
            },
          });
        }

        throw error;
      }

      // Validate the result
      if (
        typeof result !== "object" ||
        typeof result.pipe !== "function" ||
        typeof result.abort !== "function"
      ) {
        throw new Error(
          `[createRscStream:${route}] Invalid result from ReactDOMServer.renderToPipeableStream`
        );
      }

      if (verbose) {
        logger?.info(
          `[createRscStream:${route}] Result type: ${typeof result}, has pipe: ${typeof result?.pipe}, has abort: ${typeof result?.abort}`
        );
      }

      // Use provided RSC stream or create a new pass through stream
      const passThrough = rscStream || new PassThrough();

      // Pipe the React stream to our pass through
      result.pipe(passThrough);

      // The PipeableStream from React doesn't have 'on' methods, so we rely on natural completion
      // The stream will end when all data is written to the destination
      if (verbose) {
        logger?.info(
          `[createRscStream:${route}] Using PipeableStream, relying on natural completion`
        );
      }

      return {
        type: "server" as const,
        pipe: <Writable extends NodeJS.WritableStream>(
          destination: Writable
        ) => {
          passThrough.pipe(destination);
          return destination;
        },
        abort: (reason?: unknown) => {
          result.abort(new Error(String(reason || "Aborted RSC stream")));
          passThrough.destroy(
            new Error(String(reason || "Aborted RSC stream"))
          );
        },
        cleanup: () => {
          // Clean up listeners on the RSC stream
          passThrough.removeAllListeners();
        },
        rscStream: passThrough as PassThrough,
        elements: finalChildren,
        metrics: createStreamMetrics(), // Provide empty metrics object
      };
    } catch (error) {
      if (verbose) {
        logger?.error(
          `[createRscStream:${route}] Error in RSC stream creation: ${error}`
        );
      }

      const panicError = handleError({
        error: error,
        logger: logger,
        panicThreshold: panicThreshold,
        context: `RSC stream creation error for route ${route}`,
      });

      if (panicError != null) {
        handlerOptions.onEvent?.({
          type: "route.error",
          data: {
            route: route,
            error: panicError,
            isPanic: true,
          },
        });
      }

      throw error;
    }
  };
