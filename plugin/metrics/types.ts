export type StreamMetrics = {
  chunks: number;
  bytes: number;
  backpressureCount: number;
  errorCount: number;
  duration: number;
  /** performance.now() in the STAMPING thread — only meaningful for durations computed in that same thread. */
  startTime: number;
  /**
   * Wall-clock ms (Date.now()) when the stream span began. Metrics cross the
   * worker boundary and each thread has its own performance timeOrigin, so any
   * math between a worker-stamped startTime and another thread's
   * performance.now() is off by the difference of origins (≈ the worker's
   * spawn offset) — which inflated every first-batch processingTime by the
   * same constant. Cross-thread spans must use startAt.
   */
  startAt?: number;
  endTime?: number;
  route?: string;
};

export type CreateRenderMetricsFn = <T extends "html" | "rsc-headless" | "rsc-full">(metrics: {
  route: string;
  batch?: { index: number; size: number };
  type: T;
  fromMainThread: boolean;
  fromRscWorker: boolean;
  fromHtmlWorker: boolean;
  processingTime?: number;
  chunks?: number;
  chunkRate?: number;
  memoryUsage?: NodeJS.MemoryUsage;
  streamMetrics?: StreamMetrics;
  fileSize?: number;
  fileName?: string;
  outputPath?: string;
  baseDir?: string;
  routePath?: string;
}) => RenderMetrics<T>;

export type BaseRenderMetrics = {
  route: string;
  /**
   * Which render batch this route belonged to (parallel static generation).
   * index 0 is the warm-up route that pays the cold module load solo; size is
   * the ACTUAL number of routes in the batch. Absent in sequential mode.
   */
  batch?: { index: number; size: number };
  fromMainThread: boolean;
  fromRscWorker: boolean;
  fromHtmlWorker: boolean;
  processingTime: number;
  chunks: number;
  chunkRate: number;
  memoryUsage: NodeJS.MemoryUsage;
  streamMetrics: StreamMetrics;
  streamType?: string;
  description?: string;
};

export type RenderMetrics<
  T extends "html" | "rsc-headless" | "rsc-full" = "html" | "rsc-headless" | "rsc-full"
> = { type: T } & (T extends "html" | "rsc-headless"
  ? BaseRenderMetrics & {
      // explicitly set the fileSize, fileName, outputPath, baseDir, routePath
      fileSize: number;
      fileName: string; // build.rscOutputPath (/index.rsc) or build.htmlOutputPath (/index.html)
      outputPath: string; // the full output path of the file
      baseDir: string; // build.outDir + build.static
      routePath: string; // normalized route path without trailing slash and '/' is empty string
    }
  : T extends "rsc-full"
  ? BaseRenderMetrics & {
      // we leave these out because they are not applicable to rsc-full
      fileSize?: never;
      fileName?: never;
      outputPath?: never;
      baseDir?: never;
      routePath?: never;
    }
  : BaseRenderMetrics & {
      // if not a string literal, they can be undefined (relaxed)
      fileSize?: number;
      fileName?: string;
      outputPath?: string;
      baseDir?: string;
      routePath?: string;
    });

export type WorkerStartupMetrics = {
  route: string;
  type: "worker-startup";
  workerType: "rsc" | "html";
  startupTime: number;
  fromMainThread: boolean;
  fromRscWorker: boolean;
  fromHtmlWorker: boolean;
  memoryUsage: NodeJS.MemoryUsage;
  description?: string;
  fileSize?: never;
  processingTime?: never;
};

export type ModuleResolutionMetrics = {
  route: string;
  type: "module-resolution";
  workerType: "rsc" | "html" | "mainThread";
  startupTime?: never;
  resolutionTime: number;
  /**
   * Wall-clock ms (Date.now()) when resolution began. Wall-clock, not
   * performance.now(): the metric crosses the worker boundary and each thread
   * has its own performance timeOrigin, so only absolute times let the watcher
   * relate spans from different threads (the first cold batch overlaps worker
   * startup, module execution and render).
   */
  resolveStartAt?: number;
  /**
   * Wall-clock ms when the first NON-cached module load began — the moment
   * module code actually runs, as opposed to cache lookups or waiting on an
   * in-flight load. Unset = every component was a cache hit (warm render).
   */
  moduleRunAt?: number;
  /** Load+execute portion of resolutionTime (span end − moduleRunAt). */
  moduleRunTime?: number;
  fromMainThread: boolean;
  fromRscWorker: boolean;
  fromHtmlWorker: boolean;
  memoryUsage: NodeJS.MemoryUsage;
  description?: string;
  fileSize?: never;
};

/**
 * One edge-bake summary (producer or consumer half). Replaces the default
 * stdout lines the bake used to print: the raw log went behind `verbose`, and
 * consumers that want the information route it through onMetrics instead.
 */
export type EdgeBakeMetrics = {
  route: "*";
  type: "edge-bake";
  kind: "producer" | "consumer";
  /** Absolute output location (producer: the edge dir; consumer: the bundle file). */
  outputPath: string;
  /** Client modules baked into the consumer's closed registry, when kind = "consumer". */
  moduleCount?: number;
  bakeTime: number;
  description?: string;
};

/**
 * The post-write inline-flight pass (flight payload injected into each
 * prerendered html). Emitted so the pass is measurable — the streamable
 * inline variant under design changes this cost, and defaulting it needs
 * numbers from real builds.
 */
export type InlineFlightMetrics = {
  route: "*";
  type: "inline-flight";
  pages: number;
  inlineTime: number;
  description?: string;
};

/**
 * The whole static render pass: how many routes rendered (and failed) and the
 * wall time. Replaces the raw "Rendered N pages in Xms" line for onMetrics
 * consumers.
 */
export type SsgRenderMetrics = {
  route: "*";
  type: "ssg-render";
  pages: number;
  failed: number;
  renderTime: number;
  description?: string;
};

export type CreateStreamMetricsFn = (
  metrics?: Partial<StreamMetrics>
) => StreamMetrics;
