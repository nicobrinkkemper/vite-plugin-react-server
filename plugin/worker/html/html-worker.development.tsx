// no offical types for node:module available yet (23.7.0)
declare module "node:module" {
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
      nextResolve: (
        specifier: string,
        context: ResolveHookContext
      ) => ResolveResult
    ) => ResolveResult;

    load?: (
      url: string,
      context: LoadHookContext,
      nextLoad: (url: string, context: LoadHookContext) => LoadResult
    ) => LoadResult;
  }

  export function registerHooks(hooks: HooksAPI): void;
}
import { join } from "node:path";
import { pluginRoot } from "../../root.js";
import { messageHandler } from "./messageHandler.js";
import { parentPort } from "node:worker_threads";
import { register } from "node:module";
import { register as registerTsx } from "tsx/esm/api";
import { MessageChannel } from "node:worker_threads";

if (!parentPort) throw new Error("This module must be run as a worker");

// Create channels for each loader
const reactLoaderChannel = new MessageChannel();
const cssLoaderChannel = new MessageChannel();

// Listen for messages from loaders
reactLoaderChannel.port2.on("message", messageHandler);
cssLoaderChannel.port2.on("message", messageHandler);

const loaderPath = "file://" + join(pluginRoot, "loader/react-loader.js");
const cssLoaderPath = "file://" + join(pluginRoot, "loader/css-loader.js");

// Register react-loader
register(loaderPath, {
  parentURL: pluginRoot,
  data: { port: reactLoaderChannel.port1 },
  transferList: [reactLoaderChannel.port1],
});
register(cssLoaderPath, {
  parentURL: pluginRoot,
  data: { port: cssLoaderChannel.port1 },
  transferList: [cssLoaderChannel.port1],
});

// Register loaders
registerTsx();
// Signal ready with environment
parentPort?.on("message", messageHandler);
parentPort?.postMessage({
  type: "READY",
  env: process.env["NODE_ENV"],
  pid: process.pid,
});

if (process.env["NODE_ENV"] !== "development") {
  throw new Error("This module must be run in development mode");
}
