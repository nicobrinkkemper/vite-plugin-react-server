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
          let html = "";
          const collectStream = new PassThrough();

          collectStream.on("data", (chunk) => {
            html += chunk.toString();
          });

          collectStream.on("end", () => {
            resolve(html);
          });

          // Render to pipeable stream
          const stream = ReactDOMServer.renderToPipeableStream(
            reactElements as React.ReactNode,
            {
              ...render.pipableStreamOptions,
              onShellReady() {
                parentPort?.postMessage({ type: "SHELL_READY", id });
              },
              async onAllReady() {
                const finalHtml = await htmlPromise;
                parentPort?.postMessage({
                  type: "HTML_READY",
                  id,
                  html: finalHtml,
                  outputPath: render.htmlOutputPath,
                });
                parentPort?.postMessage({ type: "ALL_READY", id });
              },
              onError(error) {
                parentPort?.postMessage({
                  type: "ERROR",
                  id,
                  error: error instanceof Error ? error.message : String(error),
                });
              },
            }
          );

          // Pipe to collection stream
          stream.pipe(collectStream);
        });

        break;
      }
    }
  } catch (error) {
    parentPort?.postMessage({
      type: "ERROR",
      id:
        message.type === "RSC_CHUNK" || message.type === "RSC_END"
          ? message.id
          : "",
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
