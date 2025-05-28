import { parentPort, MessageChannel, workerData } from "node:worker_threads";
import { messageHandler } from "./messageHandler.js";
import { register } from "node:module";
import { register as registerTsx } from "tsx/esm/api";
import { join } from "node:path";
import { pluginRoot } from "../../root.js";
import { deserializeRegExp } from "../../helpers/serializeUserOptions.js";
import type {
  HmrAcceptMessage,
  HmrUpdateMessage,
  ReadyMessage,
} from "../types.js";
import { toError } from "../../error/toError.js";
// Initialize worker
if (!parentPort) {
  throw new Error("This module must be run as a worker");
}

// In test mode, we want errors to propagate up immediately
const isTestEnv = process.env["VITEST"] || process.env["NODE_ENV"] === "test";
const isDevEnv = process.env["NODE_ENV"] !== "production";

try {
  // Deserialize workerData to restore RegExp objects
  if (workerData) {
    workerData.userOptions = deserializeRegExp(workerData.userOptions);
  }

  // Create channels for each loader
  const reactLoaderChannel = new MessageChannel();
  const cssLoaderChannel = new MessageChannel();
  const envLoaderChannel = new MessageChannel();

  // Set up message handlers before transferring ports
  reactLoaderChannel.port1.on("message", messageHandler);
  cssLoaderChannel.port1.on("message", messageHandler);
  envLoaderChannel.port1.on("message", messageHandler);

  const reactLoaderPath =
    "file://" + join(pluginRoot, "loader/react-loader.server.js");
  const cssLoaderPath =
    "file://" + join(pluginRoot, "loader/css-loader.development.js");
  const envLoaderPath =
    "file://" + join(pluginRoot, "loader/env-loader.development.js");

  // Register loaders with their ports
  register(reactLoaderPath, {
    parentURL: pluginRoot,
    data: {
      id: "react-loader",
      port: reactLoaderChannel.port2,
      userOptions: workerData.userOptions,
    },
    transferList: [reactLoaderChannel.port2],
  });
  register(cssLoaderPath, {
    parentURL: pluginRoot,
    data: {
      id: "css-loader",
      port: cssLoaderChannel.port2,
      resolvedConfig: workerData.resolvedConfig,
    },
    transferList: [cssLoaderChannel.port2],
  });

  // Register loaders
  registerTsx();

  // Register env-loader (ensure this the last)
  register(envLoaderPath, {
    parentURL: pluginRoot,
    data: {
      port: envLoaderChannel.port2,
      resolvedConfig: workerData.resolvedConfig,
    },
    transferList: [envLoaderChannel.port2],
  });

  // Set up message handling
  parentPort!.on("message", messageHandler);

  const { hmrPort } = workerData;
  if (hmrPort) {
    // Start the message port
    hmrPort.start();

    // Listen for HMR messages
    hmrPort.on("message", (message: any) => {
      if (message.type === "HMR_UPDATE") {
        // Invalidate the module in the worker
        parentPort!.postMessage({
          type: "HMR_UPDATE",
          id: message.id,
          routes: message.routes,
        } satisfies HmrUpdateMessage);
      } else if (message.type === "HMR_ACCEPT") {
        // Handle the update
        parentPort!.postMessage({
          type: "HMR_ACCEPT",
          id: message.id,
          routes: message.routes,
        } satisfies HmrAcceptMessage);
      }
    });
  }

  // Notify parent that we're ready
  parentPort!.postMessage({
    type: "READY",
    env: process.env["NODE_ENV"],
    pid: process.pid,
    id: "rsc-worker",
  } satisfies ReadyMessage);

  if (process.env["NODE_ENV"] === "production") {
    throw new Error("This module should not run in production mode.");
  }
} catch (error) {
  if (isDevEnv) {
    console.error(error);
  }
  // In dev mode, try to send error message before exiting
  if (parentPort) {
    parentPort?.postMessage({
      type: "ERROR",
      id: "rsc-worker",
      error: toError(error),
    });
  }
  if (!isDevEnv || isTestEnv) {
    // In test mode or production mode, just throw the error to fail fast
    throw error;
  }
}
