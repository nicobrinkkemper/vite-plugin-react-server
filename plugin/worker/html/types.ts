import type { PassThrough, Transform } from "stream";
import type { SerializeableRenderToPipeableStreamOptions } from "../types.js";

export type HtmlWorkerStreamMetrics = {
  totalChunksReceived: number;
  totalBytesReceived: number;
  totalChunksProcessed: number;
  totalBytesProcessed: number;
};

export interface HtmlWorkerRenderState {
  rscStream: PassThrough;
  metrics: {
    totalChunksProcessed: number;
    totalBytesProcessed: number;
  };
  isReady: boolean;
  pendingChunks: Buffer[];
  htmlTransform: Transform;
  stream: ReactDOMServer.PipeableStream;
  abort?: () => void;
  shellReady?: boolean;
}
