import { createWriteStream } from "node:fs";
import { PassThrough, Readable, type Writable } from "node:stream";
import ReactDOMServer from "react-dom/server";
import {
  createFromNodeStream,
  // @ts-ignore
} from "react-server-dom-esm/client.node";
import type { HtmlRenderState } from "../types.js";
import { parentPort as _ } from "node:worker_threads";
const concatter = (chunk: string) => {
  if (Array.isArray(chunk)) {
    return Buffer.from(chunk);
  }
  return Buffer.from(chunk);
};

export function createHtmlStream(
  renderState: HtmlRenderState,
  writeStream: Writable,
  parentPort = _
) {
  const outputPath = renderState.htmlOutputPath;

  // Create readable stream from RSC content
  const rscStream = Readable.from(renderState.chunks.map(concatter));

  // Create RSC node stream
  const reactElements = createFromNodeStream(
    rscStream,
    renderState.moduleBasePath,
    renderState.moduleBaseURL,
  );

  const stream = ReactDOMServer.renderToPipeableStream(
    reactElements as React.ReactNode,
    {
      ...renderState.pipableStreamOptions,
      onAllReady() {
        writeStream.on("finish", () => {
          parentPort?.postMessage({
            type: "WROTE_FILE",
            id: renderState.id,
            outputPath: outputPath,
          });
          writeStream.end();
        });
        writeStream.on("error", (error) => {
          parentPort?.postMessage({
            type: "ERROR",
            id: renderState.id,
            error: error instanceof Error ? error.message : String(error),
          });
          stream.abort();
        });
        stream.pipe(writeStream);
      },
      onShellReady() {
        parentPort?.postMessage({
          type: "SHELL_READY",
          id: renderState.id,
        });
      },
      onError(error) {
        parentPort?.postMessage({
          type: "ERROR",
          id: renderState.id,
          error: error instanceof Error ? error.message : String(error),
        });
        stream.abort();
        writeStream.destroy();
      },
      onShellError(error) {
        parentPort?.postMessage({
          type: "ERROR",
          id: renderState.id,
          error: error instanceof Error ? error.message : String(error),
        });
        stream.abort();
        writeStream.destroy();
      },
    }
  );
  return { stream, writeStream };
}
