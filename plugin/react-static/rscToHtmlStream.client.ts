/**
 * rscToHtmlStream.client.ts
 *
 * PURPOSE: Transforms RSC stream to HTML stream in main thread (no worker)
 * 
 * This follows the exact same pattern as server-side rscToHtmlStream.server.ts
 * but processes RSC chunks directly in main thread instead of using worker messages.
 * 
 * Server-side pattern: RSC chunks → Worker messages → HTML chunks
 * Client-side pattern: RSC chunks → Direct processing → HTML chunks
 */
import { Transform, PassThrough, Readable } from "node:stream";
import { createFromNodeStream } from "../stream/createFromNodeStream.client.js";
import { ReactDOMServer } from "../vendor/vendor.client.js";

export interface RscToHtmlStreamOptions {
  route: string;
  moduleRootPath?: string;
  moduleBasePath?: string;
  moduleBaseURL?: string;
  projectRoot?: string;
  verbose?: boolean;
  panicThreshold?: "none" | "critical_errors" | "all_errors" | number;
  url?: string;
  serverPipeableStreamOptions?: any;
  signal?: AbortSignal;
  logger?: any;
  [key: string]: any;
}

export type RscToHtmlStreamFn = (options: RscToHtmlStreamOptions) => Transform;

/**
 * Creates a transform stream that converts RSC chunks to HTML chunks
 * This mirrors the server-side worker approach but runs in main thread
 */
export const createRscToHtmlStream: RscToHtmlStreamFn = (options) => {
  const { 
    route, 
    verbose, 
    logger
  } = options;

  if (verbose) {
    logger?.info(
      `[createRscToHtmlStream:${route}] Creating RSC to HTML transform stream (main thread)`
    );
  }

  let rscBuffer = Buffer.alloc(0);

  // Create transform stream that processes RSC chunks individually
  const transformStream = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      try {
        // Accumulate RSC chunks (same as server-side RSC_CHUNK processing)
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
        
        // Process the complete RSC buffer to HTML (equivalent to RSC_END processing)
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



          // Create a readable stream from the RSC buffer (same as HTML worker)
          const rscStream = new Readable();
          rscStream.push(rscBuffer);
          rscStream.push(null); // End the stream

          // Convert RSC stream to React elements using createFromNodeStream (same as HTML worker)
          const { children } = createFromNodeStream({
            rscStream: rscStream as any,
            moduleRootPath: options.moduleRootPath || "",
            moduleBasePath: options.moduleBasePath || "",
            moduleBaseURL: options.moduleBaseURL || "",
            logger,
          });

          if (verbose) {
            logger?.info(
              `[createRscToHtmlStream:${route}] Converted RSC to React elements, starting HTML rendering`
            );
          }

          // Render React elements to HTML using ReactDOMServer.renderToPipeableStream (same as HTML worker)
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
          let htmlChunks: Buffer[] = [];
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
          throw error;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger?.error(
          `[createRscToHtmlStream:${route}] Error in flush: ${errorMessage}`
        );
        callback(error instanceof Error ? error : new Error(String(error)));
      }
    }
  });

  // Handle abort signal (same as server-side)
  const signal = options.signal;
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