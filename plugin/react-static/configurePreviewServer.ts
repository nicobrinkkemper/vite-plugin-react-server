import type { StreamError } from "../types.js";
import type { Connect, Logger } from "vite";
import type { ServerResponse } from "node:http";
import { join } from "node:path";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { isPathWithin } from "../helpers/isPathWithin.js";
import { requestInfo } from "../helpers/requestInfo.js";
import { logError } from "../error/logError.js";
import type { ConfigurePreviewServerFn } from "./types.js";

/**
 * The requests Vite's preview would answer with its SPA fallback (the root
 * `index.html`): a GET/HEAD whose Accept is absent or takes a document.
 */
function acceptsDocument(req: Connect.IncomingMessage): boolean {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  const accept = req.headers.accept;
  return !accept || accept.includes("text/html") || accept.includes("*/*");
}

async function isFile(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function streamFile(
  req: Connect.IncomingMessage,
  res: ServerResponse,
  filePath: string,
  contentType: string,
  logger: Logger
): Promise<void> {
  res.setHeader("Content-Type", contentType);
  if (req.method === "HEAD") {
    res.end();
    return;
  }

  // Check if response is still writable before streaming
  if (!res.writable) {
    res.statusCode = 499;
    res.end("Client closed request");
    return;
  }

  const controller = new AbortController();
  const { signal } = controller;
  try {
    const readStream = createReadStream(filePath);
    readStream.on("error", () => {
      if (!res.writable) {
        controller.abort("aborted by preview server");
      }
    });
    await pipeline(readStream, res, { signal });
  } catch (error) {
    if (error != null && typeof error === "object" && "code" in error) {
      const streamError = error as StreamError;
      if (
        streamError.code === "ERR_STREAM_PREMATURE_CLOSE" ||
        streamError.name === "AbortError"
      ) {
        // Client closed the connection
        if (res.writable) {
          res.statusCode = 499;
          res.end("Client closed request");
        }
      } else if (streamError.code === "ENOENT") {
        res.statusCode = 404;
        logError(streamError, logger);
        res.end("File not found");
      } else {
        logError(streamError, logger);
        res.statusCode = 500;
        res.end("Internal server error");
      }
    }
  }
}

/**
 * Serves the static build the way a static host does: a navigation resolves
 * to `<route>/index.html` with or without a trailing slash, an unknown route
 * is a 404, and a flight request reads `<route>/index.rsc`. Assets fall
 * through to Vite's own static serving.
 */
export const configurePreviewServer: ConfigurePreviewServerFn =
  function _configurePreviewServer({ server, userOptions }) {
    const staticHostDir = join(
      userOptions.projectRoot,
      userOptions.build.outDir,
      userOptions.build.static
    );

    server.middlewares.use(async (req, res, next) => {
      if (!req.url) {
        return next();
      }
      const logger = server.config.customLogger || server.config.logger;
      const handlerOptions = {
        ...userOptions,
        logger,
      };
      const {
        contentType,
        filePath,
        htmlFilePath,
        isRscRequest,
        isFolder,
        isHtml,
      } = requestInfo(req, handlerOptions, staticHostDir);

      if (filePath && isRscRequest) {
        // Containment assertion (defense in depth). `filePath` is
        // resolve(staticHostDir, <route>); route normalization already clamps
        // `../`, but assert the resolved path stays under the static dir so a
        // future change to URL handling cannot silently reintroduce traversal.
        if (!isPathWithin(staticHostDir, filePath)) {
          res.statusCode = 403;
          res.end("Forbidden");
          return;
        }
        if (!(await isFile(filePath))) {
          res.statusCode = 404;
          res.end("File not found");
          return;
        }
        return streamFile(req, res, filePath, contentType, logger);
      }

      // A page navigation. Left to Vite, a path without its own index.html
      // gets the root index.html (the SPA fallback): /about would show the
      // home page and /nope would answer 200.
      if (htmlFilePath && (isFolder || isHtml) && acceptsDocument(req)) {
        if (!isPathWithin(staticHostDir, htmlFilePath)) {
          res.statusCode = 403;
          res.end("Forbidden");
          return;
        }
        if (!(await isFile(htmlFilePath))) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("Not Found");
          return;
        }
        return streamFile(
          req,
          res,
          htmlFilePath,
          "text/html; charset=utf-8",
          logger
        );
      }
      next();
    });
  };
