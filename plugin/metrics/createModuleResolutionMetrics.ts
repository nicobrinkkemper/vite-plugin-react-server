import { isMainThread } from "node:worker_threads";
import type { ModuleResolutionMetrics } from "./types.js";

export function createModuleResolutionMetrics({
  route,
  workerType,
  resolutionTime,
  fromMainThread = isMainThread,
  fromRscWorker = false,
  fromHtmlWorker = false,
  memoryUsage = process.memoryUsage(),
  description,
}: {
  route: string;
  workerType: "rsc" | "html" | "mainThread";
  resolutionTime: number;
  fromMainThread?: boolean;
  fromRscWorker?: boolean;
  fromHtmlWorker?: boolean;
  memoryUsage?: NodeJS.MemoryUsage;
  description?: string;
}): ModuleResolutionMetrics {
  return {
    route,
    type: "module-resolution",
    workerType,
    resolutionTime,
    fromMainThread,
    fromRscWorker,
    fromHtmlWorker,
    memoryUsage,
    description,
  };
}




