import type { PassThrough, Transform } from "stream";

export type HtmlWorkerStreamMetrics = {
  totalChunksReceived: number;
  totalBytesReceived: number;
  totalChunksProcessed: number;
  totalBytesProcessed: number;
};

export type HtmlWorkerRenderState = {
  rscStream: PassThrough;
  moduleRootPath: string;
  moduleBaseURL: string;
  projectRoot: string;
  metrics: HtmlWorkerStreamMetrics;
  abort?: () => void;
  isReady: boolean;
  pendingChunks: string[];
  htmlStream?: PassThrough;
  htmlTransform?: Transform;
};
