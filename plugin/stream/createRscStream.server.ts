import { createRenderToPipeableStreamHandler } from "./createRenderToPipeableStreamHandler.server.js";
import type { CreateRscStreamFn, ServerRscStreamResult } from "./createRscStream.types.js";
import { assertReactServer } from "../config/getCondition.js";
import {
  validateRscStreamOptions,
  createBaseRscStreamResult,
  handleRscStreamError,
} from "./createRscStream.utils.js";

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
export const createRscStream: CreateRscStreamFn<"server"> = function _createRscStreamServer(
  options
) {
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
    const result = createRenderToPipeableStreamHandler(options);

    // Validate the result
    if (!result || typeof result.pipe !== "function") {
      throw new Error(
        "createHandler returned invalid result - missing pipe function"
      );
    }

    if (!result.rscStream) {
      throw new Error("createHandler returned invalid result - missing stream");
    }


    // Create base result structure
    const baseResult = createBaseRscStreamResult(
      result.rscStream,
      result.pipe,
      result.abort,
      result.metrics
    );

    // Return server-specific result
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
