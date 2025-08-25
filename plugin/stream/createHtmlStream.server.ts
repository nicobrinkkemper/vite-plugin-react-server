import { PassThrough } from "node:stream";
import { createLogger } from "vite";
import type { CreateHtmlStreamFn } from "./createHtmlStream.types.js";
import { createSerializableHandlerOptions } from "../helpers/createSerializableHandlerOptions.js";
import { toError } from "../error/toError.js";
import { serializeError } from "../error/serializeError.js";

/**
 * Creates an HTML stream using a MessagePort for direct communication with the HTML worker
 */
export const createHtmlStream: CreateHtmlStreamFn = function _createHtmlStream(options) {
  const {
    route,
    rscStream,
    htmlWorker,
    logger = createLogger(),
    verbose = false,
  } = options;

  if (verbose) {
    logger.info(`[createHtmlStream.server:${route}] Creating HTML stream with MessagePort`);
  }

  if (!htmlWorker) {
    throw new Error("HTML worker is required for server-side HTML streaming");
  }

  // Create two separate MessagePorts for clean separation of concerns
  const { port1: dataPort1, port2: dataPort2 } = new MessageChannel();
  const { port1: controlPort1, port2: controlPort2 } = new MessageChannel();
  
  // Create the HTML output stream
  const htmlStream = new PassThrough({
    objectMode: false,
    highWaterMark: 64 * 1024 // 64KB buffer
  });
  

  
  // Data port - ONLY for raw HTML stream data (no type checking needed!)
  dataPort1.onmessage = (event) => {
    const data = event.data;
    
    if (data === null) {
      // End of stream
      htmlStream.end();
    } else {
      // Raw HTML data - direct piping, no type checking!
      htmlStream.write(data);
    }
  };
  
  // Control port - ONLY for control messages
  controlPort1.onmessage = (event) => {
    const message = event.data;
    
    
    switch (message.type) {
      case 'END':
        // End the stream immediately when we receive the END control message
        htmlStream.end();
        break;
      case 'ERROR':
        const error = toError(message.error, message.errorInfo);
        htmlStream.destroy(error);
        break;
      case 'METRICS':
        break;
      case 'HTML_RENDER_START':
        break;
      default:
        break;
    }
  };

  // Send the HTML stream request to the worker with both MessagePorts
  htmlWorker.postMessage({
    type: "INIT",
    id: route,
    dataPort: dataPort2,
    controlPort: controlPort2,
    options: createSerializableHandlerOptions(options)
  }, [dataPort2, controlPort2] as any); // Transfer both ports to the worker

  // If we have an RSC stream, pipe it to the worker via dataPort
  if (rscStream) {
    if (verbose) {
      logger.info(`[createHtmlStream.server:${route}] Piping RSC stream to HTML worker`);
    }
    
    
    // Pipe the RSC stream data directly to the worker via dataPort
    rscStream.on("data", (chunk) => {
      dataPort1.postMessage(chunk);
    });
    
    rscStream.on("end", () => {
      dataPort1.postMessage(null); // Signal end of stream
    });
    
    rscStream.on("error", (error) => {
      const serializedError = serializeError(error);
      controlPort1.postMessage({ type: "ERROR", error: serializedError });
      dataPort1.postMessage({ error: serializedError });
    });
  } else {
    console.log(`[createHtmlStream.server:${route}] No RSC stream provided`);
  }

  return {
    pipe: (destination: any) => htmlStream.pipe(destination),
    abort: () => {
      controlPort1.postMessage({ type: "ABORT", reason: "Stream aborted" });
      htmlStream.destroy();
    }
  };
}
