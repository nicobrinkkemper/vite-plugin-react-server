export type StreamMetrics = {
  chunks: number;
  bytes: number;
  backpressureCount: number;
  errorCount: number;
  duration: number;
  startTime: number;
  endTime?: number;
  route?: string;
};

export type CreateRenderMetricsFn = <T extends "html" | "rsc-headless" | "rsc-full">(metrics: {
  route: string;
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
  fromMainThread: boolean;
  fromRscWorker: boolean;
  fromHtmlWorker: boolean;
  memoryUsage: NodeJS.MemoryUsage;
  description?: string;
  fileSize?: never;
};

export type CreateStreamMetricsFn = (
  metrics?: Partial<StreamMetrics>
) => StreamMetrics;
