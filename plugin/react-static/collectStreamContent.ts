/**
 * collectStreamContent.ts
 *
 * Shared implementation behind collectRscContent and collectHtmlContent, which
 * were ~95% identical. Both buffer a source stream while tracking metrics, then
 * expose the buffered content for reuse.
 *
 * NOTE: completion here is timeout-bound, not stream-bound — the internal
 * `consumer` PassThrough is never drained, so the "end" event does not fire and
 * each call resolves only when `timeout` elapses. This faithfully preserves the
 * original behavior of both collectors; see
 * test/unit/collectStreamContent.test.ts for the characterization, and the
 * follow-up bead for fixing the timeout/single-use quirks deliberately.
 */

import { Transform } from "node:stream";
import { createStreamMetrics } from "../metrics/createStreamMetrics.js";
import type { Logger } from "vite";
import type { StreamMetrics } from "../types.js";

export type CollectStreamSource = {
  abort: (reason?: unknown) => void;
  pipe: <Writable extends NodeJS.WritableStream>(destination: Writable) => Writable;
};

export type CollectStreamContentOptions = {
  /** Resolve after this many ms if the source has not completed. */
  timeout: number;
  /** Log prefix, e.g. "collectRscContent" or "collectHtmlContent.client". */
  logTag: string;
  verbose?: boolean | undefined;
  logger: Logger;
};

export type CollectStreamContentReturn = {
  pipe: <Writable extends NodeJS.WritableStream>(destination: Writable) => Writable;
  abort: (reason?: unknown) => void;
  metrics: StreamMetrics;
  bufferedContent: Buffer[];
};

export async function collectStreamContent(
  source: CollectStreamSource,
  options: CollectStreamContentOptions
): Promise<CollectStreamContentReturn> {
  const { timeout, logTag, verbose, logger } = options;
  const metrics = createStreamMetrics();
  const startTime = performance.now();

  // Buffer to store content for reuse.
  const buffer: Buffer[] = [];

  const metricsTransform = new Transform({
    transform(chunk, encoding, callback) {
      const buffered = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk, encoding as BufferEncoding);
      metrics.chunks++;
      metrics.bytes += buffered.length;
      buffer.push(buffered);

      if (verbose) {
        logger.info(
          `[${logTag}] chunk ${metrics.chunks}, bytes: ${buffered.length}, total: ${metrics.bytes}`
        );
      }

      callback(null, chunk);
    },
    flush(callback) {
      metrics.duration = performance.now() - startTime;
      if (verbose) {
        logger.info(
          `[${logTag}] Transform flush: ${metrics.chunks} chunks, ${metrics.duration}ms`
        );
      }
      callback();
    },
  });

  try {
    const { PassThrough } = await import("node:stream");
    const consumer = new PassThrough();

    source.pipe(metricsTransform).pipe(consumer);

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (verbose) {
          logger.info(`[${logTag}] Stream timeout reached, forcing completion`);
        }
        resolve();
      }, timeout);

      consumer.on("end", () => {
        if (verbose) {
          logger.info(`[${logTag}] Stream ended with ${metrics.bytes} bytes`);
        }
        clearTimeout(timer);
        resolve();
      });

      consumer.on("error", (error) => {
        if (verbose) {
          logger.info(`[${logTag}] Stream error: ${error}`);
        }
        clearTimeout(timer);
        reject(error);
      });
    });

    if (verbose) {
      logger.info(`[${logTag}] Collection completed with ${metrics.bytes} bytes`);
    }

    // A readable that replays the buffered content; single-use (see header).
    const { Readable } = await import("node:stream");
    const readableStream = new Readable({
      read() {
        for (const chunk of buffer) {
          this.push(chunk);
        }
        this.push(null);
      },
    });

    return {
      pipe: readableStream.pipe.bind(readableStream),
      abort: (reason?: unknown) => {
        source.abort(reason);
        readableStream.destroy(reason as Error);
      },
      metrics,
      bufferedContent: buffer,
    };
  } catch (error) {
    if (verbose) {
      logger.info(`[${logTag}] Error: ${error}`);
    }
    metricsTransform.destroy();
    source.abort(new Error(`${logTag} aborted`));
    if (error != null) {
      throw error;
    }
    throw new Error(`Failed to collect content (${logTag})`);
  }
}
