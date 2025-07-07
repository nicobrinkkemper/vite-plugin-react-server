import type { PreviewServer } from "vite";
import type {
  ResolvedUserOptions,
  StreamError,
} from "../types.js";
import { join } from "node:path";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { requestInfo } from "../helpers/requestInfo.js";

export type ConfigurePreviewServerProps<Opt extends ResolvedUserOptions> = {
  server: PreviewServer;
  userOptions: Opt;
};

export type ConfigurePreviewServerFn = <Opt extends ResolvedUserOptions>(
  props: ConfigurePreviewServerProps<Opt>
) => Promise<void>;

export const configurePreviewServer: ConfigurePreviewServerFn =
  async function _configurePreviewServer({ server, userOptions }) {
    const staticHostDir = join(
      userOptions.projectRoot,
      userOptions.build.outDir,
      userOptions.build.static
    );
    server.middlewares.use(async (req, res, next) => {
      if (!req.url) {
        return next();
      }
      const { contentType, filePath, isRscRequest } = requestInfo(
        req,
        userOptions,
        staticHostDir,
        server.config.logger
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
                  controller.abort();
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
                  server.config.logger.error(
                    `File not found: ${filePath}. ${streamError.message}`,
                    {
                      error: streamError,
                    }
                  );
                  if (userOptions.verbose) {
                    console.log("File not found: ", filePath);
                  }
                  res.end("File not found");
                } else {
                  // Server error
                  server.config.logger.error(
                    `Error loading file: ${filePath}. ${streamError.message}`,
                    {
                      error: streamError,
                    }
                  );
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
            server.config.logger.error(
              `File not found: ${filePath}. ${err.message}`,
              {
                error: err,
              }
            );
            res.statusCode = 404;
            res.end("File not found");
          } else {
            server.config.logger.error(`Error loading file: ${filePath}.`, {
              error: err,
            });
            res.statusCode = 500;
            res.end("Internal server error");
          }
          return;
        }
      }
      next();
    });
  };
