/**
 * createBufferedRscStream.ts
 * 
 * PURPOSE: Creates a buffered RSC stream factory that can generate multiple readable streams
 * 
 * PROBLEM: Node.js streams can only be consumed once, but in client-side static generation
 * we need to consume the RSC stream twice:
 * 1. Write RSC content to index.rsc file
 * 2. Transform RSC content to HTML for index.html file
 * 
 * SOLUTION: Buffer all RSC chunks and create a factory that can generate multiple
 * readable streams from the same buffered data.
 * 
 * USAGE:
 * ```typescript
 * const bufferedStreamFactory = createBufferedRscStream(rscStream, {
 *   route: "/",
 *   logger: myLogger,
 *   verbose: true
 * });
 * 
 * // Create separate streams for each consumer
 * const rscStream = bufferedStreamFactory.createStream();
 * const htmlStream = bufferedStreamFactory.createStream();
 * 
 * // Can be piped to different destinations
 * rscStream.pipe(rscFileWriter);
 * htmlStream.pipe(htmlTransform);
 * ```
 */

import { Readable } from "node:stream";

export interface BufferedRscStreamOptions {
  route: string;
  logger?: any;
  verbose?: boolean;
}

export interface BufferedRscStreamFactory {
  createStream(): Readable;
  getBufferInfo(): { chunks: number; bytes: number };
}

/**
 * Creates a buffered RSC stream factory that can generate multiple readable streams
 * 
 * @param rscStream - The original RSC stream from the worker
 * @param options - Configuration options
 * @returns A factory that can create multiple readable streams from the same buffered data
 */
export function createBufferedRscStream(
  rscStream: Readable,
  options: BufferedRscStreamOptions
): BufferedRscStreamFactory {
  const { route, logger, verbose = false } = options;
  
  if (verbose) {
    logger?.info(
      `[createBufferedRscStream:${route}] Creating buffered RSC stream factory for dual consumption`
    );
  }

  // Buffer to store all RSC chunks
  const rscBuffer: Buffer[] = [];
  let totalBytes = 0;
  let isStreamEnded = false;
  let hasError = false;
  let error: Error | null = null;
  let consumers: Readable[] = [];

  // Collect all RSC chunks into buffer
  rscStream.on("data", (chunk: Buffer) => {
    if (hasError) return; // Don't buffer if there was an error
    
    rscBuffer.push(chunk);
    totalBytes += chunk.length;
    
    if (verbose) {
      logger?.info(
        `[createBufferedRscStream:${route}] Buffered chunk: ${chunk.length} bytes, total: ${totalBytes} bytes`
      );
    }

    // Push the chunk to all existing consumers immediately
    for (const consumer of consumers) {
      if (!consumer.destroyed) {
        consumer.push(chunk);
      }
    }
  });

  rscStream.on("end", () => {
    isStreamEnded = true;
    if (verbose) {
      logger?.info(
        `[createBufferedRscStream:${route}] RSC stream ended, buffered ${rscBuffer.length} chunks (${totalBytes} bytes)`
      );
    }

    // End all consumers
    for (const consumer of consumers) {
      if (!consumer.destroyed) {
        consumer.push(null);
      }
    }
  });

  rscStream.on("error", (streamError: Error) => {
    hasError = true;
    error = streamError;
    if (verbose) {
      logger?.error(
        `[createBufferedRscStream:${route}] RSC stream error: ${streamError.message}`
      );
    }

    // Emit error on all consumers
    for (const consumer of consumers) {
      if (!consumer.destroyed) {
        consumer.emit("error", streamError);
      }
    }
  });

  return {
    createStream(): Readable {
      if (hasError && error) {
        // If there was an error, create a stream that immediately emits the error
        const errorStream = new Readable();
        setImmediate(() => {
          errorStream.emit("error", error);
        });
        return errorStream;
      }

      const consumer = new Readable({
        read() {
          if (verbose) {
            logger?.info(
              `[createBufferedRscStream:${route}] Read requested, buffered chunks: ${rscBuffer.length}, isStreamEnded: ${isStreamEnded}`
            );
          }

          // If the stream has already ended, push all remaining buffered content
          if (isStreamEnded) {
            // Push all buffered content that hasn't been pushed yet
            for (const chunk of rscBuffer) {
              this.push(chunk);
            }
            
            // End the stream
            this.push(null);
            
            if (verbose) {
              logger?.info(
                `[createBufferedRscStream:${route}] Pushed ${rscBuffer.length} chunks, ending stream`
              );
            }
          }
          // If the stream hasn't ended yet, we'll push chunks as they arrive via the 'data' event
        }
      });

      // Add this consumer to the list
      consumers.push(consumer);

      // If the stream has already ended, push all buffered content immediately
      if (isStreamEnded) {
        for (const chunk of rscBuffer) {
          consumer.push(chunk);
        }
        consumer.push(null);
      }

      // Clean up when the consumer is destroyed
      consumer.on("close", () => {
        const index = consumers.indexOf(consumer);
        if (index > -1) {
          consumers.splice(index, 1);
        }
      });

      return consumer;
    },

    getBufferInfo() {
      return {
        chunks: rscBuffer.length,
        bytes: totalBytes
      };
    }
  };
}
