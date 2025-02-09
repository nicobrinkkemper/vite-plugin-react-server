import { PassThrough, Readable } from "node:stream";
import { parentPort } from "node:worker_threads";
import type { HtmlRenderState, HtmlWorkerMessage } from "../types.js";
import type { PipeableStream } from "react-dom/server";
import ReactDOMServer from "react-dom/server";
import React from "react";
import {
  createFromNodeStream,
  // @ts-ignore
} from "react-server-dom-esm/client.node";

const debug = (...args: any[]) => console.log("[html-worker]", ...args);

// Track active renders and streams
const activeRenders = new Map<string, HtmlRenderState>();
const activeStreams = new Map<string, PipeableStream>();

if (!parentPort) throw new Error("This module must be run as a worker");

parentPort.on("message", async (message: HtmlWorkerMessage) => {
  try {
    switch (message.type) {
      case "RSC_CHUNK": {
        const { id, chunk, ...rest } = message;
        const render = activeRenders.get(id);
        
        if (!render) {
          activeRenders.set(id, {
            chunks: [chunk],
            id,
            complete: false,
            rendered: false,
            ...rest
          });
        } else {
          render.chunks = [...render.chunks, chunk];
        }
        break;
      }

      case "RSC_END": {
        const { id } = message;
        const render = activeRenders.get(id);
        if (!render) {
          throw new Error(`No render state found for ${id}`);
        }

        debug("Starting render for", id, "chunks:", render.chunks.length);

        // Create a PassThrough stream to handle the chunks
        const rscStream = new PassThrough();
        
        // Write all chunks to the stream
        for (const chunk of render.chunks) {
          rscStream.write(chunk);
        }
        rscStream.end();

        // Create React elements from stream
        const reactElements = createFromNodeStream(
          rscStream,
          render.moduleRootPath,
          render.moduleBaseURL
        );

        // Create a promise that resolves when HTML is complete
        const htmlPromise = new Promise<string>((resolve) => {
          let html = '';
          const collectStream = new PassThrough();
          
          collectStream.on('data', chunk => {
            html += chunk.toString();
          });
          
          collectStream.on('end', () => {
            debug("HTML collection complete:", html);
            resolve(html);
          });

          // Render to pipeable stream
          const stream = ReactDOMServer.renderToPipeableStream(
            reactElements as React.ReactNode,
            {
              ...render.pipableStreamOptions,
              onShellReady() {
                debug("Shell ready for", id);
                parentPort?.postMessage({ type: "SHELL_READY", id });
              },
              async onAllReady() {
                debug("All ready for", id);
                const finalHtml = await htmlPromise;
                debug("Final HTML content:", finalHtml);
                parentPort?.postMessage({ 
                  type: "HTML_READY", 
                  id,
                  html: finalHtml,
                  outputPath: render.htmlOutputPath 
                });
                parentPort?.postMessage({ type: "ALL_READY", id });
              },
              onError(error) {
                debug("Error for", id);
                parentPort?.postMessage({ 
                  type: "ERROR", 
                  id, 
                  error: error instanceof Error ? error.message : String(error)
                });
              }
            }
          );

          // Pipe to collection stream
          stream.pipe(collectStream);
        });

        break;
      }
    }
  } catch (error) {
    console.error("[html-worker] Fatal error:", error);
    parentPort?.postMessage({
      type: "ERROR",
      id: message.type === "RSC_CHUNK" || message.type === "RSC_END" ? message.id : "",
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// Signal ready with environment
parentPort.postMessage({ type: "READY", env: process.env["NODE_ENV"] });
