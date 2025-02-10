import { PassThrough } from "node:stream";
import { parentPort } from "node:worker_threads";
import type { HtmlRenderState, HtmlWorkerMessage } from "../types.js";
import ReactDOMServer from "react-dom/server";
import React from "react";
import {
  createFromNodeStream,
  // @ts-ignore
} from "react-server-dom-esm/client.node";

// Track active renders and streams
const activeRenders = new Map<string, HtmlRenderState>();
const htmlContent = new Map<string, string>();
const htmlPromises = new Map<string, Promise<string>>();

export const messageHandler = async (message: HtmlWorkerMessage) => {
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
            ...rest,
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

        // Mark this render as complete
        render.complete = true;

        // Create a PassThrough stream to handle the chunks
        const rscStream = new PassThrough();

        // Write all chunks to the stream
        for (const chunk of render.chunks) {
          rscStream.write(chunk);
        }
        rscStream.end();

        // Create React elements from stream
        const reactElements = await createFromNodeStream(
          rscStream,
          render.moduleRootPath,
          render.moduleBaseURL
        );

        // Create a promise that resolves when HTML is complete
        const htmlPromise = new Promise<string>((resolve) => {
          const collectStream = new PassThrough();
          let html = '';

          collectStream.on("data", (chunk) => {
            html += chunk.toString();
          });

          collectStream.on("end", () => {
            resolve(html);
            render.rendered = true;
            parentPort?.postMessage({
              type: "ALL_READY",
              id,
              html,
              outputPath: render.htmlOutputPath,
            });
          });

          // Render to pipeable stream
          const stream = ReactDOMServer.renderToPipeableStream(
            reactElements as React.ReactNode,
            {
              ...render.pipableStreamOptions,
              onShellReady() {
                parentPort?.postMessage({ type: "SHELL_READY", id });
              }
            }
          );

          // Pipe to collection stream
          stream.pipe(collectStream);
        });

        htmlPromises.set(id, htmlPromise);

        // Clean up resources
        rscStream.destroy();
        activeRenders.delete(id);
        htmlContent.delete(id);
        htmlPromises.delete(id);
        break;
      }
    }
  } catch (error) {
    parentPort?.postMessage({
      type: "ERROR",
      id: message.type === "RSC_CHUNK" || message.type === "RSC_END" ? message.id : "",
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
