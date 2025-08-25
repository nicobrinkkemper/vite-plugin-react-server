import type { StreamMetrics } from "../helpers/metrics.js";
import type { Stream } from "node:stream";
import type { OnMetrics, PanicThreshold } from "../types.js";

/**
 * Base RSC Stream Result - common interface for both client and server
 */
export interface BaseRscStreamResult {
  rscStream: Stream.Readable;
  pipe: <Writable extends NodeJS.WritableStream>(
    destination: Writable
  ) => Writable;
  abort: (reason?: unknown) => void;
  metrics: StreamMetrics;
}

/**
 * Client-specific RSC Stream Result
 */
export interface ClientRscStreamResult extends BaseRscStreamResult {
  type: "client";
}

/**
 * Server-specific RSC Stream Result
 */
export interface ServerRscStreamResult extends BaseRscStreamResult {
  type: "server";
}

/**
 * RSC Stream Result - union type for both environments
 */
export type RscStreamResult = ClientRscStreamResult | ServerRscStreamResult;

/**
 * Client-specific RSC Stream Options
 */
export interface ClientRscStreamOptions {
  // Required core options
  route: string;
  pagePath: string;
  projectRoot: string;
  moduleBaseURL: string;
  build: any;
  
  // Required for client-side rendering
  cssFiles: Map<string, any>;
  globalCss: Map<string, any>;
  manifest: any;
  
  // Optional but commonly used
  id?: string;
  moduleRootPath?: string;
  moduleBasePath?: string;
  verbose?: boolean;
  panicThreshold?: PanicThreshold;
  propsPath?: string;
  rootPath?: string;
  htmlPath?: string;
  pageExportName: string;
  propsExportName: string;
  rootExportName: string;
  htmlExportName: string;
  moduleBase: string;
  publicOrigin: string;
  rscTimeout: number;
  
  // Client-specific options
  rscWorker?: any;
  htmlWorker?: any;
  htmlWorkerPath?: string;
  rscWorkerPath?: string;
  worker?: any;
  clientPipeableStreamOptions?: any;
  serverPipeableStreamOptions?: any;
  url: string;
  onMetrics?: OnMetrics; // Callback for worker startup metrics
}

/**
 * Server-specific RSC Stream Options
 */
export interface ServerRscStreamOptions {
  // Required core options
  route: string;
  pagePath: string;
  logger: any;
  
  // Required for server-side rendering
  loader: any;
  build: any;
  
  // Optional but commonly used
  id?: string;
  projectRoot: string;
  moduleRootPath: string;
  moduleBasePath: string;
  moduleBaseURL: string;
  verbose: boolean;
  panicThreshold?: PanicThreshold;
  propsPath?: string;
  rootPath?: string;
  htmlPath?: string;
  pageExportName: string;
  propsExportName: string;
  rootExportName: string;
  htmlExportName: string;
  moduleBase: string;
  publicOrigin: string;
  rscTimeout: number;
  cssFiles: Map<string, any>;
  globalCss: Map<string, any>;
  manifest: any;
  
  // Server-specific options
  worker?: any;
  rscWorker?: any;
  rscWorkerPath?: string;
  htmlWorker?: any;
  htmlWorkerPath?: string;
  clientPipeableStreamOptions?: any;
  serverPipeableStreamOptions?: any;
  url: string;
  htmlTimeout?: number;
  fileWriteTimeout?: number;
  workerShutdownTimeout?: number;
  css?: any;
}

/**
 * Environment-specific RSC Stream Options
 */
export type CreateRscStreamOptions<
  Env extends "client" | "server" = "client" | "server"
> = Env extends "client" ? ClientRscStreamOptions : ServerRscStreamOptions;

/**
 * RSC Stream Function - creates React Server Components streams
 * 
 * **Purpose**: Creates RSC streams for both client and server environments
 * **When to use**: 
 * - You need to create RSC streams for static generation or server-side rendering
 * - You want environment-specific optimizations (worker-based vs direct rendering)
 * - You need to serialize React components for client-side hydration
 * 
 * **Flow**: Route + Components → RSC Stream (with environment-specific processing)
 */
export type CreateRscStreamFn<
  Env extends "client" | "server" = "client" | "server"
> = <Opt extends CreateRscStreamOptions<Env> = CreateRscStreamOptions<Env>>(
  options: Opt
) => Env extends "client" ? ClientRscStreamResult : ServerRscStreamResult;

/**
 * Unified RSC Stream Function - automatically chooses environment
 */
export type CreateRscStreamFnUnified = <
  Env extends "client" | "server",
  Opt extends CreateRscStreamOptions<Env>
>(
  options: Opt
) => RscStreamResult;
