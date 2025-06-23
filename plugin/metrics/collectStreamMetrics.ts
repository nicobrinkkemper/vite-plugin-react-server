import { Transform } from "node:stream";
import type { PipeableStream } from "react-dom/server";
import { createStreamMetrics } from "./createStreamMetrics.js";
import type { StreamMetrics } from "./types.js";

/**
 * Creates a transform stream that collects metrics from the input stream
 * @param stream The stream to collect metrics from
 * @returns A promise that resolves with the metrics when the stream ends
 */
export function collectStreamMetrics(stream: PipeableStream | NodeJS.ReadableStream): Promise<StreamMetrics> {
  const metrics = createStreamMetrics();
  const startTime = performance.now()

  return new Promise<StreamMetrics>((resolve, reject) => {
    const transform = new Transform({
      transform(chunk, _encoding, callback) {
        metrics.chunks++;
        metrics.bytes += chunk.length;
        callback(null, chunk);
      },
      flush(callback) {
        metrics.duration = Date.now() - startTime;
        callback();
      }
    });

    stream.pipe(transform);

    transform.on("error", (error) => {
      reject(error);
    });

    transform.on("end", () => {
      resolve(metrics);
    });
  });
} 