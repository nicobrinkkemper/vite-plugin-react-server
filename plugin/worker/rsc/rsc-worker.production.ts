// Check environment before any imports
if (process.env["NODE_ENV"] !== "production") {
  process.exit(1);
}

import { parentPort, MessageChannel } from "node:worker_threads";
import { messageHandler } from "./messageHandler.js";
import { register } from "node:module";
import { join } from "node:path";
import { pluginRoot } from "../../root.js";

if (!parentPort) {
  throw new Error("This module must be run as a worker");
}

// Create channels for each loader
const reactLoaderChannel = new MessageChannel();
const cssLoaderChannel = new MessageChannel();
const envLoaderChannel = new MessageChannel();

// Register loaders
register(join(pluginRoot, "worker/env-loader.js"), {
  parentURL: import.meta.url,
  data: { port: envLoaderChannel.port2 },
  transferList: [envLoaderChannel.port2],
});

// Listen for messages from loaders
reactLoaderChannel.port2.on("message", messageHandler);
cssLoaderChannel.port2.on("message", messageHandler);
envLoaderChannel.port2.on("message", messageHandler);

// Handle incoming messages
parentPort.on("message", messageHandler);

// Signal ready
parentPort.postMessage({ type: "READY", env: process.env["NODE_ENV"] });
