import type { HtmlWorkerInputMessage } from "./types.js";
import { handlers } from "./handlers.js";
import { handleHtmlRender } from "./handleHtmlRender.js";
import { PassThrough } from "node:stream";
import { createLogger } from "vite";
import { workerData } from "node:worker_threads";
import type { HtmlRenderMessage } from "../types.js";
import { handleError } from "../../error/handleError.js";

// Track active renders - store the RSC stream and CSS info for each route
const activeRenders = new Map<string, { rscStream: PassThrough; cssFiles?: Map<string, any>; globalCss?: Map<string, any> }>();
const logger = createLogger(workerData.resolvedConfig.logLevel ?? "info");

function cleanup(id: string) {
  const renderState = activeRenders.get(id);
  if (renderState) {
    renderState.rscStream.destroy();
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
        const existingRenderState = activeRenders.get(id);
        if (existingRenderState) {
          cleanup(id);
        }

        const htmlRenderMsg = msg as HtmlRenderMessage;
        // Create new RSC stream for this route
        const rscStream = new PassThrough();
        activeRenders.set(id, { 
          rscStream, 
        });

        // Don't start HTML render process yet - wait for RSC_END
        handlers.onHtmlRender?.(id, htmlRenderMsg);
        break;
      }
      case "RSC_CHUNK": {
        const renderState = activeRenders.get(id);
        if (!renderState) {
          handlers.onError(
            id,
            new Error(`No render state found for id: ${id}`)
          );
          return;
        }

        try {
          // Write RSC chunk to the RSC stream
          renderState.rscStream.write(msg.chunk);
          // Note: CHUNK_PROCESSED is handled by the RSC worker, not HTML worker
        } catch (error: any) {
          handlers.onError(
            id,
            new Error(`Error writing chunk: ${error.message}`)
          );
          cleanup(id);
        }
        break;
      }
      case "RSC_END": {
        const renderState = activeRenders.get(id);
        if (!renderState) {
          handlers.onError(id, new Error("No render state found"));
          return;
        }
        // End the RSC stream and start the HTML render process
        renderState.rscStream.end();
        
        // Start the HTML render process now that RSC stream is complete
        handleHtmlRender(
          {
            id,
            route: id,
            rscStream: renderState.rscStream,
            htmlStream: new PassThrough(),
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
        break;
      }
      case "ABORT": {
        const renderState = activeRenders.get(id);
        if (renderState) {
          renderState.rscStream.emit("abort", msg.reason);
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
    if (workerData.userOptions.verbose) {
      logger.error(
        `[html-worker:${id}] Error in messageHandler: ${
          error instanceof Error ? error.message : JSON.stringify(error)
        }`,
        { error: error instanceof Error ? error : undefined }
      );
    }
    const panicError = handleError({
      error: error,
      logger: logger,
      panicThreshold: workerData.userOptions.panicThreshold,
      context: `HTML worker messageHandler error for id: ${id}`,
    });
    if (panicError != null) {
      handlers.onError(id, panicError);
      handlers.onEnd(id);
    }
  }
}
