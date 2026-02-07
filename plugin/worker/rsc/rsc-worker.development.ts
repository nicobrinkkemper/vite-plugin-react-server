import { parentPort, MessageChannel, workerData } from "node:worker_threads";
import { messageHandler } from "./messageHandler.js";
import { register } from "node:module";
import { register as registerTsx } from "tsx/esm/api";
import { resolve } from "node:path";
import { pluginRoot } from "../../root.js";
import type { ReadyMessage } from "../types.js";
import type {
  CssFileMessage,
  InitializedEnvLoaderMessage,
  InitializedReactLoaderMessage,
} from "./types.js";
import { DEFAULT_CONFIG } from "../../config/defaults.js";
import { createLogger } from "vite";
import { handleError } from "../../error/handleError.js";
import { sendMessage } from "../sendMessage.js";
import { serializeError } from "../../error/serializeError.js";
import { setMaxListenersOnPort, unrefPort } from "../../stream/setMaxListeners.js";

// Initialize worker
if (!parentPort) {
  throw new Error("This module must be run as a worker");
}

// In test mode, we want errors to propagate up immediately
const logger = createLogger(workerData.resolvedConfig?.logLevel ?? "info", {
  prefix: "rsc-worker",
});

// Increase max listeners on parentPort to prevent warnings
// parentPort handles all messages, so needs a higher limit
if (parentPort) {
  setMaxListenersOnPort(parentPort, 500);
}

// Handle all messages through the unified messageHandler
parentPort?.on("message", messageHandler);

// Set up loader message handlers
const cssLoaderMessageHandler = (msg: CssFileMessage) => {
  messageHandler(msg);
};

const envLoaderMessageHandler = (msg: InitializedEnvLoaderMessage) => {
  messageHandler(msg);
};

const reactLoaderMessageHandler = (msg: InitializedReactLoaderMessage) => {
  messageHandler(msg);
};

try {
  // Check if we're in build mode - if so, skip loader registration since files are already built
  const isBuildMode =
    workerData.configEnv?.command === "build" ||
    workerData.resolvedConfig?.mode === "production";
  const isDevServerMode = workerData.configEnv?.command === "serve";

  if (workerData.verbose) {
    if (isBuildMode) {
      logger.info(
        "Build mode detected - skipping loader registration since files are already built"
      );
    } else if (isDevServerMode) {
      logger.info(
        "Development/dev server mode detected - registering loaders for source file processing"
      );
    }
  }

  // Create channels for each loader
  const reactLoaderChannel = new MessageChannel();
  const cssLoaderChannel = new MessageChannel();
  const envLoaderChannel = new MessageChannel();
  
  // Increase max listeners to prevent warnings during development
  setMaxListenersOnPort(reactLoaderChannel.port1, 500);
  setMaxListenersOnPort(reactLoaderChannel.port2, 500);
  setMaxListenersOnPort(cssLoaderChannel.port1, 500);
  setMaxListenersOnPort(cssLoaderChannel.port2, 500);
  setMaxListenersOnPort(envLoaderChannel.port1, 500);
  setMaxListenersOnPort(envLoaderChannel.port2, 500);

  // Unref all ports so they don't keep the event loop alive
  unrefPort(reactLoaderChannel.port1);
  unrefPort(reactLoaderChannel.port2);
  unrefPort(cssLoaderChannel.port1);
  unrefPort(cssLoaderChannel.port2);
  unrefPort(envLoaderChannel.port1);
  unrefPort(envLoaderChannel.port2);

  // Set up message handlers before transferring ports (only needed if not in build mode)
  if (!isBuildMode) {
    reactLoaderChannel.port2.on("message", reactLoaderMessageHandler);
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

    cssLoaderChannel.port2.on("message", cssLoaderMessageHandler);
    cssLoaderChannel.port2.on("messageerror", (error) => {
      logger.error("CSS loader message serialization failed.", { error });
      if (parentPort) {
        parentPort.postMessage({
          type: "ERROR",
          id: "css-loader",
          error: serializeError(error),
        });
      }
    });

    envLoaderChannel.port2.on("message", envLoaderMessageHandler);
    envLoaderChannel.port2.on("messageerror", (error) => {
      logger.error("Env loader message serialization failed.", { error });
      if (parentPort) {
        parentPort.postMessage({
          type: "ERROR",
          id: "env-loader",
          error: serializeError(error),
        });
      }
    });
  }

  // Use projectRoot for loader paths, fallback to resolvedConfig.root
  const projectRoot =
    workerData.userOptions?.projectRoot || workerData.resolvedConfig?.root;

  const reactLoaderPath =
    "file://" +
    (workerData.userOptions.reactLoaderPath
      ? resolve(projectRoot, workerData.userOptions.reactLoaderPath)
      : resolve(projectRoot, DEFAULT_CONFIG.REACT_LOADER_PATH));
  const cssLoaderPath =
    "file://" +
    (workerData.userOptions.cssLoaderPath
      ? resolve(projectRoot, workerData.userOptions.cssLoaderPath)
      : resolve(projectRoot, DEFAULT_CONFIG.CSS_LOADER_PATH));
  const envLoaderPath =
    "file://" +
    (workerData.userOptions.envLoaderPath
      ? resolve(projectRoot, workerData.userOptions.envLoaderPath)
      : resolve(projectRoot, DEFAULT_CONFIG.ENV_LOADER_PATH));

  // Only register loaders if not in build mode
  if (!isBuildMode) {
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
  } else {
    // In build mode, just register tsx for basic TypeScript support
    registerTsx();
  }

  parentPort!.on("messageerror", (error: Error) => {
    logger.error("Parent port message serialization failed.", { error });
    // Can't send via parentPort since that's what failed, so just log
  });

  // HMR port handling is disabled in dev server mode to avoid DataCloneError
  // TODO: Re-enable HMR when transfer list issues are resolved

  // Notify parent that we're ready
  parentPort!.postMessage({
    type: "READY",
    env: process.env["NODE_ENV"],
    pid: process.pid,
    id: "worker/rsc",
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
    sendMessage(
      {
        type: "ERROR",
        id: "worker/rsc",
        error: handledError,
      },
      parentPort
    );
  }
}
