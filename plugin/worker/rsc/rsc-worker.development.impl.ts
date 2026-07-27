import { parentPort, workerData } from "node:worker_threads";
import { messageHandler } from "./messageHandler.server.js";
import { register as registerTsx } from "tsx/esm/api";
import type { ReadyMessage } from "../types.js";
import { createLogger } from "vite";
import { handleError } from "../../error/handleError.js";
import { sendMessage } from "../sendMessage.js";
import { setMaxListenersOnPort, unrefPort } from "../../stream/setMaxListeners.js";
import { ModuleRunner, ESModulesEvaluator } from "vite/module-runner";
import { createRunnerTransport } from "./createRunnerTransport.js";
import { setRunner, setRpc } from "./runnerInstance.js";

// Initialize worker
if (!parentPort) {
  throw new Error("This module must be run as a worker");
}

const logger = createLogger(workerData.resolvedConfig?.logLevel ?? "info", {
  prefix: "rsc-worker",
});

// parentPort handles all messages, so needs a higher limit
if (parentPort) {
  setMaxListenersOnPort(parentPort, 500);
}

parentPort?.on("message", messageHandler);

try {
  const isBuildMode =
    workerData.configEnv?.command === "build" ||
    workerData.resolvedConfig?.mode === "production";

  if (workerData.verbose) {
    logger.info(
      isBuildMode
        ? "Build mode detected - files are already built, skipping tsx hook"
        : "Development/dev server mode detected"
    );
  }

  // Dev only: the tsx hook covers the rare non-runner import path where a
  // module that isn't transformed by Vite (e.g. a vendored dependency that
  // ships .ts sources) still needs TypeScript stripping. Runner-loaded modules
  // receive code that's already been through Vite's transform.
  //
  // Never register it in build mode: everything the worker imports is built
  // JavaScript, and tsx's package-type lookup stops at the nearest
  // `node_modules` boundary. Modules Rollup emits under
  // `dist/server/node_modules/<pkg>/` have no package.json of their own, so tsx
  // reads them as CJS and their ESM named exports vanish at link time
  // ("does not provide an export named 'Css'" when a document wrapper imports
  // vite-plugin-react-server/components). Node's own resolution walks past that
  // boundary to the project's package.json and loads them as ESM.
  if (!isBuildMode) {
    registerTsx();
  }

  parentPort!.on("messageerror", (error: Error) => {
    logger.error("Parent port message serialization failed.", { error });
    // Can't send via parentPort since that's what failed, so just log
  });

  // ModuleRunner-based fetch transport for project source. Replaces Node's
  // native import() so dev:ssr invalidates per-module instead of restarting
  // the worker on every save.
  if (!isBuildMode && workerData.runnerPort) {
    try {
      setMaxListenersOnPort(workerData.runnerPort, 500);
      unrefPort(workerData.runnerPort);
      workerData.runnerPort.start();
      const { transport, rpc } = createRunnerTransport(workerData.runnerPort);
      const runner = new ModuleRunner(
        {
          transport,
          hmr: false,
          sourcemapInterceptor: false,
        },
        new ESModulesEvaluator()
      );
      setRunner(runner);
      setRpc(rpc);
      if (workerData.verbose) {
        logger.info("ModuleRunner initialized");
      }
    } catch (err) {
      logger.error(`Failed to initialize ModuleRunner: ${String(err)}`);
    }
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
