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

export interface ShutdownMessage {
  type: "SHUTDOWN";
}

export interface RscChunkMessage {
  type: "RSC_RENDER";
  id: string;
  component: string;
  props: Record<string, unknown>;
  outDir: string;
}

export interface RscEndMessage {
  type: "RSC_END";
  id: string;
}

export interface ShutdownMessage {
  type: "SHUTDOWN";
}

export interface ClientReferenceMessage {
  type: "CLIENT_REFERENCE";
  id: string;
  location: string;
  key: string;
}
export interface ServerReferenceMessage {
  type: "SERVER_REFERENCE";
  id: string;
  location: string;
  key: string;
}




export type HtmlWorkerMessage =
  | WorkerRscChunkMessage
  | RscEndMessage
  | ShutdownMessage;

export type RscWorkerMessage =
  | RscChunkMessage
  | RscEndMessage
  | ShutdownMessage
  | ClientReferenceMessage
  | ServerReferenceMessage;