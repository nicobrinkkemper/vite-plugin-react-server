import { parentPort, MessageChannel, workerData } from "node:worker_threads";
import { messageHandler } from "./messageHandler.server.js";
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
import { setMaxListenersOnPort, unrefPort } from "../../stream/setMaxListeners.js";

// Initialize worker
if (!parentPort) {
  throw new Error("This module must be run as a worker");
}

// In test mode, we want errors to propagate up immediately
const logger = createLogger(workerData.resolvedConfig?.logLevel ?? "info", {
  prefix: "rsc-worker",
});
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
  const isBuildMode = workerData.configEnv?.command === "build"
  

  
  if (isBuildMode) {
    logger.info("Build mode detected - skipping loader registration since files are already built");
  } else {
    logger.info("Development/test mode detected - registering loaders for source file processing");
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

    envLoaderChannel.port2.on("message", envLoaderMessageHandler);
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
  }

  const root = workerData.userOptions?.projectRoot || workerData.resolvedConfig?.root || process.cwd();

  const reactLoaderPath =
    "file://" +
    (workerData.userOptions.reactLoaderPath
      ? resolve(
          root,
          workerData.userOptions.reactLoaderPath
        )
      : resolve(
          root,
          DEFAULT_CONFIG.REACT_LOADER_PATH
        ));
  logger.info(`Using reactLoaderPath: ${reactLoaderPath}`);
  const cssLoaderPath =
    "file://" +
    (workerData.userOptions.cssLoaderPath
      ? resolve(
          root,
          workerData.userOptions.cssLoaderPath
        )
      : resolve(  
          root,
          DEFAULT_CONFIG.CSS_LOADER_PATH
        ));
  const envLoaderPath =
    "file://" +
    (workerData.userOptions.envLoaderPath
      ? resolve(
          root,
          workerData.userOptions.envLoaderPath
        )
      : resolve(
          root,
          DEFAULT_CONFIG.ENV_LOADER_PATH
        ));

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
    } catch (err) {
      const handledError = handleError({
        error: err,
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
    } catch (err) {
      const handledError = handleError({
        error: err,
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
    } catch (err) {
      const handledError = handleError({
        error: err,
        logger,
        panicThreshold: workerData.userOptions.panicThreshold,
        context: `register(${envLoaderPath})`,
      });
      if (handledError != null) throw handledError;
    }
  } else {
    // Build mode: register nothing. Everything the worker imports is built
    // JavaScript, and the tsx hook actively breaks it — tsx's package-type
    // lookup stops at the nearest `node_modules` boundary, so the modules
    // Rollup emits under `dist/server/node_modules/<pkg>/` (no package.json of
    // their own) are read as CJS and their ESM named exports vanish at link
    // time. That is what made a document wrapper importing
    // vite-plugin-react-server/components fail with "does not provide an export
    // named 'Css'" and degrade every route to an <html>-less fragment. Node's
    // own resolution walks past that boundary to the project's package.json and
    // loads them as ESM.
  }

  // Increase max listeners on parentPort to prevent warnings
  setMaxListenersOnPort(parentPort, 500);

  // Handle all messages through the unified messageHandler
  parentPort!.on("message", messageHandler);
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
    id: "worker/rsc",
  } satisfies ReadyMessage);

  if (process.env["NODE_ENV"] === "production") {
    throw new Error("This module should not run in production mode.");
  }
} catch (err) {
  const handledError = handleError({
    error: err,
    logger,
    panicThreshold: workerData.userOptions.panicThreshold,
    context: "rsc-worker",
  });
  // In dev mode, try to send error message before exiting
  if (parentPort && handledError != null) {
    sendMessage({
      type: "ERROR",
      id: "worker/rsc",
      error: handledError,
    }, parentPort);
  }
}
