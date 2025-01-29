import { createWriteStream } from "node:fs";
import { Readable, Writable } from "node:stream";
import { parentPort } from "node:worker_threads";
import { renderToPipeableStream } from "react-dom/server";
import { createFromNodeStream } from "react-server-dom-esm/client.node";
import type { RenderState } from "./types.js";

const concatter = (chunk: string) => {
  if (Array.isArray(chunk)) {
    return Buffer.from(chunk);
  }
  return Buffer.from(chunk);
};

export function createHtmlStream(
  renderState: RenderState,
  writeStream: Writable
) {
  const outputPath = renderState.htmlOutputPath;

  // Create readable stream from RSC content
  const rscStream = Readable.from(renderState.chunks.map(concatter));

  // Create RSC node stream
  const reactElements = createFromNodeStream(
    rscStream,
    renderState.moduleBasePath,
    renderState.moduleBaseURL
  );
  // rsc file destination follows the same path as the html file, but with a .rsc extension
  const rscOutputPath = renderState.htmlOutputPath.endsWith(".html")
    ? renderState.htmlOutputPath.slice(0, -5) + ".rsc"
    : renderState.htmlOutputPath.endsWith("/")
    ? renderState.htmlOutputPath + "index.rsc"
    : renderState.htmlOutputPath.endsWith(".")
    ? renderState.htmlOutputPath + "rsc"
    : renderState.htmlOutputPath + ".rsc";

  const writeRscEntry = createWriteStream(rscOutputPath);
  rscStream.on("data", (chunk) => {
    writeRscEntry.write(chunk);
  });
  rscStream.on("end", () => {
    writeRscEntry.end();
  });
  const stream = renderToPipeableStream(reactElements as React.ReactNode, {
    ...renderState.pipableStreamOptions,
    onAllReady() {
      writeStream.on("finish", () => {
        parentPort?.postMessage({
          type: "HTML",
          outputPath,
          route: renderState.id,
        });
      });
      writeStream.on("error", (error) => {
        console.error("[Worker] Write error at", error);
        stream.abort();
      });
    },
    onShellReady() {
      stream.pipe(writeStream);
    },
    onError(error) {
      console.error("[Worker] Render error at", error);
      stream.abort();
      writeStream.destroy();
    },
    onShellError(error) {
      console.error("[Worker] Shell error at", error);
      stream.abort();
      writeStream.destroy();
    },
  });
  return { stream, writeStream };
}
