/**
 * rscToHtmlStream.client.ts
 *
 * NOTE: This file is currently unused. HTML rendering is done directly in renderPage.client.ts
 * to avoid stream duplication issues.
 */
import { Transform } from "node:stream";
import { createStreamMetrics } from "../metrics/createStreamMetrics.js";
import type { RscToHtmlStreamFn } from "./types.js";

/**
 * Creates a transform stream that converts RSC content to HTML using main-thread rendering
 *
 * @param options The options for RSC to HTML transformation
 * @returns A transform stream that outputs HTML content
 */
export const createRscToHtmlStream: RscToHtmlStreamFn =
  function _createRscToHtmlStream(_options) {
    const streamMetrics = createStreamMetrics();
    
    // Create the transform stream that accepts RSC chunks and outputs HTML
    const stream = new Transform({
      transform(chunk, _encoding, callback) {
        // Just pass through RSC chunks for now - we'll handle HTML rendering in flush
        callback(null, chunk);
      },
      flush(callback) {
        // For now, just resolve immediately since we can't easily recreate the RSC stream
        // This is a temporary fix - the real solution is to not duplicate the stream
        callback();
      },
    });

    // Add metrics to the stream
    (stream as any).metrics = streamMetrics;

    return stream;
  }; 