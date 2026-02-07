import { createRenderToPipeableStreamHandler } from "./createRenderToPipeableStreamHandler.server.js";
import type {
  CreateRscStreamFn,
  ServerRscStreamResult,
} from "./createRscStream.types.js";
import { assertReactServer } from "../config/getCondition.js";
import {
  validateRscStreamOptions,
  createBaseRscStreamResult,
  handleRscStreamError,
} from "./createRscStream.utils.js";

import { createStreamMetrics } from "../metrics/createStreamMetrics.js";
import { createRscWorkerStream } from "./createRscWorkerStream.js";

assertReactServer();

/**
 * Creates an RSC stream using the server-side render handler.
 *
 * **Purpose**: Creates RSC streams directly in the server environment without worker threads.
 * **When to use**:
 * - You're in a server environment (Node.js server)
 * - You want to create RSC streams synchronously without worker overhead
 * - You need RSC streams for server-side rendering or API responses
 * - You're in a development server and want direct RSC generation
 *
 * **Flow**: Route + Components → RSC Stream (direct server rendering)
 *
 * @example
 * ```typescript
 * // Create RSC stream for server-side rendering
 * const rscStream = createRscStream({
 *   route: "/api/data",
 *   PageComponent: DataPage,
 *   RootComponent: RootLayout,
 *   HtmlComponent: React.Fragment, // Headless for API
 *   pageProps: { data: apiData },
 *   logger: myLogger,
 * });
 *
 * // Pipe to response
 * rscStream.pipe(response);
 * ```
 *
 * @example
 * ```typescript
 * // Create full RSC with HTML wrapper
 * const rscFull = createRscStream({
 *   route: "/about",
 *   PageComponent: AboutPage,
 *   RootComponent: RootLayout,
 *   HtmlComponent: HtmlDocument, // Full HTML wrapper
 *   pageProps: { title: "About Us" },
 * });
 * ```
 *
 * @param options - Options for RSC stream creation
 * @returns RSC stream with pipe/abort interface
 */
export const createRscStream: CreateRscStreamFn<"server"> =
  function _createRscStreamServer(options) {
    const logger = options.logger;
    const verbose = options.verbose || false;

    // Validate common options
    validateRscStreamOptions(options, "createRscStream.server");

    if (verbose) {
      logger?.info(
        `[createRscStream.server:${options.route}] Creating RSC stream for route: ${options.route}`
      );
    }

    try {
      // If worker is provided, use worker-based RSC stream
      // note: don't use the main "worker" prop here, which is always the inverse worker (html-worker in server case)
      if (verbose) {
        logger?.info(`[createRscStream.server:${options.route}] Checking for rscWorker: ${!!options.rscWorker}`);
      }
      if (options.rscWorker) {
        if (verbose) {
          logger?.info(
            `[createRscStream.server:${options.route}] Using worker-based RSC stream`
          );
        }

        const workerStreamResult = createRscWorkerStream({
          worker: options.rscWorker,
          route: options.route,
          url: options.url,
          moduleBasePath: options.moduleBasePath,
          moduleBaseURL: options.moduleBaseURL,
          moduleRootPath: options.moduleRootPath,
          projectRoot: options.projectRoot,
          verbose,
          logger,
          panicThreshold: options.panicThreshold,
          rscTimeout: options.rscTimeout,
          serverPipeableStreamOptions: options.serverPipeableStreamOptions,
          build: options.build,
          pagePath: options.pagePath,
          propsPath: options.propsPath,
          rootPath: options.rootPath,
          htmlPath: options.htmlPath,
        });

        const { stream: workerStream, dataPort1, controlPort1 } = workerStreamResult;

        // Return worker stream with consistent interface
        const serverResult: ServerRscStreamResult = {
          type: "server" as const,
          rscStream: workerStream,
          id: options.id || options.route,
          pipe: <Writable extends NodeJS.WritableStream>(
            destination: Writable
          ) => {
            workerStream.pipe(destination);
            return destination;
          },
          abort: () => {
            try {
              workerStream.destroy();
            } catch (error) {
              // Stream may already be destroyed, ignore
            }
            // Clean up MessagePort listeners to prevent memory leaks
            try {
              // Remove onmessage handlers (property assignment cleanup)
              dataPort1.onmessage = null;
              controlPort1.onmessage = null;
              // Close MessagePorts
              dataPort1.close();
              controlPort1.close();
            } catch (error) {
              // Ignore cleanup errors
            }
          },
          metrics: createStreamMetrics(), // Worker will provide real metrics
        };

        return serverResult;
      }

      // Otherwise, use direct server rendering
      const result = createRenderToPipeableStreamHandler(options);

      // Validate the result
      if (!result || typeof result.pipe !== "function") {
        throw new Error(
          "createHandler returned invalid result - missing pipe function"
        );
      }

      if (!result.rscStream) {
        throw new Error(
          "createHandler returned invalid result - missing stream"
        );
      }

      // Create base result structure
      const baseResult = createBaseRscStreamResult(
        result.rscStream,
        result.pipe,
        result.abort,
        result.metrics,
        options.id || options.route
      );

      // Return server-specific results
      const serverResult: ServerRscStreamResult = {
        ...baseResult,
        type: "server" as const,
      };

      if (verbose) {
        logger?.info(
          `[createRscStream.server:${options.route}] RSC stream created successfully`
        );
      }

      return serverResult;
    } catch (error) {
      handleRscStreamError(error, options, "RSC stream creation error");
      // This will never be reached as handleRscStreamError either throws or re-throws
      throw error;
    }
  };
