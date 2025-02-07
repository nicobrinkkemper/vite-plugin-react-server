import { createWriteStream } from "node:fs";
import { Readable, Writable } from "node:stream";
import ReactDOMServer from "react-dom/server";
import { createFromNodeStream 
  // @ts-ignore
} from "react-server-dom-esm/client.node";
import type { RenderState } from "./types.js";
import type { MessagePort } from "node:worker_threads";

const concatter = (chunk: string) => {
  if (Array.isArray(chunk)) {
    return Buffer.from(chunk);
  }
  return Buffer.from(chunk);
};

export function createHtmlStream(
  renderState: RenderState,
  writeStream: Writable,
  parentPort: MessagePort | null
) {
  console.log("[createHtmlStream] Creating stream with parentPort:", !!parentPort);
  
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
  const stream = ReactDOMServer.renderToPipeableStream(reactElements as React.ReactNode, {
    ...renderState.pipableStreamOptions,
    onAllReady() {
      console.log("[createHtmlStream] onAllReady called for:", renderState.id);
      writeStream.on("finish", () => {
        console.log("[createHtmlStream] writeStream finished for:", renderState.id);
        parentPort?.postMessage({
          type: "WROTE_FILE",
          id: renderState.id,
          outputPath: renderState.htmlOutputPath
        });
      });
      writeStream.on("error", (error) => {
        console.error("[createHtmlStream] Write error at", error);
        stream.abort();
      });
      stream.pipe(writeStream);
    },
    onShellReady() {
      console.log("[createHtmlStream] onShellReady called for:", renderState.id);
    },
    onError(error) {
      console.error("[createHtmlStream] Render error at", error);
      stream.abort();
      writeStream.destroy();
    },
    onShellError(error) {
      console.error("[createHtmlStream] Shell error at", error);
      stream.abort();
      writeStream.destroy();
    },
  });
  return { stream, writeStream };
}
