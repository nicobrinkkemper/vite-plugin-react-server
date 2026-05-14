import type { MessagePort } from "node:worker_threads";
import { fetchModule, type Logger, type ViteDevServer } from "vite";

import type {
  RunnerPortRequest,
  RunnerPortResponse,
} from "../worker/rsc/createRunnerTransport.js";

type InvokePayload = {
  type: "custom";
  event: "vite:invoke";
  data: { name: string; id: string; data: any[] };
};

export function attachRunnerFetchHandler(
  port: MessagePort,
  server: ViteDevServer,
  logger: Logger,
  verbose = false
): () => void {
  const handler = async (msg: RunnerPortRequest) => {
    if (!msg || msg.__vprs !== "runner-request") return;
    const { requestId, payload } = msg;
    try {
      const invoke = payload as InvokePayload;
      if (
        invoke?.type !== "custom" ||
        invoke?.event !== "vite:invoke" ||
        !invoke.data
      ) {
        throw new Error(
          `[runner-fetch] unexpected payload: ${JSON.stringify(payload)}`
        );
      }
      const { name, data } = invoke.data;
      if (name !== "fetchModule") {
        throw new Error(`[runner-fetch] unsupported method: ${name}`);
      }
      const env = server.environments?.["server"];
      if (!env) {
        throw new Error("[runner-fetch] server environment not initialized");
      }
      const [url, importer, options] = data;
      const result = await fetchModule(env, url, importer, options);
      const response: RunnerPortResponse = {
        __vprs: "runner-response",
        requestId,
        result: { result },
      };
      port.postMessage(response);
    } catch (error: any) {
      if (verbose) {
        logger.error(
          `[runner-fetch] error: ${error?.message ?? String(error)}`,
          { error: error instanceof Error ? error : new Error(String(error)) }
        );
      }
      const response: RunnerPortResponse = {
        __vprs: "runner-response",
        requestId,
        result: {
          error: {
            name: error?.name,
            message: String(error?.message ?? error),
            stack: error?.stack,
          },
        },
      };
      port.postMessage(response);
    }
  };

  port.on("message", handler);
  port.start();

  return () => {
    port.off("message", handler);
  };
}
