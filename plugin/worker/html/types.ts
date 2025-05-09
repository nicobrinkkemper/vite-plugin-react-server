import type { PassThrough, Transform } from "stream";
import type { StreamMetrics } from "../../types.js";

export type HtmlWorkerStreamMetrics = {
  totalChunksReceived: number;
  totalBytesReceived: number;
  totalChunksProcessed: number;
  totalBytesProcessed: number;
};

export interface HtmlWorkerRenderState {
  rscStream: PassThrough;
  metrics: StreamMetrics;
  isReady: boolean;
  htmlTransform: Transform;
  stream: ReactDOMServer.PipeableStream;
  abort?: () => void;
  shellReady?: boolean;
}
