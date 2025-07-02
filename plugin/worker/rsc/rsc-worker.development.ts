import { parentPort, MessageChannel, workerData } from "node:worker_threads";
import { messageHandler } from "./messageHandler.js";
import { register } from "node:module";
import { register as registerTsx } from "tsx/esm/api";
import { join } from "node:path";
import { pluginRoot } from "../../root.js";
import type { HmrAcceptMessage, ReadyMessage } from "../types.js";
import type {
  CssFileMessage,
  HmrUpdateMessage,
  InitializedEnvLoaderMessage,
  InitializedReactLoaderMessage,
  RscWorkerInputMessage,
} from "./types.js";
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

const developmentEnvLoaderMessageHandler = (
  msg: InitializedEnvLoaderMessage
) => {
  if (verbose) {
    console.log(`[env-loader:${msg.type}] ${JSON.stringify(msg)}`);
  }
  messageHandler(msg);
};

const developmentReactLoaderMessageHandler = (
  msg: InitializedReactLoaderMessage
) => {
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
  reactLoaderChannel.port2.on("messageerror", (error: Error) => {
    console.error("[rsc-worker] React loader message serialization failed:", error);
    if (parentPort) {
      parentPort.postMessage({
        type: "ERROR",
        id: "react-loader",
        error: {
          message: "Message serialization failed in react loader",
          name: "MessageError",
          stack: undefined,
        },
      });
    }
  });
  
  cssLoaderChannel.port2.on("message", developmentCssLoaderMessageHandler);
  cssLoaderChannel.port2.on("messageerror", (error: Error) => {
    console.error("[rsc-worker] CSS loader message serialization failed:", error);
    if (parentPort) {
      parentPort.postMessage({
        type: "ERROR",
        id: "css-loader",
        error: {
          message: "Message serialization failed in CSS loader",
          name: "MessageError",
          stack: undefined,
        },
      });
    }
  });
  
  envLoaderChannel.port2.on("message", developmentEnvLoaderMessageHandler);
  envLoaderChannel.port2.on("messageerror", (error: Error) => {
    console.error("[rsc-worker] Env loader message serialization failed:", error);
    if (parentPort) {
      parentPort.postMessage({
        type: "ERROR",
        id: "env-loader",
        error: {
          message: "Message serialization failed in env loader",
          name: "MessageError",
          stack: undefined,
        },
      });
    }
  });

  const reactLoaderPath =
    "file://" +
    (workerData.userOptions.reactLoaderPath
      ? join(workerData.resolvedConfig.root, workerData.userOptions.reactLoaderPath)
      : join(pluginRoot, "loader/react-loader.js"));
  const cssLoaderPath =
    "file://" +
    (workerData.userOptions.cssLoaderPath
      ? join(workerData.resolvedConfig.root, workerData.userOptions.cssLoaderPath)
      : join(pluginRoot, "loader/css-loader.development.js"));
  const envLoaderPath =
    "file://" +
    (workerData.userOptions.envLoaderPath
      ? join(workerData.resolvedConfig.root, workerData.userOptions.envLoaderPath)
      : join(pluginRoot, "loader/env-loader.development.js"));

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
      resolvedConfig: workerData.resolvedConfig,
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
      userOptions: workerData.userOptions,
    },
    transferList: [envLoaderChannel.port1],
  });

  // Set up message handling
  parentPort!.on("message", developmentMessageHandler);
  parentPort!.on("messageerror", (error: Error) => {
    console.error("[rsc-worker] Parent port message serialization failed:", error);
    // Can't send via parentPort since that's what failed, so just log
  });

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
    
    // Handle HMR port message errors
    hmrPort.on("messageerror", (error: Error) => {
      console.error("[rsc-worker] HMR port message serialization failed:", error);
      if (parentPort) {
        parentPort.postMessage({
          type: "ERROR",
          id: "hmr-port",
          error: {
            message: "Message serialization failed in HMR port",
            name: "MessageError",
            stack: undefined,
          },
        });
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
} catch (error: unknown) {
  if (isDevEnv) {
    console.error(error);
  }
  // In dev mode, try to send error message before exiting
  if (parentPort) {
    const err = toError(error);
    parentPort?.postMessage({
      type: "ERROR",
      id: "rsc-worker",
      error: {
        message: err.message,
        stack: err.stack,
        name: err.name,
      },
    });
  }
  if (!isDevEnv || isTestEnv) {
    // In test mode or production mode, just throw the error to fail fast
    throw error;
  }
}
