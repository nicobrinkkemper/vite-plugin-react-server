import { Transform } from "node:stream";
import type { StreamMetrics, RenderMetrics } from "../types.js";
import type { PipeableStream } from "react-dom/server";

export function createStreamMetrics(): StreamMetrics {
  return {
    chunks: 0,
    bytes: 0,
    backpressureCount: 0,
    drainCount: 0,
    errorCount: 0,
    duration: 0,
    startTime: Date.now()
  };
}

export function createRenderMetrics(route: string): RenderMetrics {
  return {
    route,
    htmlSize: 0,
    rscSize: 0,
    processingTime: 0,
    chunks: 0,
    chunkRate: 0,
    memoryUsage: process.memoryUsage(),
    streamMetrics: createStreamMetrics(),
    htmlSizes: new Map(),
    rscSizes: new Map(),
    totalChunks: 0
  };
}

/**
 * Creates a transform stream that collects metrics from the input stream
 * @param stream The stream to collect metrics from
 * @returns A promise that resolves with the metrics when the stream ends
 */
export function collectStreamMetrics(stream: PipeableStream | NodeJS.ReadableStream): Promise<StreamMetrics> {
  const metrics = createStreamMetrics();
  const startTime = Date.now();

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