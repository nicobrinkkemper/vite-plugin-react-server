import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { Readable, Writable } from "node:stream";
import { parentPort } from "node:worker_threads";
import ReactDOMServer from "react-dom/server";
import { createFromNodeStream } from "react-server-dom-esm/client.node";
const concatter = (chunk) => {
  if (Array.isArray(chunk)) {
    return Buffer.from(chunk);
  }
  return Buffer.from(chunk);
};
function createHtmlStream(renderState, writeStream) {
  const outputPath = renderState.htmlOutputPath;
  const rscStream = Readable.from(renderState.chunks.map(concatter));
  const reactElements = createFromNodeStream(
    rscStream,
    renderState.moduleBasePath,
    renderState.moduleBaseURL
  );
  const rscOutputPath = renderState.htmlOutputPath.endsWith(".html") ? renderState.htmlOutputPath.slice(0, -5) + ".rsc" : renderState.htmlOutputPath.endsWith("/") ? renderState.htmlOutputPath + "index.rsc" : renderState.htmlOutputPath.endsWith(".") ? renderState.htmlOutputPath + "rsc" : renderState.htmlOutputPath + ".rsc";
  const writeRscEntry = createWriteStream(rscOutputPath);
  rscStream.on("data", (chunk) => {
    writeRscEntry.write(chunk);
  });
  rscStream.on("end", () => {
    writeRscEntry.end();
  });
  const stream = ReactDOMServer.renderToPipeableStream(reactElements, {
    ...renderState.pipableStreamOptions,
    onAllReady() {
      writeStream.on("finish", () => {
        parentPort?.postMessage({
          type: "HTML",
          outputPath,
          route: renderState.id
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
    }
  });
  return { stream, writeStream };
}
if (!parentPort) {
  throw new Error("This module must be run as a worker");
}
global.window = {
  href: void 0,
  pathname: void 0
};
const activeRenders = /* @__PURE__ */ new Map();
const activeStreams = /* @__PURE__ */ new Map();
const activeWrites = /* @__PURE__ */ new Map();
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
parentPort.on("message", async (message) => {
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
        global.window.pathname = id;
        let renderState = activeRenders.get(id);
        if (renderState?.rendered) {
          return;
        }
        if (!renderState) {
          renderState = {
            chunks: [],
            complete: false,
            rendered: false,
            id,
            ...rest
          };
          activeRenders.set(id, renderState);
        }
        if (chunk) renderState.chunks.push(chunk);
        break;
      }
      case "RSC_END": {
        const { id } = message;
        const render = activeRenders.get(id);
        if (!render || !parentPort || render.rendered) return;
        try {
          const writeToFile = render.outDir && render.htmlOutputPath;
          if (writeToFile) {
            await mkdir(dirname(render.htmlOutputPath), { recursive: true });
          }
          const { stream, writeStream } = createHtmlStream(
            render,
            writeToFile ? createWriteStream(render.htmlOutputPath) : new Writable({
              write(chunk, _, callback) {
                parentPort?.postMessage({
                  type: "HTML",
                  route: render.id,
                  content: chunk.toString()
                });
                callback();
              }
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
      error: errorMessage
    });
  }
});
parentPort.postMessage({ type: "READY" });
