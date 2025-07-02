import { resolveComponents } from "../../helpers/resolveComponents.js";
import type { RscRenderMessage } from "./types.js";
import type { StreamHandlers } from "../types.js";
import { activeStreams, cssFiles } from "./state.js";
import { createRscStream } from "../../helpers/createRscStream.js";
import { PassThrough } from "node:stream";
import { join } from "node:path";
import { workerData } from "node:worker_threads";
import { hmrState } from "./state.js";
import { performance } from "node:perf_hooks";
import type { BuildModuleLoader, ResolvedUserOptions } from "../../types.js";
import React from "react";

export type HandleRenderFn = <Msg extends RscRenderMessage = RscRenderMessage>(
  msg: Msg,
  handlers: StreamHandlers
) => Promise<void>;

export const handleRender: HandleRenderFn = async function _handleRender(
  msg,
  handlers
) {
  const {
    id,
    route,
    pagePath,
    propsPath,
    rootPath,
    htmlPath,
    pageExportName = workerData.userOptions.pageExportName,
    propsExportName = workerData.userOptions.propsExportName,
    projectRoot = workerData.userOptions.projectRoot,
    moduleRootPath = workerData.userOptions.moduleRootPath,
    moduleBaseURL = workerData.userOptions.moduleBaseURL ?? "/",
    moduleBasePath = workerData.userOptions.moduleBasePath ?? "/",
    moduleBase = workerData.userOptions.moduleBase,
    pipeableStreamOptions = workerData.userOptions.pipeableStreamOptions,
    cssFiles: messageCssFiles,
    globalCss,
    verbose = workerData.userOptions.verbose,
  } = msg;
  try {
    // Create loader function for module resolution
    const loader = async (moduleID: string) => {
      // Handle #Page/#props suffixes
      const [id, exportName] = moduleID.split('#');
      if (hmrState.get(id)?.invalidated) {
        hmrState.delete(id);
        const res = await import(join(projectRoot, id) + `?t=${Date.now()}`)
        if(!exportName) return res;
        if(exportName in res) return { [exportName]: res[exportName] };
        return res;
      }
      const res = await import(join(projectRoot, id))
      if(!exportName) return res;
      if(exportName in res) return { [exportName]: res[exportName] };
      return res;
    };

    // Load modules (page, props, and components together)
    const componentsResult = await resolveComponents({
      pagePath,
      propsPath,
      rootPath,
      htmlPath,
      pageExportName,
      propsExportName,
      rootExportName: workerData.userOptions.rootExportName,
      htmlExportName: workerData.userOptions.htmlExportName,
      route,
      verbose: workerData.userOptions.verbose,
      loader: loader as BuildModuleLoader<ResolvedUserOptions>,
      // Use components override for headless RSC streams in development
      HtmlComponent: React.Fragment,
    });
    if (componentsResult.type !== "success") {
      const { error, reason } = componentsResult;
      handlers.onError(id, error, { reason });
      return; // Don't propagate the error after handling it
    }

    const { PageComponent, pageProps, RootComponent } = componentsResult;

    // Override HtmlComponent with React.Fragment for headless RSC streams in development
    const finalHtmlComponent = React.Fragment;

    const adaptedOnEvent = (event: "error" | "postpone", data: {
      error?: Error | null;
      errorInfo?: {
        componentStack?: string | null;
        digest?: string | null;
      };
    }) => {
      if (event === "error") {
        handlers.onError(id, data.error, data.errorInfo);
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
      HtmlComponent: finalHtmlComponent,
      PageComponent,
      RootComponent: RootComponent,
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
      verbose,
    });

    if (streamResult.type !== "success") {
      handlers.onError(id, streamResult.error);
      return; // Already handled the error
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
      handlers.onData(id, chunk);
    });

    // Handle stream end
    passThrough.on("end", () => {
      metrics.duration = performance.now() - metrics.startTime;
      handlers.onEnd(id);
      if (activeStreams.has(id)) {
        handlers.onMetrics(id, metrics);
        activeStreams.delete(id);
      }
    });

    // Handle errors
    passThrough.on("error", (error) => {
      handlers.onError(id, error as Error, { reason: `${id} stream error` });
      activeStreams.delete(id);
    });
  } catch (error) {
    handlers.onError(id, error as Error, { reason: `${id} render error` });
    return; // Don't propagate the error after handling it
  }
}
