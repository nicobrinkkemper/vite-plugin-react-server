import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { Writable } from "node:stream";
import { parentPort } from "node:worker_threads";
import type { PipeableStream } from "react-server-dom-esm/server.node";
import { createHtmlStream } from "./createHtmlStream.js";
import type { RenderState, WorkerMessage } from "./types.js";

if (!parentPort) {
  throw new Error("This module must be run as a worker");
}

declare global {
  interface Window {
    href: string;
  }
} 
// Initialize happy-dom window
(global as any).window = {
  href: undefined,
  pathname: undefined,
}

// Track active renders
const activeRenders = new Map<string, RenderState>();
const activeStreams = new Map<string, PipeableStream>();
const activeWrites = new Map<string, Writable>();

async function shutdown() {
  console.log("[Worker] Shutting down forcefully");
  while (activeRenders.size > 0) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  for (const stream of activeStreams.values()) {
    stream.abort();
  }
  for (const writeStream of activeWrites.values()) {
    writeStream.destroy();
  }
  process.exit(0);
}
// Handle incoming messages
parentPort.on("message", async (message: WorkerMessage) => {
  if (message.type === "SHUTDOWN") {
    await shutdown();
  }
  if (!parentPort) {
    throw new Error("No parent port available");
  }
  try {
    switch (message.type) {
      case "RSC_CHUNK": {
        const { chunk, id, ...rest } = message;
        (global as any).window.pathname = id;
        // Skip if already rendered
        let renderState = activeRenders.get(id);
        if (renderState?.rendered) {
          return;
        }
        // Initialize render state
        if (!renderState) {
          renderState = {
            chunks: [],
            complete: false,
            rendered: false,
            id: id,
            ...rest,
          };
          activeRenders.set(id, renderState);
        }
        // Add chunk
        if (chunk) renderState.chunks.push(chunk);
        break;
      }

      case "RSC_END": {
        const { id } = message;
        const render = activeRenders.get(id);

        if (!render || !parentPort || render.rendered) return;
        try {
          const writeToFile = render.outDir && render.htmlOutputPath;
          // Write RSC content
          if (writeToFile) {
            await mkdir(dirname(render.htmlOutputPath), { recursive: true });
          }
          const { stream, writeStream } = createHtmlStream(
            render,
            writeToFile
              ? createWriteStream(render.htmlOutputPath)
              : new Writable({
                  write(chunk, _, callback) {
                    parentPort?.postMessage({
                      type: "HTML",
                      route: render.id,
                      content: chunk.toString(),
                    });
                    callback();
                  },
                })
          );
          activeStreams.set(id, stream);
          activeWrites.set(id, writeStream);
          writeStream.on("finish", () => {
            activeStreams.delete(id);
            activeWrites.delete(id);
          });
          writeStream.on("error", () => {
            activeStreams.delete(id);
            activeWrites.delete(id);
            stream.abort();
          });
        } catch (error) {
          activeRenders.delete(id);
          activeStreams.delete(id);
          activeWrites.delete(id);
          throw error;
        } finally {
          activeRenders.delete(id);
        }
        break;
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    parentPort?.postMessage({
      type: "ERROR",
      error: errorMessage,
    });
  }
});

// Signal ready only after loader is registered
parentPort.postMessage({ type: "READY" });

