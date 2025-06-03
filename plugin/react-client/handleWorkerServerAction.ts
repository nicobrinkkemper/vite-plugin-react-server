import type { ViteDevServer } from "vite";
import type { Worker } from "node:worker_threads";
import type { RscWorkerInputMessage } from "../worker/types.js";
import { logError } from "../error/toError.js";
import {
  parseServerActionRequest,
  setupServerActionHeaders,
  createServerActionStream,
  handleServerActionError
} from "../helpers/handleServerAction.js";

/**
 * Handles server action requests in the worker scenario.
 * 
 * @param req - The incoming request
 * @param res - The response object
 * @param worker - The worker thread
 * @param logger - The Vite logger
 */
export async function handleWorkerServerAction(
  req: any,
  res: any,
  worker: Worker,
  logger: ViteDevServer["config"]["logger"]
) {
  try {
    // Read request body
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks).toString();

    // Parse the server action request
    const { id, args } = parseServerActionRequest(body, req.url);

    // Set up response headers
    setupServerActionHeaders(res);

    // Send server action request to worker
    worker.postMessage({
      type: "SERVER_ACTION",
      id,
      args,
    } satisfies RscWorkerInputMessage);

    // Create a pass-through stream for the response
    const passThrough = createServerActionStream(res);

    // Handle worker messages
    const messageHandler = (message: any) => {
      if (message.type === "RSC_CHUNK") {
        passThrough.write(message.chunk);
      } else if (message.type === "RSC_END") {
        passThrough.end();
        worker.removeListener("message", messageHandler);
      } else if (message.type === "ERROR") {
        passThrough.end();
        worker.removeListener("message", messageHandler);
        logError(message.error, logger);
      }
    };

    worker.on("message", messageHandler);

    // Handle errors
    passThrough.on("error", (error) => {
      logError(error, logger);
      res.end();
    });
  } catch (error) {
    handleServerActionError(error, res, logger);
  }
} 