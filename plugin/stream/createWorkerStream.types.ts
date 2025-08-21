import { Readable } from "node:stream";
import type { PanicThreshold } from "../types.js";



/**
 * Client-specific Worker Stream Options
 */
export interface ClientWorkerStreamOptions {
  // Required core options
  route: string;
  url: string;
  workerPath: string;
  messageType: string;
  currentCondition: "react-server" | "react-client";
  reverseCondition: "react-server" | "react-client";
  
  // Required for client-side rendering
  projectRoot: string;
  cssFiles: Map<string, any>;
  globalCss: Map<string, any>;
  manifest: any;
  build: any;
  
  // Optional but commonly used
  id?: string;
  moduleBasePath?: string;
  moduleBaseURL?: string;
  moduleRootPath?: string;
  verbose?: boolean;
  panicThreshold?: PanicThreshold;
  pagePath?: string;
  propsPath?: string;
  rootPath?: string;
  htmlPath?: string;
  pageExportName?: string;
  propsExportName?: string;
  rootExportName?: string;
  htmlExportName?: string;
  moduleBase?: string;
  publicOrigin?: string;
  rscTimeout?: number;
  htmlTimeout?: number;
  fileWriteTimeout?: number;
  workerShutdownTimeout?: number;
  rscWorkerPath?: string;
  htmlWorkerPath?: string;
  css?: any;
  serverPipeableStreamOptions?: any;
  clientPipeableStreamOptions?: any;
  HtmlComponent?: any;
  RootComponent?: any;
  
  // Client-specific options
  worker?: any;
  onWorkerReady?: () => void; // Callback when worker is ready
}

/**
 * Server-specific Worker Stream Options
 */
export interface ServerWorkerStreamOptions {
  // Required core options
  route: string;
  url: string;
  workerPath: string;
  messageType: string;
  currentCondition: "react-server" | "react-client";
  reverseCondition: "react-server" | "react-client";
  
  // Optional but commonly used
  id?: string;
  projectRoot?: string;
  moduleBasePath?: string;
  moduleBaseURL?: string;
  moduleRootPath?: string;
  verbose?: boolean;
  panicThreshold?: PanicThreshold;
  pagePath?: string;
  propsPath?: string;
  rootPath?: string;
  htmlPath?: string;
  pageExportName?: string;
  propsExportName?: string;
  rootExportName?: string;
  htmlExportName?: string;
  moduleBase?: string;
  publicOrigin?: string;
  rscTimeout?: number;
  htmlTimeout?: number;
  fileWriteTimeout?: number;
  workerShutdownTimeout?: number;
  rscWorkerPath?: string;
  htmlWorkerPath?: string;
  css?: any;
  cssFiles?: Map<string, any>;
  globalCss?: Map<string, any>;
  manifest?: any;
  build?: any;
  serverPipeableStreamOptions?: any;
  clientPipeableStreamOptions?: any;
  HtmlComponent?: any;
  RootComponent?: any;
  
  // Server-specific options
  worker?: any;
}

/**
 * Environment-specific Worker Stream Options
 */
export type CreateWorkerStreamOptions<
  Env extends "client" | "server" = "client" | "server"
> = Env extends "client" ? ClientWorkerStreamOptions : ServerWorkerStreamOptions;

/**
 * Worker Stream Function - creates worker-based streams
 * 
 * **Purpose**: Creates streams that communicate with workers for RSC/HTML generation
 * **When to use**: 
 * - You need to offload rendering to worker threads
 * - You want to separate rendering logic from the main thread
 * - You need to handle different environments (client vs server)
 * 
 * **Flow**: Options → Worker Communication → Stream
 */
export type CreateWorkerStreamFn<
  Env extends "client" | "server" = "client" | "server"
> = <Opt extends CreateWorkerStreamOptions<Env> = CreateWorkerStreamOptions<Env>>(
  options: Opt
) => Readable;

// Legacy type alias for backward compatibility
export type WorkerStreamOptions = ClientWorkerStreamOptions;
export type BaseWorkerStreamOptions = ClientWorkerStreamOptions;
