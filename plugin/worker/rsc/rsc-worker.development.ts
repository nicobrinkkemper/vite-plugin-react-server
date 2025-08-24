import { parentPort, MessageChannel, workerData } from "node:worker_threads";
import { messageHandler } from "./messageHandler.js";
import { register } from "node:module";
import { register as registerTsx } from "tsx/esm/api";
import { resolve } from "node:path";
import { pluginRoot } from "../../root.js";
import type { HmrAcceptMessage, ReadyMessage } from "../types.js";
import type {
  CssFileMessage,
  HmrUpdateMessage,
  InitializedEnvLoaderMessage,
  InitializedReactLoaderMessage,
  RscWorkerInputMessage,
} from "./types.js";
import { DEFAULT_CONFIG } from "../../config/defaults.js";
import { createLogger } from "vite";
import { handleError } from "../../error/handleError.js";
import { sendMessage } from "../sendMessage.js";

// Initialize worker
if (!parentPort) {
  throw new Error("This module must be run as a worker");
}

// In test mode, we want errors to propagate up immediately
const verbose = workerData.verbose;
const logger = createLogger(workerData.resolvedConfig.logLevel, {
  prefix: "rsc-worker",
});
const developmentMessageHandler = (msg: RscWorkerInputMessage) => {
  if (verbose) {
    if (msg.type === "RSC_RENDER") {
      logger.info(`Render ${msg.pagePath}}`);
    } else {
      logger.info(`RscWorker: ${JSON.stringify(msg)}`);
    }
  }
  messageHandler(msg);
};

const developmentCssLoaderMessageHandler = (msg: CssFileMessage) => {
  if (verbose) {
    logger.info(`CssLoader: ${JSON.stringify(msg)}`);
  }
  messageHandler(msg);
};

const developmentEnvLoaderMessageHandler = (
  msg: InitializedEnvLoaderMessage
) => {
  if (verbose) {
    logger.info(`EnvLoader: ${JSON.stringify(msg)}`);
  }
  messageHandler(msg);
};

const developmentReactLoaderMessageHandler = (
  msg: InitializedReactLoaderMessage
) => {
  if (verbose) {
    logger.info(`${JSON.stringify(msg)}`);
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
    logger.error("React loader message serialization failed.", { error });
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
    logger.error("CSS loader message serialization failed.", { error });
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
    logger.error("Env loader message serialization failed.", { error });
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

  // Use projectRoot for loader paths, fallback to resolvedConfig.root
  const projectRoot = workerData.userOptions.projectRoot || workerData.resolvedConfig.root;
  
  const reactLoaderPath =
    "file://" +
    (workerData.userOptions.reactLoaderPath
      ? resolve(
          projectRoot,
          workerData.userOptions.reactLoaderPath
        )
      : resolve(
          projectRoot,
          DEFAULT_CONFIG.REACT_LOADER_PATH
        ));
  const cssLoaderPath =
    "file://" +
    (workerData.userOptions.cssLoaderPath
      ? resolve(
          projectRoot,
          workerData.userOptions.cssLoaderPath
        )
      : resolve(
          projectRoot,
          DEFAULT_CONFIG.CSS_LOADER_PATH
        ));
  const envLoaderPath =
    "file://" +
    (workerData.userOptions.envLoaderPath
      ? resolve(
          projectRoot,
          workerData.userOptions.envLoaderPath
        )
      : resolve(
          projectRoot,
          DEFAULT_CONFIG.ENV_LOADER_PATH
        ));

  try {
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
  } catch (e) {
    const handledError = handleError({
      error: e,
      logger,
      panicThreshold: workerData.userOptions.panicThreshold,
      context: `register(${cssLoaderPath})`,
    });
    if (handledError != null) throw handledError;
  }

  // Register tsx
  registerTsx();

  try {
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
  } catch (e) {
    const handledError = handleError({
      error: e,
      logger,
      panicThreshold: workerData.userOptions.panicThreshold,
      context: `register(${reactLoaderPath})`,
    });
    if (handledError != null) throw handledError;
  }

  // Register env-loader (ensure this the last)
  try {
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
  } catch (e) {
    const handledError = handleError({
      error: e,
      logger,
      panicThreshold: workerData.userOptions.panicThreshold,
      context: `register(${envLoaderPath})`,
    });
    if (handledError != null) throw handledError;
  }

  // Set up message handling
  parentPort!.on("message", developmentMessageHandler);
  parentPort!.on("messageerror", (error: Error) => {
    console.error(
      "[rsc-worker] Parent port message serialization failed:",
      error
    );
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
      logger.error("HMR port message serialization failed.", { error });
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
  const handledError = handleError({
    error,
    logger,
    panicThreshold: workerData.userOptions.panicThreshold,
    context: "rsc-worker",
  });
  // In dev mode, try to send error message before exiting
  if (parentPort && handledError != null) {
    sendMessage({
      type: "ERROR",
      id: "rsc-worker",
      error: handledError,
    }, parentPort);
  }
}
