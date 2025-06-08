import { parentPort, MessageChannel, workerData } from "node:worker_threads";
import { messageHandler } from "./messageHandler.js";
import { register } from "node:module";
import { register as registerTsx } from "tsx/esm/api";
import { join } from "node:path";
import { pluginRoot } from "../../root.js";
import type {
  HmrAcceptMessage,
  ReadyMessage,
} from "../types.js";
import type { CssFileMessage, HmrUpdateMessage, InitializedEnvLoaderMessage, InitializedReactLoaderMessage, RscWorkerInputMessage } from "./types.js";
import { toError } from "../../error/toError.js";

// Initialize worker
if (!parentPort) {
  throw new Error("This module must be run as a worker");
}

// In test mode, we want errors to propagate up immediately
const isTestEnv = process.env["VITEST"] || process.env["NODE_ENV"] === "test";
const isDevEnv = process.env["NODE_ENV"] !== "production";
const verbose = workerData.verbose;

const developmentMessageHandler = (msg: RscWorkerInputMessage) => {
  if (verbose) {
    if (msg.type === "RSC_RENDER") {
      console.log(`[rsc-worker:${msg.type}] Render ${msg.pagePath}}`);
    } else {
      console.log(`[rsc-worker:${msg.type}] ${JSON.stringify(msg)}`);
    }
  }
  messageHandler(msg);
};

const developmentCssLoaderMessageHandler = (msg: CssFileMessage) => {
  if (verbose) {
    console.log(`[css-loader:${msg.type}] ${JSON.stringify(msg)}`);
  }
  messageHandler(msg);
};

const developmentEnvLoaderMessageHandler = (msg: InitializedEnvLoaderMessage) => {
  if (verbose) {
    console.log(`[env-loader:${msg.type}] ${JSON.stringify(msg)}`);
  }
  messageHandler(msg);
};

const developmentReactLoaderMessageHandler = (msg: InitializedReactLoaderMessage) => {
  if (verbose) {
    console.log(`[react-loader:${msg.type}] ${JSON.stringify(msg)}`);
  }
  messageHandler(msg);
};

try {
  // Create channels for each loader
  const reactLoaderChannel = new MessageChannel();
  const cssLoaderChannel = new MessageChannel();
  const envLoaderChannel = new MessageChannel();

  // Set up message handlers before transferring ports
  reactLoaderChannel.port2.on("message", developmentReactLoaderMessageHandler);
  cssLoaderChannel.port2.on("message", developmentCssLoaderMessageHandler);
  envLoaderChannel.port2.on("message", developmentEnvLoaderMessageHandler);

  const reactLoaderPath =
    "file://" + join(pluginRoot, "loader/react-loader.server.js");
  const cssLoaderPath =
    "file://" + join(pluginRoot, "loader/css-loader.development.js");
  const envLoaderPath =
    "file://" + join(pluginRoot, "loader/env-loader.development.js");

  register(cssLoaderPath, {
    parentURL: pluginRoot,
    data: {
      id: "css-loader",
      port: cssLoaderChannel.port1,
      userOptions: workerData.userOptions,
      resolvedConfig: workerData.resolvedConfig,
    },
    transferList: [cssLoaderChannel.port1],
  });

  // Register tsx
  registerTsx();

  // Register loaders with their ports
  register(reactLoaderPath, {
    parentURL: pluginRoot,
    data: {
      id: "react-loader",
      port: reactLoaderChannel.port1,
      userOptions: workerData.userOptions,
    },
    transferList: [reactLoaderChannel.port1],
  });

  // Register env-loader (ensure this the last)
  register(envLoaderPath, {
    parentURL: pluginRoot,
    data: {
      id: "env-loader",
      port: envLoaderChannel.port1,
      resolvedConfig: workerData.resolvedConfig,
    },
    transferList: [envLoaderChannel.port1],
  });

  // Set up message handling
  parentPort!.on("message", developmentMessageHandler);

  const { hmrPort } = workerData;
  if (hmrPort) {
    // Start the message port
    hmrPort.start();

    // Listen for HMR messages
    hmrPort.on("message", (message: RscWorkerInputMessage) => {
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
