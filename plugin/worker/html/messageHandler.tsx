import type { HtmlWorkerInputMessage } from "./types.js";
import { handlers } from "./handlers.js";
import { handleHtmlRender } from "./handleHtmlRender.js";
import { PassThrough } from "node:stream";
import { createLogger } from "vite";
import { workerData } from "node:worker_threads";
import type { HtmlRenderMessage } from "../types.js";
import { handleError } from "../../error/handleError.js";

// Track active renders - store the RSC stream, message data, and CSS info for each route
const activeRenders = new Map<string, { rscStream: PassThrough; htmlRenderMsg?: HtmlRenderMessage; cssFiles?: Map<string, any>; globalCss?: Map<string, any> }>();
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
  console.log(`[HTML-WORKER-DEBUG] Received message: ${type} ${id}`);
  
  // Debug userOptions on first message
  if (type === "HTML_RENDER") {
    console.log(`[HTML-WORKER-DEBUG] userOptions keys: ${Object.keys(workerData.userOptions || {}).join(', ')}`);
    console.log(`[HTML-WORKER-DEBUG] verbose flag: ${workerData.userOptions?.verbose}`);
    console.log(`[HTML-WORKER-DEBUG] moduleBaseURL: ${workerData.userOptions?.moduleBaseURL}`);
    console.log(`[HTML-WORKER-DEBUG] moduleRootPath: ${workerData.userOptions?.moduleRootPath}`);
  }
  
  try {
    switch (type) {
      case "HTML_RENDER": {
        console.log(`[HTML-WORKER-DEBUG] Processing HTML_RENDER for ${id}`);
        // Clean up any existing render state for this route
        const existingRenderState = activeRenders.get(id);
        if (existingRenderState) {
          console.log(`[HTML-WORKER-DEBUG] Cleaning up existing render state for ${id}`);
          cleanup(id);
        }

        const htmlRenderMsg = msg as HtmlRenderMessage;
        console.log(`[HTML-WORKER-DEBUG] Creating RSC stream for ${id}`);
        // Create new RSC stream for this route
        const rscStream = new PassThrough();
        activeRenders.set(id, { 
          rscStream,
          htmlRenderMsg,
        });

        // Send HTML_RENDER_START immediately when HTML_RENDER is received
        handlers.onHtmlRender?.(id, htmlRenderMsg);

        console.log(`[HTML-WORKER-DEBUG] Starting handleHtmlRender for ${id}`);
        console.log(`[HTML-WORKER-DEBUG] Message moduleBaseURL: ${htmlRenderMsg.moduleBaseURL}`);
        console.log(`[HTML-WORKER-DEBUG] Final moduleBaseURL: ${htmlRenderMsg.moduleBaseURL ?? workerData.userOptions.moduleBaseURL}`);
        // Start the HTML render process immediately to process streaming RSC chunks
        try {
          handleHtmlRender(
            {
              id,
              route: id,
              rscStream: rscStream,
              htmlStream: new PassThrough(),
              projectRoot: htmlRenderMsg.projectRoot ?? workerData.userOptions.projectRoot,
              moduleRootPath: htmlRenderMsg.moduleRootPath ?? workerData.userOptions.moduleRootPath,
              moduleBasePath: htmlRenderMsg.moduleBasePath ?? workerData.userOptions.moduleBasePath,
              moduleBaseURL: htmlRenderMsg.moduleBaseURL ?? workerData.userOptions.moduleBaseURL,
              verbose: Boolean(htmlRenderMsg.verbose ?? workerData.userOptions.verbose),
              htmlTimeout: workerData.userOptions.htmlTimeout,
            },
            handlers,
            logger
          );
          console.log(`[HTML-WORKER-DEBUG] handleHtmlRender started successfully for ${id}`);
        } catch (error) {
          console.error(`[HTML-WORKER-DEBUG] Error starting handleHtmlRender for ${id}:`, error);
          handlers.onError(id, error as Error);
        }

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
        // RSC_END means all chunks have been written, end the stream so createFromNodeStream knows it's complete
        renderState.rscStream.end();
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

