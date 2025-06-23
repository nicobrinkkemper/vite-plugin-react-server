import type { StreamMetrics } from "./types.js";

export function createStreamMetrics(): StreamMetrics {
    return {
      chunks: 0,
      bytes: 0,
      backpressureCount: 0,
      drainCount: 0,
      errorCount: 0,
      duration: 0,
      startTime: performance.now()
    };
  }
  