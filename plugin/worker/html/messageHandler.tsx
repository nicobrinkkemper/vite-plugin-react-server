import { PassThrough, Transform } from "node:stream";
import { parentPort } from "node:worker_threads";
import type { HtmlWorkerInputMessage } from "../types.js";
import * as ReactDOMServer from "react-dom/server";
import { createFromNodeStream } from "react-server-dom-esm/client.node";
import { join } from "node:path";
import type { HtmlWorkerRenderState } from "./types.js";


// Track active renders
const activeRenders = new Map<string, HtmlWorkerRenderState>();

function sendMessage(msg: any) {
  
  // Send the original message
  parentPort?.postMessage(msg);
}

function cleanup(id: string) {
  const renderState = activeRenders.get(id);
  if (renderState) {
    renderState.rscStream.destroy();
    renderState.htmlStream?.destroy();
    renderState.htmlTransform?.destroy();
    activeRenders.delete(id);
    
    sendMessage({
      type: "CLEANUP_COMPLETE",
      id
    });
  }
}



const createMetrics = () => {
  return {
    totalChunksReceived: 0,
    totalBytesReceived: 0,
    totalChunksProcessed: 0,
    totalBytesProcessed: 0
  }
}

const createHtmlWorkerRenderState = (msg: HtmlWorkerInputMessage, isReady: boolean = false): HtmlWorkerRenderState => {
  return {
    rscStream: new PassThrough(),
    metrics: createMetrics(),
    isReady: isReady,
    pendingChunks: [],
    projectRoot: 'projectRoot' in msg ? String(msg.projectRoot) : '',
    moduleRootPath: 'moduleRootPath' in msg ? String(msg.moduleRootPath) : '',
    moduleBaseURL: 'moduleBaseURL' in msg ? String(msg.moduleBaseURL) : ''
  }
}

export function messageHandler(msg: HtmlWorkerInputMessage) {
  const { type, id } = msg;

  switch (type) {
    case "ROUTE_READY": {
      let renderState = activeRenders.get(id);
      if (!renderState) {
        renderState = createHtmlWorkerRenderState(msg, true);
        activeRenders.set(id, renderState);
      } else {
        renderState.isReady = true;
        // Send any pending chunks
        for (const chunk of renderState.pendingChunks) {
          sendMessage({
            type: "HTML_CHUNK",
            id,
            chunk
          });
        }
        renderState.pendingChunks = [];
      }
      break;
    }
    case "RSC_CHUNK": {
      let renderState = activeRenders.get(id);
      if (!renderState) {
        // Create new render state if none exists
        renderState = createHtmlWorkerRenderState(msg, false);
        activeRenders.set(id, renderState);
      }

      const { chunk, moduleRootPath = renderState.moduleRootPath, moduleBaseURL = renderState.moduleBaseURL, projectRoot = renderState.projectRoot } = msg;

      renderState.metrics.totalChunksReceived++;
      renderState.metrics.totalBytesReceived += chunk.length;
      renderState.moduleRootPath = moduleRootPath;
      renderState.moduleBaseURL = moduleBaseURL;
      renderState.projectRoot = projectRoot;
      
      try {
        // Write chunk to stream regardless of ready state
        renderState.rscStream.write(chunk);
        sendMessage({
          type: "CHUNK_PROCESSED",
          id,
          success: true
        });
      } catch (error: any) {
        sendMessage({
          type: "ERROR",
          id,
          error: `Error writing chunk: ${error.message}`
        });
        cleanup(id);
      }
      break;
    }
    case "RSC_END": {
      const renderState = activeRenders.get(id);
      if (!renderState) {
        sendMessage({
          type: "ERROR",
          id,
          error: "No render state found"
        });
        return;
      }

      try {
        renderState.rscStream.end();
        
        // Create React component from RSC stream
        const Component = createFromNodeStream(renderState.rscStream, renderState.moduleRootPath, renderState.moduleBaseURL, {
          encodeFormAction: false,
          nonce: '',
          replayConsoleLogs: process.env['NODE_ENV'] !== 'production',
          environmentName: 'Server',
        });
        
        // Create HTML transform
        const htmlTransform = new Transform({
          transform(chunk, encoding, callback) {
            const chunkStr = chunk.toString();
            renderState.metrics.totalChunksProcessed++;
            renderState.metrics.totalBytesProcessed += chunkStr.length;
            
            if (renderState.isReady) {
              sendMessage({
                type: "HTML_CHUNK",
                id,
                chunk: chunkStr
              });
            } else {
              renderState.pendingChunks.push(chunkStr);
            }
            callback();
          },
          flush(callback) {
            if (renderState.isReady) {
              sendMessage({
                type: "HTML_COMPLETE",
                id,
                success: true,
                metrics: renderState.metrics
              });
            }
            callback();
          }
        });

        // Create HTML stream
        const htmlStream = new PassThrough();
        htmlStream.pipe(htmlTransform);
        renderState.htmlStream = htmlStream;
        renderState.htmlTransform = htmlTransform;

        // Render the component to the HTML stream
        ReactDOMServer.renderToPipeableStream(Component).pipe(htmlStream);

      } catch (error: any) {
        renderState?.abort?.();
        sendMessage({
          type: "ERROR",
          id,
          error: `Error in RSC_END: ${error.message}`
        });
        cleanup(id);
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
      sendMessage({
        type: "SHUTDOWN_COMPLETE",
        id
      });
      break;
    }
  }
}