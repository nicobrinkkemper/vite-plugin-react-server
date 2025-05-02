import type {
  RscChunkOutputMessage,
  RscEndMessage,
  RscWorkerOutputMessage,
} from "../types.js";
import { resolvePageAndProps } from "../../helpers/resolvePageAndProps.js";
import type { RscRenderMessage } from "../types.js";
import { activeStreams, cssFiles } from "./state.js";
import { createRscStream } from "../../helpers/createRscStream.js";
import { CssCollectorInline } from "../../css-collector-inline.js";
import { createLogger } from "vite";
import { PassThrough } from "node:stream";
import React from "react";
import { join } from "node:path";
import { parentPort, workerData, type MessagePort } from "node:worker_threads";

export async function handleRender(
  msg: RscRenderMessage,
  port = parentPort,
  reactLoaderPort: MessagePort,
  cssLoaderPort: MessagePort
) {
  const postError = process.env["DEV"]
    ? (error: any, errorInfo?: any) => {
        if(!(error instanceof Error)) {
          error = new Error(String(error));
        }
        port?.postMessage({
          type: "ERROR",
          id,
          errorInfo,
          error: {
            message: error.message,
            stack: error.stack,
            name: error.name,
            cause: error.cause,
          },
        } satisfies RscWorkerOutputMessage);
      }
    : (error: Error, errorInfo?: any) => {
        port?.postMessage({
          type: "ERROR",
          id,
          errorInfo,
          error: error.message,
        } satisfies RscWorkerOutputMessage);
      };
  let {
    id = workerData.id,
    route = workerData.route,
    pagePath = workerData.pagePath,
    propsPath = workerData.propsPath,
    pageExportName = workerData.pageExportName,
    propsExportName = workerData.propsExportName,
    projectRoot = workerData.projectRoot,
    moduleRootPath = workerData.moduleRootPath,
    moduleBaseURL = workerData.moduleBaseURL,
    moduleBasePath = workerData.moduleBasePath,
    moduleBase = workerData.moduleBase,
    pipeableStreamOptions = workerData.pipeableStreamOptions,
    rscOutputPath = workerData.rscOutputPath,
    htmlOutputPath = workerData.htmlOutputPath,
    css = workerData.css,
    cssFiles: messageCssFiles = cssFiles,
  } = msg;

  if ("css" in msg) {
    workerData.css = msg.css;
  } else {
    css = workerData.css;
  }
  try {
    // Load modules
    const pageAndPropsResult = await resolvePageAndProps({
      pagePath,
      propsPath,
      pageExportName,
      propsExportName,
      route,
      loader: async (id: string) => {
        try {
          const result = await import(join(projectRoot, id));
          return result;
        } catch (error) {
          throw error;
        }
      },
    });
    if (pageAndPropsResult.type !== "success") {
      if (pageAndPropsResult.type === "error") {
        if (process.env["DEV"]) {
          port?.postMessage(
            {
              type: "ERROR",
              id,
              error: {
                message: pageAndPropsResult.error.message,
                stack: pageAndPropsResult.error.stack || "",
                name: pageAndPropsResult.error.name || "",
                cause: pageAndPropsResult.error.cause || "",
              },
            } satisfies RscWorkerOutputMessage,
            []
          );
        } else {
          port?.postMessage({
            type: "ERROR",
            id,
            error: pageAndPropsResult.error.message,
          } satisfies RscWorkerOutputMessage);
        }
      }
      return;
    }
    const { PageComponent, pageProps } = pageAndPropsResult;

    const adaptedOnEvent = (event: "error" | "postpone", data: any) => {
      if (event === "error") {
        postError(data.error, data);
      }
    };

    if (messageCssFiles && messageCssFiles.size > 0) {
      // if any css is added to the message, add it to the cssFiles map
      for (const [id, cssContent] of messageCssFiles.entries()) {
        cssFiles.set(id, cssContent);
      }
    }
    // Create stream
    const streamResult = createRscStream({
      projectRoot: projectRoot,
      Html: React.Fragment,
      PageComponent: PageComponent,
      CssCollector: CssCollectorInline,
      pageProps,
      moduleBase,
      moduleRootPath,
      moduleBasePath,
      moduleBaseURL,
      logger: createLogger(),
      route,
      url:
        typeof moduleBaseURL === "string" && moduleBaseURL !== ""
          ? new URL(id, moduleBaseURL).toString()
          : id,
      // this is a stateful object, which at this point we assume contains all the css files
      cssFiles,
      onEvent: adaptedOnEvent,
      pipeableStreamOptions: pipeableStreamOptions,
    });

    if (streamResult.type !== "success") {
      postError(streamResult.error);
      return;
    }

    const { stream, metrics } = streamResult;

    // Create pass-through stream
    const passThrough = new PassThrough();
    activeStreams.set(id, passThrough);

    // Pipe stream to pass-through
    stream.pipe(passThrough);

    // Handle data chunks
    passThrough.on("data", (chunk) => {
      port?.postMessage({
        type: "RSC_CHUNK",
        id,
        chunk
      } satisfies RscChunkOutputMessage);
    });

    // Handle stream end
    passThrough.on("end", () => {
      port?.postMessage({
        type: "RSC_END",
        id,
        content: [],
      } satisfies RscEndMessage);
      activeStreams.delete(id);
    });

    // Handle errors
    passThrough.on("error", (error) => {
      postError(error as Error);
      activeStreams.delete(id);
    });
  } catch (error) {
    if (process.env["DEV"]) {
      console.error(`[Stream ${id}] Error:`, error);
    }
    postError(error as Error);
  }
}
