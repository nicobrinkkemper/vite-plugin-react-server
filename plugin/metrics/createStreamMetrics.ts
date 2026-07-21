import type { CreateStreamMetricsFn } from "./types.js";
import { performance } from "node:perf_hooks";

export const createStreamMetrics: CreateStreamMetricsFn =
  function _createStreamMetrics(metrics) {
    if (metrics != null) {
      return {
        chunks: metrics.chunks ?? 0,
        bytes: metrics.bytes ?? 0,
        backpressureCount: metrics.backpressureCount ?? 0,
        errorCount: metrics.errorCount ?? 0,
        duration: metrics.duration ?? 0,
        startTime: metrics.startTime ?? performance.now(),
        startAt: metrics.startAt ?? Date.now(),
      };
    }
    return {
      chunks: 0,
      bytes: 0,
      backpressureCount: 0,
      errorCount: 0,
      duration: 0,
      startTime: performance.now(),
      startAt: Date.now(),
    };
  };
