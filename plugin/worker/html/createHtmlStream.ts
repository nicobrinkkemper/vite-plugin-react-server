import { createWriteStream } from "node:fs";
import { PassThrough, Readable, type Writable } from "node:stream";
import ReactDOMServer from "react-dom/server";
import { createFromNodeStream 
  // @ts-ignore
} from "react-server-dom-esm/client.node";
import type { HtmlRenderState } from "../types.js";
import type { MessagePort } from "node:worker_threads";

const concatter = (chunk: string) => {
  if (Array.isArray(chunk)) {
    return Buffer.from(chunk);
  }
  return Buffer.from(chunk);
};

export function createHtmlStream(
  renderState: HtmlRenderState,
  writeStream: Writable,
) {
  // Create readable stream from RSC content
  const rscStream = Readable.from(renderState.chunks.map(concatter));

  // Create RSC node stream
  const reactElements = createFromNodeStream(
    rscStream,
    renderState.moduleRootPath,
    renderState.moduleBaseURL
  );

  const stream = ReactDOMServer.renderToPipeableStream(reactElements as React.ReactNode, renderState.pipableStreamOptions);
  return { stream, writeStream };
}
