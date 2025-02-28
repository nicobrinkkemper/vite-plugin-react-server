// no offical types for node:module available yet (23.7.0)
declare module 'node:module' {
  export interface ImportAttributes {
    [key: string]: string | undefined;
  }

  export interface ResolveHookContext {
    conditions: string[];
    parentURL: string | undefined;
    importAttributes: ImportAttributes;
  }

  export interface LoadHookContext {
    conditions: string[];
    format: ModuleFormat | null | undefined;
    importAttributes: ImportAttributes;
    shortCircuit?: boolean;
  }

  export interface ResolveResult {
    url: string;
    shortCircuit: boolean;
  }

  export interface LoadResult {
    format: string;
    source: string | SharedArrayBuffer | Uint8Array;
    shortCircuit: boolean;
  }

  export interface HooksAPI {
    resolve?: (
      specifier: string,
      context: ResolveHookContext,
      nextResolve: (specifier: string, context: ResolveHookContext) => ResolveResult
    ) => ResolveResult;

    load?: (
      url: string,
      context: LoadHookContext,
      nextLoad: (url: string, context: LoadHookContext) => LoadResult
    ) => LoadResult;
  }

  export function registerHooks(hooks: HooksAPI): void;
}
//
import { parentPort, MessageChannel } from "node:worker_threads";
import { messageHandler } from "./messageHandler.js";
import { createLogger } from "../../utils/logger.js";
import { 
  registerHooks,
  register,
  type ResolveHookContext,
} from 'node:module';
import { register as registerTsx } from "tsx/esm/api";
import { join } from 'node:path';
import { getPluginRoot } from "../../config/getPaths.js";

const ports = new MessageChannel();
// Initialize worker
if (!parentPort) {
  throw new Error("This module must be run as a worker");
}

// Create channels for each loader
const reactLoaderChannel = new MessageChannel();
const cssLoaderChannel = new MessageChannel();

// Listen for messages from loaders
reactLoaderChannel.port2.on('message', (msg) => {
  messageHandler(msg);
});

cssLoaderChannel.port2.on('message', (msg) => {
  messageHandler(msg);
});

const loaderPath = 'file://' + join(getPluginRoot(), 'loader/react-loader.js');
const cssLoaderPath = 'file://' + join(getPluginRoot(), 'loader/css-loader.js');
console.log('[worker] Full loader path:', loaderPath);

// Register react-loader
register(loaderPath, {
  parentURL: getPluginRoot(),
  data: { port: reactLoaderChannel.port1 },
  transferList: [reactLoaderChannel.port1]
});
register(cssLoaderPath, {
  parentURL: getPluginRoot(),
  data: { port: cssLoaderChannel.port1 },
  transferList: [cssLoaderChannel.port1]
});

// Register loaders
registerTsx();

// Set up message handling
parentPort.on("message", (message) => {
  messageHandler(message);
});

// Signal ready
parentPort.postMessage({ type: "READY", env: "development" });



