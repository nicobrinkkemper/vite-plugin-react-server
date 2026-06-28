import type { MessagePort } from "node:worker_threads";
import { fetchModule, type Logger, type ViteDevServer } from "vite";

import type {
  RunnerPortRequest,
  RunnerPortResponse,
  RpcRequest,
  RpcResponse,
} from "../worker/rsc/createRunnerTransport.js";
import { collectRunnerCss } from "./collectRunnerCss.js";

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
  const handler = async (msg: RunnerPortRequest | RpcRequest) => {
    if (!msg) return;
    if (msg.__vprs === "rpc-request") {
      await handleRpc(msg as RpcRequest);
      return;
    }
    if (msg.__vprs !== "runner-request") return;
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
      const env = server.environments?.["server"];
      if (!env) {
        throw new Error("[runner-fetch] server environment not initialized");
      }
      if (name === "getBuiltins") {
        // Vite 7+ added a `getBuiltins` transport call to the module runner
        // (Vite 6 had none). Our custom transport must answer it or the runner
        // import rejects and the RSC render comes back empty. Mirror Vite's own
        // transport: serialize `resolve.builtins` to {type, value|source,flags}.
        const builtins =
          (env.config as { resolve?: { builtins?: Array<string | RegExp> } })
            .resolve?.builtins ?? [];
        const builtinsResult = builtins.map((b) =>
          typeof b === "string"
            ? { type: "string" as const, value: b }
            : { type: "RegExp" as const, source: b.source, flags: b.flags }
        );
        port.postMessage({
          __vprs: "runner-response",
          requestId,
          result: { result: builtinsResult },
        } satisfies RunnerPortResponse);
        return;
      }
      if (name !== "fetchModule") {
        throw new Error(`[runner-fetch] unsupported method: ${name}`);
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

  const handleRpc = async (msg: RpcRequest) => {
    const { requestId, method, args } = msg;
    if (verbose) {
      logger.info(
        `[runner-rpc] received: method=${method} requestId=${requestId}`
      );
    }
    try {
      let result: unknown;
      if (method === "collectCss") {
        const [pagePath, projectRoot] = args as [string, string];
        result = await collectRunnerCss(
          server,
          pagePath,
          projectRoot,
          logger,
          verbose
        );
      } else {
        throw new Error(`[runner-rpc] unsupported method: ${method}`);
      }
      const response: RpcResponse = {
        __vprs: "rpc-response",
        requestId,
        result,
      };
      port.postMessage(response);
    } catch (error: any) {
      if (verbose) {
        logger.error(
          `[runner-rpc] ${method} failed: ${error?.message ?? String(error)}`,
          { error: error instanceof Error ? error : new Error(String(error)) }
        );
      }
      const response: RpcResponse = {
        __vprs: "rpc-response",
        requestId,
        error: {
          name: error?.name,
          message: String(error?.message ?? error),
          stack: error?.stack,
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
