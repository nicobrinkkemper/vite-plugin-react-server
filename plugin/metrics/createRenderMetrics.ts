import { createStreamMetrics } from "./createStreamMetrics.js";
import type { RenderMetrics } from "./types.js";

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
  };
}
