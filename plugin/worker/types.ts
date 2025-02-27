import type { Manifest } from "vite";

// Base message types
export interface WorkerMessage {
  type: string;
  id: string;
}

export interface PipeableStreamOptions {
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

// Worker States
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
  outDir: string;
  moduleRootPath: string;
  moduleBaseURL: string;
  rscOutputPath: string;
  componentImport: string;
  propsImport: string;
  pipableStreamOptions: PipeableStreamOptions;
}

// Common Messages
export interface ShutdownMessage extends WorkerMessage {
  type: "SHUTDOWN";
}

// RSC Messages
export interface RscRenderMessage extends WorkerMessage {
  type: "RSC_RENDER";
  pageImport: string;
  propsImport: string;
  pageExportName: string;
  propsExportName: string;
  url: string;
  outDir: string;
  projectRoot: string;
  moduleRootPath: string;
  moduleBaseURL: string;
  moduleBasePath: string;
  pipableStreamOptions: PipeableStreamOptions;
  cssFiles: string[];
}

export interface RscChunkMessage extends WorkerMessage {
  type: "RSC_CHUNK";
  chunk: string;
  moduleRootPath: string;
  moduleBaseURL: string;
  outDir: string;
  rscOutputPath: string;
  cssFiles: Array<[string, string]>;
}

export interface RscShellReadyMessage extends WorkerMessage {
  type: "SHELL_READY";
}

export interface RscAllReadyMessage extends WorkerMessage {
  type: "ALL_READY";
  outputPath: string;
  contents: string;
}

export interface RscEndMessage extends WorkerMessage {
  type: "RSC_END";
}

export interface RscErrorMessage extends WorkerMessage {
  type: "ERROR";
  error: string;
}

export interface ClientReferenceMessage extends WorkerMessage {
  type: "CLIENT_REFERENCE";
  location: string;
  key: string;
  ref: unknown;
}

export interface ServerReferenceMessage extends WorkerMessage {
  type: "SERVER_REFERENCE";
  location: string;
  key: string;
  ref: unknown;
}

// HTML Messages
export interface WorkerRscChunkMessage extends WorkerMessage {
  type: "RSC_CHUNK";
  chunk: string;
  moduleRootPath: string;
  moduleBaseURL: string;
  outDir: string;
  htmlOutputPath: string;
  pipableStreamOptions: PipeableStreamOptions;
  clientManifest: Manifest;
  serverManifest: Manifest;
}

export interface ShellReadyMessage extends WorkerMessage {
  type: "SHELL_READY";
}

export interface AllReadyMessage extends WorkerMessage {
  type: "ALL_READY";
  outputPath: string;
  html: string;
}

export interface CssFileMessage extends WorkerMessage {
  type: "CSS_FILE";
  id: string;
  cssFile: string;
  moduleClasses?: Record<string, string>;
}

// Message Unions
export type HtmlWorkerMessage =
  | WorkerRscChunkMessage
  | RscEndMessage
  | ShutdownMessage;

export type HtmlWorkerResponse =
  | ShellReadyMessage
  | AllReadyMessage
  | RscErrorMessage;

export type RscWorkerMessage =
  | RscRenderMessage
  | RscChunkMessage
  | RscEndMessage
  | ShutdownMessage
  | ClientReferenceMessage
  | ServerReferenceMessage
  | CssFileMessage;

export type RscWorkerResponse = 
  | RscShellReadyMessage
  | RscAllReadyMessage
  | RscErrorMessage
  | CssFileMessage;