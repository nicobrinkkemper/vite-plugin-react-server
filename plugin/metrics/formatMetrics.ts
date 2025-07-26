import type { RenderMetrics } from "./types.js";

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
  const formatMemory = (bytes: number) =>
    `${(bytes / 1024 / 1024).toFixed(2)}MB`;

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
    Errors: ${streamMetrics.errorCount}
`.trim();
}

export function metricWatcher({
  maxTime = 200,
  maxBackpressure = 1, // Default to 1 - warn if more than 1 backpressure occurrence
  warnOnly = false,
  warn = console.warn,
  info = console.info,
}: {
  maxTime?: number;
  maxBackpressure?: number;
  warnOnly?: boolean;
  warn?: (...args: unknown[]) => void;
  info?: (...args: unknown[]) => void;
}) {
  return (metrics: RenderMetrics) => {
    // Check for backpressure first (more critical)
    if (metrics.streamMetrics.backpressureCount > maxBackpressure) {
      warn(`Backpressure detected on ${metrics.route}: ${metrics.streamMetrics.backpressureCount} occurrences`);
      warn(formatMetrics(metrics));
    }
    // Check for slow processing
    else if (metrics.processingTime > maxTime) {
      warn(`It took over ${maxTime}ms to render ${metrics.route}`);
      warn(formatMetrics(metrics));
    } else if (!warnOnly) {
      const rounded = Math.round(metrics.processingTime);
      if (rounded === 0) {
        // smaller unit of time
        const rounded = Math.round(metrics.processingTime * 1000);
        info(`${metrics.route} (${rounded}μs)`);
      } else {
        info(`${metrics.route} (${rounded}ms)`);
      }
    }
  };
}

export function logMetrics(metrics: RenderMetrics, logger: {info: (message: string) => void} = console) {
  logger.info(formatMetrics(metrics));
}
