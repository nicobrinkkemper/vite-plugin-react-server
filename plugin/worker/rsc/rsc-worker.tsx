import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { Writable } from "node:stream";
import { parentPort } from "node:worker_threads";
import {
  registerClientReference,
  registerServerReference
  // @ts-ignore
} from "react-server-dom-esm/server.node";

import type { 
  RscRenderState, 
  RscWorkerMessage,
  RscWorkerResponse 
} from "../types.js";
import { createRscStream } from "./createRscStream.js";

if (!parentPort) {
  throw new Error("This module must be run as a worker");
}

// Track active renders
const activeRenders = new Map<string, RscRenderState>();
const activeStreams = new Map<string, ReturnType<typeof createRscStream>>();
const activeWrites = new Map<string, Writable>();

async function shutdown() {
  console.log("[RSC Worker] Shutting down forcefully");
  for (const stream of activeStreams.values()) {
    stream.abort();
  }
  for (const writeStream of activeWrites.values()) {
    writeStream.destroy();
  }
  process.exit(0);
}

function sendMessage(message: RscWorkerResponse) {
  parentPort?.postMessage(message);
}

// Handle incoming messages
parentPort.on("message", async (message: RscWorkerMessage) => {
  if (message.type === "SHUTDOWN") {
    await shutdown();
    return;
  }

  try {
    switch (message.type) {
      case "RSC_RENDER": {
        const { id, pageImport, propsImport, outDir, moduleRootPath, moduleBaseURL, pipableStreamOptions } = message;
        
        // Skip if already rendered
        if (activeRenders.has(id)) return;

        // Create render state
        const renderState: RscRenderState = {
          id,
          outDir,
          moduleRootPath,
          moduleBaseURL,
          rscOutputPath: `${outDir}/${id}.rsc`,
          componentImport: pageImport,
          propsImport,
          pipableStreamOptions
        };

        // Ensure output directory exists
        await mkdir(dirname(renderState.rscOutputPath), { recursive: true });
        const writeStream = createWriteStream(renderState.rscOutputPath);

        // Create stream
        const stream = createRscStream(renderState, writeStream, parentPort);

        // Track active streams
        activeRenders.set(id, renderState);
        activeStreams.set(id, stream);
        activeWrites.set(id, writeStream);
        break;
      }

      case "RSC_END": {
        const { id } = message;
        activeRenders.delete(id);
        activeStreams.delete(id);
        activeWrites.delete(id);
        break;
      }

      case "CLIENT_REFERENCE": {
        const { id, location, key } = message;
        const ref = registerClientReference(id, location, key);
        sendMessage({
          type: "CLIENT_REFERENCE",
          id,
          location,
          key,
          ref
        });
        break;
      }

      case "SERVER_REFERENCE": {
        const { id, location, key } = message;
        const ref = registerServerReference(id, location, key);
        sendMessage({
          type: "SERVER_REFERENCE",
          id,
          location,
          key,
          ref
        });
        break;
      }
    }
  } catch (error) {
    sendMessage({
      type: "ERROR",
      id: message.type === "RSC_RENDER" ? message.id : "",
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Signal ready
parentPort.postMessage({ type: "READY" });
