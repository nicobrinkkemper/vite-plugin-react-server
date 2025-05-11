import { resolvePageAndProps } from "../../helpers/resolvePageAndProps.js";
import type { RscRenderMessage } from "../types.js";
import { activeStreams, cssFiles } from "./state.js";
import { createRscStream } from "../../helpers/createRscStream.js";
import { CssCollector } from "../../css-collector.js";
import { PassThrough } from "node:stream";
import { join } from "node:path";
import { workerData } from "node:worker_threads";
import { React } from "../../vendor.server.js";
import { hmrState } from "./state.js";
import { performance } from "node:perf_hooks";

export async function handleRender(
  msg: RscRenderMessage,
  handlers: {
    onError: (error: any, errorInfo?: any) => void;
    onData: (data: any) => void;
    onEnd: () => void;
    onMetrics: (metrics: any) => void;
  }
) {
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
      loader: (id: string) => {
        try {
          if (hmrState.get(id)?.invalidated) {
            // Clear the HMR state for this module
            hmrState.delete(id);
            // Force a reload by using a unique query parameter
            return import(join(projectRoot, id) + `?t=${Date.now()}`);
          }
          return import(join(projectRoot, id));
        } catch (error) {
          return Promise.reject(error);
        }
      },
    });
    if (pageAndPropsResult.type !== "success") {
      const { error, ...rest } = pageAndPropsResult;
      return handlers.onError(error, rest);
    }

    const { PageComponent, pageProps } = pageAndPropsResult;

    const adaptedOnEvent = (event: "error" | "postpone", data: any) => {
      if (event === "error") {
        handlers.onError(data.error, data.errorInfo);
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
      handlers.onError(streamResult.error);
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
      metrics.chunks++;
      metrics.bytes += chunk.length;
      metrics.duration = performance.now() - metrics.startTime;
      handlers.onData(chunk);
    });

    // Handle stream end
    passThrough.on("end", () => {
      metrics.duration = performance.now() - metrics.startTime;
      handlers.onEnd();
      if (activeStreams.has(id)) {
        handlers.onMetrics(metrics);
        activeStreams.delete(id);
      }
    });

    // Handle errors
    passThrough.on("error", (error) => {
      handlers.onError(error as Error, { reason: `${id} stream error` });
      activeStreams.delete(id);
    });
  } catch (error) {
    handlers.onError(error as Error, { reason: `${id} render error` });
    return Promise.reject(error);
  }
}
