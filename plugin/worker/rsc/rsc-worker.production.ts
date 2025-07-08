import { parentPort, MessageChannel, workerData } from "node:worker_threads";
import { messageHandler } from "./messageHandler.js";
import { register } from "node:module";
import { resolve } from "node:path";
import { pluginRoot } from "../../root.js";
import { DEFAULT_CONFIG } from "../../config/defaults.js";
import type { ReadyMessage } from "../types.js";

if (!parentPort) {
  throw new Error("This module must be run as a worker");
}

// Create channels for each loader
const reactLoaderChannel = new MessageChannel();
const cssLoaderChannel = new MessageChannel();
const envLoaderChannel = new MessageChannel();

// Set up message handlers
reactLoaderChannel.port2.on("message", messageHandler);
cssLoaderChannel.port2.on("message", messageHandler);
envLoaderChannel.port2.on("message", messageHandler);

// Determine loader paths
const reactLoaderPath =
  "file://" +
  (workerData.userOptions.reactLoaderPath
    ? resolve(workerData.resolvedConfig.root, workerData.userOptions.reactLoaderPath)
    : resolve(workerData.resolvedConfig.root, DEFAULT_CONFIG.REACT_LOADER_PATH));
const cssLoaderPath =
  "file://" +
  (workerData.userOptions.cssLoaderPath
    ? resolve(workerData.resolvedConfig.root, workerData.userOptions.cssLoaderPath)
    : resolve(workerData.resolvedConfig.root, DEFAULT_CONFIG.CSS_LOADER_PATH));
const envLoaderPath =
  "file://" +
  (workerData.userOptions.envLoaderPath
    ? resolve(workerData.resolvedConfig.root, workerData.userOptions.envLoaderPath)
    : resolve(workerData.resolvedConfig.root, DEFAULT_CONFIG.ENV_LOADER_PATH));

// Register CSS loader
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

// Register React loader
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

// Register env-loader (ensure this is last)
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

// Handle incoming messages
parentPort.on("message", messageHandler);

// Signal ready
parentPort.postMessage({ type: "READY", id: "rsc-worker", env: process.env["NODE_ENV"], pid: process.pid } satisfies ReadyMessage);
