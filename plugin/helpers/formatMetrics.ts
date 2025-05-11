import type { RenderMetrics } from "../types.js";

export function formatMetrics(metrics: RenderMetrics): string {
  const {
    route,
    rscSize,
    chunks,
    chunkRate,
    processingTime,
    memoryUsage,
    streamMetrics,
  } = metrics;

  // Format memory usage in MB
  const formatMemory = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)}MB`;

  return `
Route: ${route}
Size: ${(rscSize / 1024).toFixed(2)}KB
Chunks: ${chunks} (${chunkRate.toFixed(2)} chunks/s)
Processing Time: ${processingTime.toFixed(2)}ms
Memory:
  RSS: ${formatMemory(memoryUsage.rss)}
  Heap Total: ${formatMemory(memoryUsage.heapTotal)}
  Heap Used: ${formatMemory(memoryUsage.heapUsed)}
  External: ${formatMemory(memoryUsage.external)}
Stream:
  Duration: ${streamMetrics.duration.toFixed(2)}ms
  Backpressure: ${streamMetrics.backpressureCount}
  Drain: ${streamMetrics.drainCount}
  Errors: ${streamMetrics.errorCount}
`.trim();
}

export function logMetrics(metrics: RenderMetrics) {
  console.log(formatMetrics(metrics));
} 