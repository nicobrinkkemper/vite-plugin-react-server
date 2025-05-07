import { parentPort, MessageChannel, workerData } from "node:worker_threads";
import { messageHandler } from "./messageHandler.js";
import { register } from "node:module";
import { register as registerTsx } from "tsx/esm/api";
import { join } from "node:path";
import { pluginRoot } from "../../root.js";
// Initialize worker
if (!parentPort) {
  throw new Error("This module must be run as a worker");
}


// Create channels for each loader
const reactLoaderChannel = new MessageChannel();
const cssLoaderChannel = new MessageChannel();

// Listen for messages from loaders
reactLoaderChannel.port2.on("message", messageHandler);
cssLoaderChannel.port2.on("message", messageHandler);

const loaderPath = "file://" + join(pluginRoot, "loader/react-loader.js");
const cssLoaderPath =
  "file://" + join(pluginRoot, "loader/css-loader.development.js");

// Register react-loader
register(loaderPath, {
  parentURL: pluginRoot,
  data: { port: reactLoaderChannel.port1 },
  transferList: [reactLoaderChannel.port1],
});
register(cssLoaderPath, {
  parentURL: pluginRoot,
  data: { port: cssLoaderChannel.port1 },
  transferList: [cssLoaderChannel.port1],
});

// Register loaders
registerTsx();

// Set up message handling
parentPort!.on("message", messageHandler);

const { hmrPort } = workerData;
if (hmrPort) {
  console.log("[RSC Worker] Setting up HMR listeners in server mode");

  // Start the message port
  hmrPort.start();

  // Listen for file changes
  hmrPort.on("message", (message: any) => {
    console.log("[RSC Worker] HMR message received:", message);
    if (message.type === "HMR_UPDATE") {
      console.log("[RSC Worker] File changed:", message.path);
      // Invalidate the module in the worker
      parentPort!.postMessage({
        type: "HMR_UPDATE",
        path: message.path,
      });
    }
  });

  // Listen for HMR updates
  hmrPort.on("message", (message: any) => {
    console.log("[RSC Worker] HMR update received:", message);
    // Handle the update
    parentPort!.postMessage({
      type: "HMR_ACCEPT",
      path: message.path,
    });
  });
} else {
  console.log(
    "[RSC Worker] HMR not enabled - running in client mode or no HMR emitter",
    { workerData }
  );
}

// Notify parent that we're ready
parentPort!.postMessage({
  type: "READY",
  env: process.env["NODE_ENV"],
});

if (process.env["NODE_ENV"] !== "development") {
  throw new Error("This module must be run in development mode");
}
