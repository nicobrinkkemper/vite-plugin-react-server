/**
 * rscToHtmlStream.client.ts
 *
 * PURPOSE: Transforms RSC stream to HTML stream in main thread
 * 
 * This follows the same pattern as server-side but processes RSC chunks directly
 * instead of using worker messages:
 * 
 * Server-side pattern: RSC chunks → Worker messages → HTML chunks
 * Client-side pattern: RSC chunks → Direct processing → HTML chunks
 */
import { Transform, Readable, PassThrough } from "node:stream";
import { createFromNodeStream } from "../stream/createFromNodeStream.client.js";
import { ReactDOMServer } from "../vendor/vendor.client.js";
import { handleError } from "../error/handleError.js";
import type { PanicThreshold } from "../types.js";

export interface RscToHtmlStreamOptions {
  route: string;
  moduleRootPath?: string;
  moduleBasePath?: string;
  moduleBaseURL?: string;
  projectRoot?: string;
  verbose?: boolean;
  panicThreshold?: PanicThreshold;
  url?: string;
  serverPipeableStreamOptions?: any;
  signal?: AbortSignal;
  logger?: any;
  htmlTimeout?: number;
  // CSS information is embedded in the RSC stream, not passed as parameters
  // cssFiles?: Map<string, any>;
  // globalCss?: Map<string, any>;
}

export type RscToHtmlStreamFn = (options: RscToHtmlStreamOptions) => Transform;

/**
 * Creates a transform stream that converts RSC chunks to HTML chunks
 * This processes RSC chunks directly in the main thread
 */
export const createRscToHtmlStream: RscToHtmlStreamFn = (options) => {
  const {
    route,
    moduleRootPath,
    moduleBasePath,
    moduleBaseURL,
    verbose,
    panicThreshold,
    signal,
    logger,
  } = options;

  if (verbose) {
    logger?.info(
      `[createRscToHtmlStream:${route}] Creating RSC to HTML transform stream (client-side)`
    );
  }

  let rscBuffer = Buffer.alloc(0);

  // Create transform stream that processes RSC chunks and outputs HTML
  const transformStream = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      try {
        // Accumulate RSC chunks
        rscBuffer = Buffer.concat([rscBuffer, chunk]);
        
        if (verbose) {
          logger?.info(
            `[createRscToHtmlStream:${route}] Received RSC chunk: ${chunk.length} bytes, total: ${rscBuffer.length} bytes`
          );
        }
        
        callback();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger?.error(
          `[createRscToHtmlStream:${route}] Error processing RSC chunk: ${errorMessage}`
        );
        callback(error instanceof Error ? error : new Error(String(error)));
      }
    },

    flush(callback) {
      try {
        if (verbose) {
          logger?.info(
            `[createRscToHtmlStream:${route}] Processing final RSC buffer: ${rscBuffer.length} bytes`
          );
        }
        
        // Process the complete RSC buffer to HTML
        if (rscBuffer.length === 0) {
          if (verbose) {
            logger?.info(`[createRscToHtmlStream:${route}] No RSC data to process`);
          }
          callback();
          return;
        }

        // Convert RSC buffer to HTML using the same approach as HTML worker
        try {
          if (verbose) {
            logger?.info(
              `[createRscToHtmlStream:${route}] Converting RSC buffer to HTML using createFromNodeStream`
            );
          }

          // Create a readable stream from the RSC buffer
          const rscStream = new Readable();
          rscStream.push(rscBuffer);
          rscStream.push(null); // End the stream

          // Convert RSC stream to React elements using createFromNodeStream
          const { children } = createFromNodeStream({
            rscStream: rscStream,
            moduleRootPath: moduleRootPath || "",
            moduleBasePath: moduleBasePath || "",
            moduleBaseURL: moduleBaseURL || "/",
            logger,
          });

          if (verbose) {
            logger?.info(
              `[createRscToHtmlStream:${route}] Converted RSC to React elements, starting HTML rendering`
            );
          }

          // Render React elements to HTML using ReactDOMServer.renderToPipeableStream
          const { pipe } = ReactDOMServer.renderToPipeableStream(
            children,
            {
              bootstrapModules: options.serverPipeableStreamOptions?.bootstrapModules || [],
              onAllReady: () => {
                if (verbose) {
                  logger?.info(`[createRscToHtmlStream:${route}] All ready`);
                }
              },
              onError: (error: unknown) => {
                if (verbose) {
                  logger?.info(`[createRscToHtmlStream:${route}] React stream onError: ${error}`);
                }
                throw error;
              },
              onShellReady: () => {
                if (verbose) {
                  logger?.info(`[createRscToHtmlStream:${route}] Shell ready`);
                }
              },
            }
          );

          // Collect HTML chunks from the React stream
          const htmlChunks: Buffer[] = [];
          const htmlStream = new PassThrough();
          
          htmlStream.on('data', (chunk: Buffer) => {
            htmlChunks.push(chunk);
          });

          htmlStream.on('end', () => {
            // Concatenate all HTML chunks
            const htmlContent = Buffer.concat(htmlChunks);
            
            if (verbose) {
              logger?.info(
                `[createRscToHtmlStream:${route}] Generated HTML content: ${htmlContent.length} bytes`
              );
            }

            // Push the HTML content to the transform stream
            // CSS information is already embedded in the RSC stream and will be included in the HTML
            transformStream.push(htmlContent);
            
            if (verbose) {
              logger?.info(
                `[createRscToHtmlStream:${route}] Pushed ${htmlContent.length} bytes of HTML content to transform stream`
              );
            }
            
            // Call callback after HTML processing is complete
            callback();
          });

          // Pipe the React stream to our HTML stream
          pipe(htmlStream);

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger?.error(
            `[createRscToHtmlStream:${route}] Error processing RSC to HTML: ${errorMessage}`
          );
          
          // Handle error according to panic threshold
          const panicError = handleError({
            error: error instanceof Error ? error : new Error(String(error)),
            logger: logger,
            panicThreshold: typeof panicThreshold === 'string' ? panicThreshold : 'critical_errors',
            context: `RSC to HTML stream error for route ${route}`,
          });
          
          if (panicError != null) {
            if (verbose) {
              logger?.info(`[createRscToHtmlStream:${route}] Panic threshold error, destroying stream with error: ${panicError.message}`);
            }
            transformStream.destroy(panicError);
            if (signal != null) {
              signal.throwIfAborted();
            }
          } else {
            // Non-panic error, just log it and end stream gracefully
            if (verbose) {
              logger?.warn(
                `[createRscToHtmlStream:${route}] Non-panic error: ${errorMessage}`
              );
            }
            // Push an empty buffer and end the stream gracefully
            transformStream.push(Buffer.from(''));
            callback();
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger?.error(
          `[createRscToHtmlStream:${route}] Error in flush: ${errorMessage}`
        );
        // Push an empty buffer and end the stream gracefully instead of calling callback with error
        transformStream.push(Buffer.from(''));
        callback();
      }
    }
  });

  // Handle abort signal
  if (signal) {
    const abortHandler = () => {
      if (verbose) {
        logger?.info(`[createRscToHtmlStream:${route}] Abort signal received`);
      }
      transformStream.destroy(signal.reason || new Error("Aborted rsc to html stream"));
    };

    signal.addEventListener("abort", abortHandler);

    // Clean up abort handler when stream ends
    transformStream.on("end", () => {
      signal.removeEventListener("abort", abortHandler);
    });
  }

  return transformStream;
};