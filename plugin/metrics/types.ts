
export type StreamMetrics = {
  chunks: number;
  bytes: number;
  backpressureCount: number;
  errorCount: number;
  duration: number;
  startTime: number;
  route?: string;
};

export type RenderMetrics = {
  route: string;
  htmlSize: number;
  rscSize: number;
  processingTime: number;
  chunks: number;
  chunkRate: number;
  memoryUsage: NodeJS.MemoryUsage;
  streamMetrics: StreamMetrics;
  htmlSizes: Map<string, number>;
  rscSizes: Map<string, number>;
};

export type CreateStreamMetricsFn = (
  metrics?: Partial<StreamMetrics>
) => StreamMetrics;