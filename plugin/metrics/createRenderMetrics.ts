import { isMainThread } from "node:worker_threads";
import { createStreamMetrics } from "./createStreamMetrics.js";
import type { BaseRenderMetrics, CreateRenderMetricsFn, RenderMetrics } from "./types.js";

export const createRenderMetrics: CreateRenderMetricsFn = function _createRenderMetrics({
  route,
  batch,
  type,
  fromMainThread = isMainThread,
  fromRscWorker = false,
  fromHtmlWorker = false,
  processingTime = 0,
  chunks = 0,
  chunkRate = 0,
  memoryUsage = process.memoryUsage(),
  streamMetrics = createStreamMetrics(),
  fileSize = 0,
  fileName,
  outputPath,
  baseDir,
  routePath,
}) {
  const base = {
    route,
    batch,
    fromMainThread,
    fromRscWorker,
    fromHtmlWorker,
    processingTime,
    chunks,
    chunkRate,
    memoryUsage,
    streamMetrics,
  } as BaseRenderMetrics;

  if (type === "html" || type === "rsc-headless") {
    return {
      ...base,
      type,
      fileSize,
      fileName,
      outputPath,
      baseDir,
      routePath,
    } as unknown as RenderMetrics<typeof type>;
  } else {
    return {
      ...base,
      type,
    } as unknown as RenderMetrics<typeof type>;
  }
}
