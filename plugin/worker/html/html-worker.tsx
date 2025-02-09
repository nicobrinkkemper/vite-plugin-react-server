import { createWriteStream, readFileSync, WriteStream } from "node:fs";
import { PassThrough, Writable } from "node:stream";
import { parentPort } from "node:worker_threads";
import { readSync } from "node:fs";
import { createHtmlStream } from "./createHtmlStream.js";
import type { HtmlRenderState, HtmlWorkerMessage } from "../types.js";
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
};

// Track active renders
const activeRenders = new Map<string, HtmlRenderState>();
const activeStreams = new Map<string, PipeableStream>();
const activeWrites = new Map<string, Writable>();


const createStreamToMemory = (id: string) => {
  return new Writable({
    write(chunk, _, callback) {
      callback();
    },
    final(callback) {
      callback();
    },
  });
};
// Handle incoming messages
parentPort.on("message", (message: HtmlWorkerMessage) => {
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

      if (!render || !parentPort || render.rendered) {
        console.log("[html-worker] Skipping render:", {
          render: !!render,
          rendered: render?.rendered,
        });
        return;
      }
      render.rendered = true;
      const writeToFile = render.outDir && render.htmlOutputPath;

      const { stream, writeStream } = createHtmlStream(
        render,
        writeToFile
          ? createWriteStream(render.htmlOutputPath)
          : createStreamToMemory(id),
        parentPort
      );
      activeStreams.set(id, stream);
      activeWrites.set(id, writeStream);
      break;
    }
  }
});

// When ready
parentPort.postMessage({ type: "READY" });
