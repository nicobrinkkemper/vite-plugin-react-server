import { join } from "node:path";
import { messageHandler } from "./messageHandler.js";
import { MessageChannel, parentPort } from "node:worker_threads";
import { pluginRoot } from "../../root.js";
import { register } from "node:module";
import type { ReadyMessage } from "../types.js";

// Create channels for each loader
const cssLoaderChannel = new MessageChannel();

cssLoaderChannel.port2.on("message", messageHandler);

const cssLoaderPath = "file://" + join(pluginRoot, "loader/css-loader.production.js");

register(cssLoaderPath, {
  parentURL: pluginRoot,
  data: { port: cssLoaderChannel.port1 },
  transferList: [cssLoaderChannel.port1],
});


// Signal ready with environment
parentPort?.on("message", messageHandler);
parentPort?.postMessage({
  type: "READY",
  env: process.env["NODE_ENV"],
  pid: process.pid,
} satisfies ReadyMessage);