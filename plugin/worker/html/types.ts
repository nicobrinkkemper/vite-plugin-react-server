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
  moduleRootPath: string;
  moduleBaseURL: string;
  projectRoot: string;
  metrics: {
    totalChunksProcessed: number;
    totalBytesProcessed: number;
  };
  isReady: boolean;
  pendingChunks: Buffer[];
  htmlTransform: Transform;
  stream: ReactDOMServer.PipeableStream;
  elements?: React.ReactElement;
  pipeableStreamOptions: SerializeableRenderToPipeableStreamOptions;
  abort?: () => void;
  shellReady?: boolean;
}
