import { sendRscWorkerMessage } from "../sendMessage.js";
import type { StreamHandlers } from "../types.js";
import { toError } from "../../error/toError.js";
import { userOptions } from "./userOptions.js";
import { addCssFileContent, addModuleId } from "./state.js";
import { ReactDOMServer } from "../../vendor/vendor.server.js";
import { PassThrough } from "node:stream";
import { createServerActionResponse } from "../../helpers/handleServerAction.js";
import { executeServerAction } from "../../helpers/executeServerAction.js";

/**
 * Pipes a server action response through an RSC stream and sends chunks
 * back to the main thread via worker messages.
 */
function pipeServerActionResponse(
  id: string,
  result?: unknown,
  error?: string
) {
  const stream = ReactDOMServer.renderToPipeableStream(
    createServerActionResponse(result, error),
    userOptions.moduleBasePath,
    {
      onError(error: Error) {
        sendRscWorkerMessage({
          type: "ERROR",
          id,
          error: toError(error),
        });
      },
    }
  );

  const passThrough = new PassThrough();
  stream.pipe(passThrough);

  passThrough.on("data", (chunk) => {
    sendRscWorkerMessage({
      type: "RSC_CHUNK",
      id,
      chunk,
    });
  });

  passThrough.on("end", () => {
    sendRscWorkerMessage({
      type: "RSC_END",
      id,
    });
  });

  passThrough.on("error", (error) => {
    sendRscWorkerMessage({
      type: "ERROR",
      id,
      error: toError(error),
    });
  });
}

export const handlers: Required<StreamHandlers> = {
  onError: (id, error, errorInfo) => {
    sendRscWorkerMessage({
      type: "ERROR",
      id: id,
      errorInfo,
      error: toError(error),
    });
    sendRscWorkerMessage({
      type: "RSC_END",
      id: id,
    });
  },
  onData: (id, data: any) => {
    sendRscWorkerMessage({
      type: "RSC_CHUNK",
      id: id,
      chunk: data,
    });
  },
  onEnd: (id: string) => {
    sendRscWorkerMessage({
      type: "RSC_END",
      id: id,
    });
  },
  onMetrics: (id: string, metrics: any) => {
    sendRscWorkerMessage({
      type: "RSC_METRICS",
      id: id,
      metrics,
    });
  },
  onHmrAccept: (id, routes) => {
    sendRscWorkerMessage({
      type: "HMR_ACCEPT",
      id: id,
      routes: routes,
    });
  },
  onHmrUpdate: (id, routes) => {
    sendRscWorkerMessage({
      type: "HMR_UPDATE",
      id: id,
      routes: routes,
    });
  },
  onServerModule: (id, url, source) => {
    addModuleId(id, url);
    sendRscWorkerMessage({
      type: "SERVER_MODULE",
      id,
      url,
      source,
    });
  },
  onServerActionResponse: (id, result, error) => {
    pipeServerActionResponse(id, result, error);
  },
  onServerAction: async (id, args) => {
    try {
      const result = await executeServerAction(id, args, {
        projectRoot: userOptions.projectRoot,
        moduleBasePath: userOptions.moduleBasePath,
        loader: (fullPath) => import(fullPath),
      });
      pipeServerActionResponse(id, result);
    } catch (error: unknown) {
      pipeServerActionResponse(id, undefined, toError(error).message);
    }
  },
  onShutdown: (id: string) => {
    sendRscWorkerMessage({
      type: "SHUTDOWN_COMPLETE",
      id: id,
    });
  },
  onCssFile: (id, code) => {
    if (id) {
      addCssFileContent(id, code, userOptions);
      sendRscWorkerMessage({
        type: "CSS_FILE",
        id,
        content: code,
      });
    }
  },
};
