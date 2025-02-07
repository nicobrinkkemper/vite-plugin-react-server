import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { Writable } from "node:stream";
import { parentPort } from "node:worker_threads";
import {
  renderToPipeableStream,
  registerClientReference,
  registerServerReference
  // @ts-ignore
} from "react-server-dom-esm/server.node";

import type { RenderState,  RscWorkerMessage } from "./types.js";

if (!parentPort) {
  throw new Error("This module must be run as a worker");
}

// Track active renders
const activeRenders = new Map<string, RenderState>();
const activeStreams = new Map<string, ReturnType<typeof renderToPipeableStream>>();
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

// Handle incoming messages
parentPort.on("message", async (message: RscWorkerMessage) => {
  if (message.type === "SHUTDOWN") {
    await shutdown();
    return;
  }

  try {
    switch (message.type) {
      case "RSC_RENDER": {
        const { id, component, props, outDir } = message;
        
        // Skip if already rendered
        if (activeRenders.has(id)) return;

        const rscPath = `${outDir}/${id}.rsc`;
        await mkdir(dirname(rscPath), { recursive: true });
        const writeStream = createWriteStream(rscPath);

        const stream = renderToPipeableStream(component, {
          onShellReady() {
            stream.pipe(writeStream);
          },
          onAllReady() {
            parentPort?.postMessage({
              type: "RSC_COMPLETE",
              id,
              path: rscPath
            });
          },
          onError(error: unknown) {
            parentPort?.postMessage({
              type: "ERROR",
              error: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined,
              id
            });
          }
        });

        activeStreams.set(id, stream);
        activeWrites.set(id, writeStream);
        break;
      }

      case "RSC_END": {
        const { id } = message;
        activeStreams.delete(id);
        activeWrites.delete(id);
        break;
      }
      case "CLIENT_REFERENCE": {
        const { id, location, key } = message;
        const ref = registerClientReference(id, location, key);
        parentPort?.postMessage({
          type: "CLIENT_REFERENCE",
          ref: ref
        });
        break;
      }
      case "SERVER_REFERENCE": {
        const { id, location, key } = message;
        const ref = registerServerReference(id, location, key);
        parentPort?.postMessage({
          type: "SERVER_REFERENCE",
          ref: ref
        });
        break;
      }
    }
  } catch (error) {
    parentPort?.postMessage({
      type: "ERROR",
      error: String(error)
    });
  }
});

// Signal ready
parentPort.postMessage({ type: "READY" });
