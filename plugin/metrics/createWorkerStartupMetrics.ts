import { isMainThread } from "node:worker_threads";
import type { WorkerStartupMetrics } from "./types.js";

export function createWorkerStartupMetrics({
  route,
  workerType,
  startupTime,
  fromMainThread = isMainThread,
  fromRscWorker = false,
  fromHtmlWorker = false,
  memoryUsage = process.memoryUsage(),
  description,
}: {
  route: string;
  workerType: "rsc" | "html";
  startupTime: number;
  fromMainThread?: boolean;
  fromRscWorker?: boolean;
  fromHtmlWorker?: boolean;
  memoryUsage?: NodeJS.MemoryUsage;
  description?: string;
}): WorkerStartupMetrics {
  return {
    route,
    type: "worker-startup",
    workerType,
    startupTime,
    fromMainThread,
    fromRscWorker,
    fromHtmlWorker,
    memoryUsage,
    description,
  };
}



