import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { parentPort } from "node:worker_threads";
import { registerServerReference, registerClientReference, renderToPipeableStream } from "react-server-dom-esm/server.node";
if (!parentPort) {
  throw new Error("This module must be run as a worker");
}
const activeRenders = /* @__PURE__ */ new Map();
const activeStreams = /* @__PURE__ */ new Map();
const activeWrites = /* @__PURE__ */ new Map();
async function shutdown() {
  console.log("[RSC Worker] Shutting down forcefully");
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
    return;
  }
  try {
    switch (message.type) {
      case "RSC_RENDER": {
        const { id, component, props, outDir } = message;
        if (activeRenders.has(id)) return;
        const rscPath = `${outDir}/${id}.rsc`;
        await mkdir(dirname(rscPath), { recursive: true });
        const writeStream = createWriteStream(rscPath);
        const stream = renderToPipeableStream(component, {
          onShellReady() {
            stream.pipe(writeStream);
          },
          onAllReady() {
            parentPort?.postMessage({
              type: "RSC_COMPLETE",
              id,
              path: rscPath
            });
          },
          onError(error) {
            parentPort?.postMessage({
              type: "ERROR",
              error: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : void 0,
              id
            });
          }
        });
        activeStreams.set(id, stream);
        activeWrites.set(id, writeStream);
        break;
      }
      case "RSC_END": {
        const { id } = message;
        activeStreams.delete(id);
        activeWrites.delete(id);
        break;
      }
      case "CLIENT_REFERENCE": {
        const { id, location, key } = message;
        const ref = registerClientReference(id, location, key);
        parentPort?.postMessage({
          type: "CLIENT_REFERENCE",
          ref
        });
        break;
      }
      case "SERVER_REFERENCE": {
        const { id, location, key } = message;
        const ref = registerServerReference(id, location, key);
        parentPort?.postMessage({
          type: "SERVER_REFERENCE",
          ref
        });
        break;
      }
    }
  } catch (error) {
    parentPort?.postMessage({
      type: "ERROR",
      error: String(error)
    });
  }
});
parentPort.postMessage({ type: "READY" });
