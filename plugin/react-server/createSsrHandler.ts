import { join, resolve } from "node:path";
import { Writable } from "node:stream";
import { Worker } from "node:worker_threads";
import { type Manifest, type ViteDevServer } from "vite";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import type { RequestHandler, ResolvedUserOptions } from "../types.js";
import type { WorkerRscChunkMessage } from "../worker/types.js";
import { createHandler } from "./createHandler.js";


export function createSsrHandler(
  options: ResolvedUserOptions,
  server: ViteDevServer,
): RequestHandler {
  const worker = new Worker(
    options?.htmlWorkerPath
      ? resolve(server.config.root, options?.htmlWorkerPath)
      : DEFAULT_CONFIG.HTML_WORKER_PATH,
    {
      env: {
        NODE_OPTIONS: "--conditions ''",
        VITE_LOADER_PATH: resolve(
          server.config.cacheDir,
          "react-stream/worker/loader.js"
        ),
      },
    }
  );

  return async function handleSsrRequest(req, res, next) {
    if (
      !req.url ||
      req.url.startsWith("/@") ||
      (req.url.includes(".") && !req.url.endsWith(".html"))
    ) {
      return next();
    }

    try {
      const result = await createHandler(
        req.url ?? "",
        {
          ...options,
          projectRoot: server.config.root,
        },
        {
          loader: server.ssrLoadModule.bind(server),
          moduleGraph: server.moduleGraph,
        }
      );
      const moduleRootPath = join(
        server.config.cacheDir,
        options.moduleBasePath
      );
      // const htmlOutputPath = join(
      //   server.config.cacheDir,
      //   server.config.build.outDir,
      //   req.url,
      //   "index.html"
      // );
      if (result.type !== "success") {
        throw new Error(
          result.type === "error" ? String(result.error) : "Skipped"
        );
      }

      // Collect RSC stream data
      const rscData = await new Promise<string>((resolve, reject) => {
        let data = "";
        if (!result.stream) {
          resolve(data);
          return;
        }
        const writable = new Writable({
          write(chunk, _, callback) {
            data += chunk;
            callback();
          },
          final(callback) {
            resolve(data);
            callback();
          },
        });

        result.stream.pipe(writable);
        writable.on("error", reject);
      });

      // Get HTML from worker
      const html = await new Promise<string>((resolve, reject) => {
        worker.postMessage({
          type: "RSC_CHUNK",
          id: req.url ?? "/",
          chunk: rscData,
          moduleRootPath: moduleRootPath,
          moduleBaseURL: options.moduleBaseURL,
          // Don't need file paths in dev mode
          outDir: "",
          htmlOutputPath: "",
          pipableStreamOptions: options.pipableStreamOptions ?? {},
          clientManifest: {},
          serverManifest: {},
        } satisfies WorkerRscChunkMessage);

        worker.once("message", (msg) => {
          if (msg.type === "ERROR") {
            const message =
              msg.error instanceof Error
                ? msg.error.message
                : String(msg.error);
            reject(new Error(message, { cause: msg }));
          } else if (msg.type === "HTML") {
            // In dev, content will be the HTML string
            resolve(msg.content);
          }
        });
      });

      res.setHeader("Content-Type", "text/html");
      res.end(html);
    } catch (error) {
      next(error);
    }
  };
}
