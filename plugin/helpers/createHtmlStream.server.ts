import type { CreateHtmlStreamFn } from "./createHtmlStream.types.js";
import { createWorkerStream } from "./createWorkerStream.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";

/**
 * Render HTML stream under server conditions, using the html-worker.
 * @param options
 * @returns
 */
export const createHtmlStream: CreateHtmlStreamFn = function _createHtmlStream(
  options
) {
  if(!options.worker) {
    throw new Error("Worker is required for HTML rendering without the react-client condition.");
  }
  
  const readable = createWorkerStream({
    ...options,
    workerPath: options.htmlWorkerPath || DEFAULT_CONFIG.HTML_WORKER_PATH,
    messageType: "HTML_RENDER",
    currentCondition: "react-server",
    reverseCondition: "react-client",
    worker: options.worker,
    url: options.moduleBaseURL,
    cssFiles: new Map<string, string>(),
    globalCss: new Map<string, string>(),
    manifest: {},
  });

  return {
    pipe: <Writable extends NodeJS.WritableStream>(destination: Writable) => {
      readable.pipe(destination);
      return destination;
    },
    abort: (reason?: unknown) => {
      readable.destroy(new Error(String(reason || "Aborted")));
    },
  };
};
