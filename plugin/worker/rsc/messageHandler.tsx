import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parentPort } from "node:worker_threads";
import { PassThrough } from "node:stream";
import {
  renderToPipeableStream,
  // @ts-ignore
} from "react-server-dom-esm/server.node";
import type {
  RscChunkMessage,
  RscEndMessage,
  RscWorkerMessage,
} from "../types.js";
import { createLogger } from "../../utils/logger.js";
import {
  cssFiles,
  clientFiles,
  serverActionFiles,
  addCssFile,
  clearCssFiles,
} from "./state.js";
import type { WriteStream } from "node:fs";
import React from "react";

const log = createLogger("rsc-worker");

// CSS collector component
function CssCollector({
  children,
  cssFiles,
}: {
  children: React.ReactNode;
  cssFiles: Map<string, string>;
}) {
  return (
    <>
      {Array.from(cssFiles.entries()).map(([id, css]) => {
        return (
          <style key={id} data-source={id}>
            {css}
          </style>
        );
      })}
      {children}
    </>
  );
}

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
        <CssCollector cssFiles={cssFiles}>
          <PageComponent {...props} />
        </CssCollector>,
        moduleBaseURL,
        {
          onError: (error: Error) => {
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
