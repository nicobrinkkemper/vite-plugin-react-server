import { join } from "node:path";
import { PassThrough } from "node:stream";
import { parentPort } from "node:worker_threads";
import React from "react";
import {
  renderToPipeableStream,
  // @ts-ignore
} from "react-server-dom-esm/server.node";
import { createLogger } from "../../utils/logger.js";
import type {
  RscChunkMessage,
  RscEndMessage,
  RscWorkerMessage,
} from "../types.js";
import {
  addCssFile,
  cssFiles
} from "./state.js";
import { CssCollector } from "../../components.js";

const log = createLogger("rsc-worker");

export async function messageHandler(message: RscWorkerMessage) {

  if (message.type === "RSC_RENDER") {
    const {
      id,
      pageImport,
      propsImport,
      pageExportName,
      propsExportName,
      url,
      outDir,
      projectRoot,
      moduleBaseURL,
      moduleBasePath,
      pipableStreamOptions,
    } = message;

    try {
      // Load modules which will trigger CSS loading
      const [Component, propsModule] = await Promise.all([
        import(join(projectRoot, pageImport)),
        import(join(projectRoot, propsImport)),
      ]);

      const propsAtExport = propsModule[propsExportName];
      const props = await Promise.resolve(
        typeof propsAtExport === "function" ? propsAtExport(url) : propsAtExport
      );

      const PageComponent = Component[pageExportName];
      // Now render with collected CSS
      const stream = renderToPipeableStream(
        <CssCollector cssFiles={Array.from(cssFiles.values())} moduleBaseUrl={moduleBasePath}>
          <PageComponent {...props} />
        </CssCollector>,
        moduleBaseURL,
        {
          onError: (error: Error) => {
            console.log('onError', error);
            log.error(`Stream error at ${id}:`, error);
            parentPort?.postMessage({
              type: "ERROR",
              id,
              error: error instanceof Error ? error.message : String(error),
            });
          },
          onPostpone: log?.info ?? console.info,
          environmentName: "Server",
          importMap: {
            imports: {
              ...pipableStreamOptions?.importMap?.imports,
              "/": moduleBasePath,
            },
          },
          ...pipableStreamOptions,
        }
      );

      // Listen for data and end events
      const passThrough = new PassThrough();

      stream.pipe(passThrough);

      passThrough.on("data", (chunk) => {
        // Send to parent
        parentPort?.postMessage({
          type: "RSC_CHUNK",
          id,
          chunk: chunk.toString(),
          moduleRootPath: moduleBasePath,
          moduleBaseURL,
          outDir,
          rscOutputPath: `${outDir}/${id}.rsc`,
          cssFiles: Array.from(cssFiles.entries()),
        } satisfies RscChunkMessage);
      });

      passThrough.on("end", () => {
        parentPort?.postMessage({
          type: "RSC_END",
          id,
        } satisfies RscEndMessage);
      });
    } catch (error) {
      console.trace(error);
      parentPort?.postMessage({
        type: "ERROR",
        id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  } else if (message.type === "CSS_FILE") {
    addCssFile(message.id, message.cssFile);
  }
}
