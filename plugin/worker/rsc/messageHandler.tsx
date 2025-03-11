import { join } from "node:path";
import { PassThrough } from "node:stream";
import { parentPort } from "node:worker_threads";
import React from "react";
import type {
  RscChunkMessage,
  RscEndMessage,
  RscWorkerMessage,
} from "../types.js";
import { addCssFile, cssFiles } from "./state.js";
import { InlineCssCollector } from "../../css-collector-inline.js";
import { createRscStream } from "../../helpers/createRscStream.js";
import { createLogger } from "vite";

export async function messageHandler(message: RscWorkerMessage) {
  switch (message.type) {
    case "RSC_RENDER":
      const {
        id,
        pageImport,
        propsImport,
        pageExportName,
        propsExportName,
        url,
        outDir,
        projectRoot,
        moduleRootPath,
        moduleBaseURL,
        moduleBasePath,
        moduleBase,
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
          typeof propsAtExport === "function"
            ? propsAtExport(url)
            : propsAtExport
        );

        const PageComponent = Component[pageExportName];

        // Create stream using the helper
        const stream = createRscStream({
          Html: React.Fragment,
          Page: PageComponent,
          CssCollector: InlineCssCollector,
          loader: (id: string) => import(id).then((m) => m.default),
          props,
          moduleBase,
          moduleRootPath,
          moduleBasePath,
          moduleBaseURL,
          logger: createLogger(),
          inlineCss: true,
          cssFiles: Array.from(cssFiles.values()).map((css) => ({
            type: "text/css",
            content: css,
            path: css,
          })),
          route: url,
          url: typeof moduleBaseURL === "string" && moduleBaseURL !== "" ? new URL(url, moduleBaseURL).toString() : url,
          root: projectRoot,
          pipableStreamOptions: {
            ...pipableStreamOptions,
            onError: (error: unknown) => {
              if (typeof pipableStreamOptions.onError === "function") {
                pipableStreamOptions.onError(error);
              }
              parentPort?.postMessage({
                type: "ERROR",
                id,
                error: error instanceof Error ? error.message : String(error),
              });
            },
            onPostpone: (reason: string) => {
              if (typeof pipableStreamOptions.onPostpone === "function") {
                pipableStreamOptions.onPostpone(reason);
              }
              parentPort?.postMessage({
                type: "POSTPONE",
                id,
                reason,
              });
            },
          },
        });

        if (!stream) {
          throw new Error("Failed to create stream");
        }

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
      break;
    case "CSS_FILE":
      addCssFile(message.id, message.cssFile);
      break;
  }
}
