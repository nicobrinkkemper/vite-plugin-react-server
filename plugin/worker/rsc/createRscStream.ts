import { renderToPipeableStream 
  // @ts-ignore
} from "react-server-dom-esm/server.node";
import type { Writable } from "node:stream";
import type { MessagePort } from "node:worker_threads";
import type { RscRenderState } from "../types.js";

export function createRscStream(
  renderState: RscRenderState,
  writeStream: Writable,
  parentPort: MessagePort | null
) {
  console.log("[createRscStream] Creating stream for:", renderState.id);

  const stream = renderToPipeableStream(renderState.componentImport, {
    onShellReady() {
      console.log("[createRscStream] onShellReady called for:", renderState.id);
      stream.pipe(writeStream);
    },
    onAllReady() {
      console.log("[createRscStream] onAllReady called for:", renderState.id);
      writeStream.on("finish", () => {
        parentPort?.postMessage({
          type: "WROTE_FILE",
          id: renderState.id,
          outputPath: renderState.rscOutputPath
        });
      });
    },
    onError(error: unknown) {
      console.error("[createRscStream] Render error:", error);
      parentPort?.postMessage({
        type: "ERROR",
        error: error instanceof Error ? error.message : String(error),
        id: renderState.id
      });
      stream.abort();
    }
  });

  return stream;
}
