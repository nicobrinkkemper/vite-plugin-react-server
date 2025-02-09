interface PipeableStreamOptions {
  bootstrapModules?: string[];
  bootstrapScripts?: string[];
  bootstrapScriptContent?: string;
  signal?: AbortSignal;
  identifierPrefix?: string;
  namespaceURI?: string;
  nonce?: string;
  progressiveChunkSize?: number;
  onShellReady?: () => void;
  onAllReady?: () => void;
  onError?: (error: unknown) => void;
  importMap?: {
    imports?: Record<string, string>;
  };
}

export interface HtmlRenderState {
  chunks: string[];
  complete: boolean;
  rendered: boolean;
  outDir: string;
  moduleRootPath: string;
  moduleBaseURL: string;
  htmlOutputPath: string;
  id: string;
  pipableStreamOptions: PipeableStreamOptions;
}

export interface RscRenderState {
  id: string;
  pipableStreamOptions: PipeableStreamOptions;
  outDir: string;
  moduleRootPath: string;
  moduleBaseURL: string;
  rscOutputPath: string;
  componentImport: string;
  propsImport: string;
}

export interface WorkerRscChunkMessage {
  type: "RSC_CHUNK";
  id: string;
  chunk: string;
  moduleRootPath: string;
  moduleBaseURL: string;
  outDir: string;
  htmlOutputPath: string;
  pipableStreamOptions: PipeableStreamOptions;
}

export interface ShutdownMessage {
  type: "SHUTDOWN";
  id: string;
}

export interface RscRenderMessage {
  type: "RSC_RENDER";
  id: string;
  pageImport: string;
  propsImport: string;
  outDir: string;
  moduleRootPath: string;
  moduleBaseURL: string;
  pipableStreamOptions: PipeableStreamOptions;
}

export interface RscCompleteMessage {
  type: "RSC_COMPLETE";
  id: string;
  outputPath: string;
}

export interface RscErrorMessage {
  type: "ERROR";
  id: string;
  error: string;
}

export interface RscWroteFileMessage {
  type: "WROTE_FILE";
  id: string;
  outputPath: string;
}

export interface RscEndMessage {
  type: "RSC_END";
  id: string;
}

export interface ClientReferenceMessage {
  type: "CLIENT_REFERENCE";
  id: string;
  location: string;
  key: string;
  ref: unknown;
}

export interface ServerReferenceMessage {
  type: "SERVER_REFERENCE";
  id: string;
  location: string;
  key: string;
  ref: unknown;
}

export type HtmlWorkerMessage =
  | WorkerRscChunkMessage
  | RscEndMessage
  | ShutdownMessage;

export type RscWorkerMessage =
  | RscRenderMessage
  | RscEndMessage
  | ShutdownMessage
  | ClientReferenceMessage
  | ServerReferenceMessage;

export type RscWorkerResponse = 
  | RscCompleteMessage
  | RscErrorMessage
  | RscWroteFileMessage
  | ClientReferenceMessage
  | ServerReferenceMessage;