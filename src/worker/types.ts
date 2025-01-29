import type { PipeableStreamOptions } from "react-dom/server.node";

export interface RenderState {
  chunks: string[];
  complete: boolean;
  rendered: boolean;
  outDir: string;
  moduleBasePath: string;
  moduleBaseURL: string;
  htmlOutputPath: string;
  id: string;
  pipableStreamOptions: PipeableStreamOptions;
}

export interface WorkerRscChunkMessage {
  type: "RSC_CHUNK";
  id: string;
  chunk: string;
  moduleBasePath: string;
  moduleBaseURL: string;
  outDir: string;
  htmlOutputPath: string;
  pipableStreamOptions: PipeableStreamOptions;
}

export interface WorkerRscEndMessage {
  type: "RSC_END";
  id: string;
}

export interface WorkerShutdownMessage {
  type: "SHUTDOWN";
}

export type WorkerMessage =
  | WorkerRscChunkMessage
  | WorkerRscEndMessage
  | WorkerShutdownMessage;
