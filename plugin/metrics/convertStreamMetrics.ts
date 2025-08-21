import type { StreamMetrics, RenderMetrics } from "../types.js";
import { createRenderMetrics } from "./createRenderMetrics.js";

export function convertStreamMetricsToRenderMetrics(
  streamMetrics: StreamMetrics,
  route: string,
  type: "rsc-full" | "rsc-headless" | "html",
  fromMainThread: boolean = false,
  fromRscWorker: boolean = false,
  fromHtmlWorker: boolean = false,
  processingTime?: number
): RenderMetrics<typeof type> {
  const elapsedTime = processingTime || streamMetrics.duration;
  
  return createRenderMetrics({
    route,
    type,
    fromMainThread,
    fromRscWorker,
    fromHtmlWorker,
    processingTime: elapsedTime,
    chunks: streamMetrics.chunks,
    chunkRate: streamMetrics.chunks / (elapsedTime / 1000),
    memoryUsage: process.memoryUsage(),
    streamMetrics,
    fileSize: streamMetrics.bytes,
  }) as RenderMetrics<typeof type>;
}
