import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { Writable } from "node:stream";
import { parentPort } from "node:worker_threads";

import { createHtmlStream } from "./createHtmlStream.js";
import type { RenderState, HtmlWorkerMessage } from "./types.js";
import type { PipeableStream } from "react-dom/server";

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

console.log("[html-worker] Worker starting...");

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
parentPort.on("message", async (message: HtmlWorkerMessage) => {
  console.log("[html-worker] Received message:", message.type);
  if (message.type === "SHUTDOWN") {
    await shutdown();
  }
  if (!parentPort) {
    throw new Error("No parent port available");
  }
  try {
    switch (message.type) {
      case "RSC_CHUNK": {
        console.log("[html-worker] Processing RSC chunk for:", message.id);
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
        console.log("[html-worker] Processing RSC end for:", message.id);
        const { id } = message;
        const render = activeRenders.get(id);

        if (!render || !parentPort || render.rendered) {
          console.log("[html-worker] Skipping render:", { render: !!render, rendered: render?.rendered });
          return;
        }
        try {
          const writeToFile = render.outDir && render.htmlOutputPath;
          console.log("[html-worker] Writing to file:", writeToFile ? render.htmlOutputPath : "memory");
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
                    console.log("[html-worker] Writing chunk for route:", render.id);
                    parentPort?.postMessage({
                      type: "HTML",
                      route: render.id,
                      content: chunk.toString(),
                    });
                    callback();
                  },
                  final(callback) {
                    console.log("[html-worker] Finalizing write for route:", render.id);
                    parentPort?.postMessage({
                      type: "WROTE_FILE",
                      id: render.id,
                      outputPath: render.htmlOutputPath
                    });
                    callback();
                    // Clean up
                    activeStreams.delete(id);
                    activeWrites.delete(id);
                  }
                }),
                parentPort
          );
          activeStreams.set(id, stream);
          activeWrites.set(id, writeStream);
          writeStream.on("error", (error) => {
            console.error("[html-worker] Write error:", error);
            parentPort?.postMessage({
              type: "ERROR",
              route: render.id,
              error: error.message
            });
            
            // Clean up
            activeStreams.delete(id);
            activeWrites.delete(id);
            stream.abort();
          });
        } catch (error) {
          console.error("[html-worker] Error in RSC_END:", error);
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
    console.error("[html-worker] Error in message handler:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    parentPort?.postMessage({
      type: "ERROR",
      error: errorMessage,
    });
  }
});

// When ready
console.log("[html-worker] Worker ready");
parentPort.postMessage({ type: "READY" });

