import { parentPort, MessageChannel, workerData } from "node:worker_threads";
import { messageHandler } from "./messageHandler.js";
import { register } from "node:module";
import { register as registerTsx } from "tsx/esm/api";
import { join } from "node:path";
import { pluginRoot } from "../../root.js";
import { deserializeRegExp } from "../../helpers/serializeUserOptions.js";
import type { HmrAcceptMessage, HmrUpdateMessage, ReadyMessage } from "../types.js";

// Initialize worker
if (!parentPort) {
  throw new Error("This module must be run as a worker");
}

// Deserialize workerData to restore RegExp objects
if (workerData) {
  workerData.userOptions = deserializeRegExp(workerData.userOptions);
}

// Create channels for each loader
const reactLoaderChannel = new MessageChannel();
const cssLoaderChannel = new MessageChannel();
const envLoaderChannel = new MessageChannel();


// Listen for messages from loaders
reactLoaderChannel.port2.on("message", messageHandler);
cssLoaderChannel.port2.on("message", messageHandler);
envLoaderChannel.port2.on("message", messageHandler);

const loaderPath = "file://" + join(pluginRoot, "loader/react-loader.server.js");
const cssLoaderPath =
  "file://" + join(pluginRoot, "loader/css-loader.development.js");
const envLoaderPath =
  "file://" + join(pluginRoot, "loader/env-loader.development.js");

register(loaderPath, {
  parentURL: pluginRoot,
  data: { port: reactLoaderChannel.port1},
  transferList: [reactLoaderChannel.port1],
});
register(cssLoaderPath, {
  parentURL: pluginRoot,
  data: { port: cssLoaderChannel.port1, resolvedConfig: workerData.resolvedConfig },
  transferList: [cssLoaderChannel.port1],
});

// Register loaders
registerTsx();

// Register env-loader (ensure this the last)
register(envLoaderPath, {
  parentURL: pluginRoot,
  data: { port: envLoaderChannel.port1, resolvedConfig: workerData.resolvedConfig },
  transferList: [envLoaderChannel.port1],
});
// Set up message handling
parentPort!.on("message", messageHandler);

const { hmrPort } = workerData;
if (hmrPort) {
  // Start the message port
  hmrPort.start();

  // Listen for file changes
  hmrPort.on("message", (message: any) => {
    if (message.type === "HMR_UPDATE") {
      // Invalidate the module in the worker
      parentPort!.postMessage({
        type: "HMR_UPDATE",
        id: message.id,
        routes: message.routes,
      } satisfies HmrUpdateMessage);
    }
  });

  // Listen for HMR updates
  hmrPort.on("message", (message: any) => {
    // Handle the update
    parentPort!.postMessage({
      type: "HMR_ACCEPT",
      id: message.id,
      routes: message.routes,
    } satisfies HmrAcceptMessage);
  });
}

// Notify parent that we're ready
parentPort!.postMessage({
  type: "READY",
  env: process.env["NODE_ENV"],
  pid: process.pid,
  id: "rsc-worker"
} satisfies ReadyMessage);

if (process.env["NODE_ENV"] === "production") {
  throw new Error("This module should not run in production mode.");
}
