import type {  
  StreamError,  
} from "../types.js";
import { join } from "node:path";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { requestInfo } from "../helpers/requestInfo.js";
import { logError } from "../error/logError.js";
import type { ConfigurePreviewServerFn } from "./types.js";

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
      const { contentType, filePath, isRscRequest } = requestInfo(
        req,
        handlerOptions,
        staticHostDir,  
      );
      
      // Handle static files including CSS
      if (filePath && (isRscRequest)) {
        try {
          const stats = await stat(filePath);
          if (stats.isFile()) {
            res.setHeader("Content-Type", contentType);

            // Create abort controller for the stream
            const controller = new AbortController();
            const { signal } = controller;

            // Check if response is still writable before streaming
            if (!res.writable) {
              res.statusCode = 499;
              res.end("Client closed request");
              return;
            }

            try {
              const readStream = createReadStream(filePath);
              readStream.on("error", () => {
                if (!res.writable) {
                  controller.abort("aborted by preview server");
                }
              });
              await pipeline(readStream, res, { signal });
            } catch (error) {
              if (
                error != null &&
                typeof error === "object" &&
                "code" in error
              ) {
                const streamError = error as StreamError;
                // Handle different error cases
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
                  // File not found
                  res.statusCode = 404;
                  logError(streamError, logger);

                  res.end("File not found");
                } else {
                  // Server error
                  logError(streamError, logger);
                  res.statusCode = 500;
                  res.end("Internal server error");
                }
              }
              return;
            }
            return;
          }
        } catch (error) {
          const err = error as Error;
          // Handle file system errors
          if ((err as NodeJS.ErrnoException).code === "ENOENT") {
            logError(err, logger);
            res.statusCode = 404;
            res.end("File not found");
          } else {
            logError(err, logger);
            res.statusCode = 500;
            res.end("Internal server error");
          }
          return;
        }
      }
      next();
    });
  };
