import type {
  RscChunkOutputMessage,
  RscEndMessage,
  RscMetricsMessage,
  RscWorkerOutputMessage,
} from "../types.js";
import { resolvePageAndProps } from "../../helpers/resolvePageAndProps.js";
import type { RscRenderMessage } from "../types.js";
import { activeStreams, cssFiles } from "./state.js";
import { createRscStream } from "../../helpers/createRscStream.js";
import { CssCollector } from "../../css-collector.js";
import { PassThrough } from "node:stream";
import { join } from "node:path";
import { parentPort, workerData, type MessagePort } from "node:worker_threads";
import { React } from "../../vendor.server.js";
import { hmrState } from "./state.js";


export async function handleRender(
  msg: RscRenderMessage,
  port = parentPort,
  _reactLoaderPort: MessagePort,
  _cssLoaderPort: MessagePort
) {
  const postError = process.env["DEV"]
    ? (error: any, errorInfo?: any) => {
        if (!(error instanceof Error)) {
          error = new Error(String(error));
        }
        port?.postMessage({
          type: "ERROR",
          id: msg.id,
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
          id: msg.id,
          errorInfo,
          error: error.message,
        } satisfies RscWorkerOutputMessage);
      };

  let {
    id = workerData.id,
    route = workerData.route,
    pagePath = workerData.pagePath,
    propsPath = workerData.propsPath,
    pageExportName = workerData.userOptions.pageExportName,
    propsExportName = workerData.userOptions.propsExportName,
    projectRoot = workerData.userOptions.projectRoot,
    moduleRootPath = workerData.userOptions.moduleRootPath,
    moduleBaseURL = workerData.userOptions.moduleBaseURL,
    moduleBasePath = workerData.userOptions.moduleBasePath,
    moduleBase = workerData.userOptions.moduleBase,
    pipeableStreamOptions = workerData.userOptions.pipeableStreamOptions,
    cssFiles: messageCssFiles,
    globalCss = workerData.globalCss,
  } = msg;

  try {
    // Load modules
    const pageAndPropsResult = await resolvePageAndProps({
      pagePath,
      propsPath,
      pageExportName,
      propsExportName,
      route,
      loader: async (id: string) => {
        // Check if module is invalidated
        if (hmrState.get(id)?.invalidated) {
          // Clear the HMR state for this module
          hmrState.delete(id);
          // Force a reload by using a unique query parameter
          return import(join(projectRoot, id) + `?t=${Date.now()}`);
        }
        return import(join(projectRoot, id));
      },
    });

    if (pageAndPropsResult.type !== "success") {
      if (pageAndPropsResult.type === "error") {
        postError(pageAndPropsResult.error);
      }
      return;
    }

    const { PageComponent, pageProps } = pageAndPropsResult;

    const adaptedOnEvent = (event: "error" | "postpone", data: any) => {
      if (event === "error") {
        postError(data.error, data.errorInfo);
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
      CssCollector: CssCollector,
      pageProps,
      moduleBase,
      moduleRootPath,
      moduleBasePath,
      moduleBaseURL,
      manifest: {},
      route,
      // this is a stateful object, which at this point we assume contains all the css files
      cssFiles,
      globalCss,
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
        chunk,
      } satisfies RscChunkOutputMessage);
    });

    // Handle stream end
    passThrough.on("end", () => {
      port?.postMessage({
        type: "RSC_END",
        id,
      } satisfies RscEndMessage);
      if (activeStreams.has(id)) {
        port?.postMessage({
          type: "RSC_METRICS",
          id,
          metrics,
        } satisfies RscMetricsMessage);
        activeStreams.delete(id);
      }
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
