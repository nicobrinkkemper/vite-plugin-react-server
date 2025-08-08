import type {
  HtmlWorkerInputMessage,
} from "./types.js";
import { handlers } from "./handlers.js";
import { handleHtmlRender } from "./handleHtmlRender.js";
import { PassThrough } from "node:stream";
import { createLogger } from "vite";
import { workerData } from "node:worker_threads";
import type { HtmlRenderMessage } from "../types.js";

// Track active renders - just store the RSC stream for each route
const activeRenders = new Map<string, PassThrough>();
const logger = createLogger(workerData.resolvedConfig.logLevel ?? "info");

function cleanup(id: string) {
  const rscStream = activeRenders.get(id);
  if (rscStream) {
    rscStream.destroy();
    activeRenders.delete(id);
  }
  handlers.onCleanup?.(id);
}
export async function messageHandler(msg: HtmlWorkerInputMessage) {
  const { type, id } = msg;
  try {
    switch (type) {
      case "HTML_RENDER": {
        // Clean up any existing render state for this route
        const existingRscStream = activeRenders.get(id);
        if (existingRscStream) {
          cleanup(id);
        }

        // Create new RSC stream for this route
        const rscStream = new PassThrough();
        activeRenders.set(id, rscStream);

        // Start the HTML render process
        handleHtmlRender(
          {
            id,
            route: id,
            rscStream,
            projectRoot: workerData.userOptions.projectRoot,
            moduleRootPath: workerData.userOptions.moduleRootPath,
            moduleBasePath: workerData.userOptions.moduleBasePath,
            moduleBaseURL: workerData.userOptions.moduleBaseURL,
            verbose: Boolean(workerData.userOptions.verbose),
            htmlTimeout: workerData.userOptions.htmlTimeout,
          },
          handlers,
          logger
        );
        handlers.onHtmlRender?.(id, msg as HtmlRenderMessage);
        break;
      }
      case "RSC_CHUNK": {
        const rscStream = activeRenders.get(id);
        if (!rscStream) {
          handlers.onError(id, new Error(`No render state found for id: ${id}`));
          return;
        }

        try {
          // Write RSC chunk to the RSC stream
          rscStream.write(msg.chunk);
          // Note: CHUNK_PROCESSED is handled by the RSC worker, not HTML worker
        } catch (error: any) {
          handlers.onError(id, new Error(`Error writing chunk: ${error.message}`));
          cleanup(id);
        }
        break;
      }
      case "RSC_END": {
        const rscStream = activeRenders.get(id);
        if (!rscStream) {
          handlers.onError(id, new Error("No render state found"));
          return;
        }
        // End the RSC stream so handleRender can process it and generate HTML
        rscStream.end();
        break;
      }
      case "ABORT": {
        const rscStream = activeRenders.get(id);
        if (rscStream) {
          rscStream.emit("abort");
        }
        break;
      }
      case "CLEANUP": {
        cleanup(id);
        break;
      }
      case "SHUTDOWN": {
        // If id is "*", clean up all render states
        if (id === "*") {
          for (const [renderId] of activeRenders) {
            cleanup(renderId);
          }
        } else {
          cleanup(id);
        }
        // Send SHUTDOWN_COMPLETE message to signal that shutdown is complete
        handlers.onShutdown?.(id);
        break;
      }
    }
  } catch (error) {
    handlers.onError(id, error);
  }
}
