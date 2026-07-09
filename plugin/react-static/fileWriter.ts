/**
 * fileWriter.ts
 *
 * PURPOSE: Handles file writing operations for React Server Components (RSC) rendering
 *
 * This module:
 * 1. Writes HTML and RSC files to the filesystem using streams
 * 2. Creates necessary directories
 * 3. Handles file path construction
 * 4. Provides a clean interface for file operations
 */
import { join } from "node:path";
import { createWriteStream, mkdirSync } from "node:fs";
import { Transform, PassThrough } from "node:stream";
import type { FileWriterFn } from "./types.js";
import { getNodeEnv } from "../config/getNodeEnv.js";
import { handleError } from "../error/handleError.js";

/**
 * A robust content collecting transform stream that handles race conditions
 */
class ContentCollectorStream extends Transform {
  private chunks: Buffer[] = [];
  private _isFinished = false;
  private _onAllChunksCollected?: () => void;

  constructor(options: any = {}) {
    super({
      ...options,
      objectMode: false,
    });
  }

  _transform(chunk: any, _encoding: any, callback: any) {
    if (this._isFinished) {
      callback();
      return;
    }

    const buffer = Buffer.from(chunk);
    this.chunks.push(buffer);
    this.push(chunk);
    callback();
  }

  _flush(callback: any) {
    this._isFinished = true;
    if (this._onAllChunksCollected) {
      this._onAllChunksCollected();
    }
    callback();
  }

  getAllChunks(): Buffer[] {
    return this.chunks;
  }

  getContent(): string {
    return Buffer.concat(this.chunks).toString('utf8');
  }

  hasContent(): boolean {
    return this.chunks.length > 0;
  }

  onAllChunksCollected(callback: () => void) {
    if (this._isFinished) {
      // Already finished, call immediately
      callback();
    } else {
      this._onAllChunksCollected = callback;
    }
  }
}

/**
 * Writes HTML and RSC files for a route using streams
 *
 * @param stream The readable stream containing the content
 * @param fileType The type of file being written ("html" or "rsc")
 * @param options The file writer options
 * @param signal Optional AbortSignal to cancel the file write operation
 * @returns A promise that resolves when the file is written
 */
export const fileWriter: FileWriterFn = function _fileWriter(
  stream,
  fileType,
  options,
  signal
) {
  // Validate stream or stream wrapper
  if (!stream) {
    throw new Error(`Missing stream for route: ${options.route}`);
  }

  // Handle stream wrapper objects (from renderPage.server.ts)
  const isStreamWrapper =
    (stream as any).pipe && typeof (stream as any).pipe === "function";

  // Remove leading slash from route for file path construction
  const routePath =
    options.route === "/" ? "" : options.route.replace(/^\//, "");
  const baseDir = join(options.build.outDir, options.build.static);
  const outputPath = join(
    baseDir,
    routePath,
    fileType === "html"
      ? options.build.htmlOutputPath
      : options.build.rscOutputPath
  );

  // Ensure directory exists
  try {
    mkdirSync(join(baseDir, routePath), { recursive: true });
  } catch (error) {
    const panicError = handleError({
      error,
      logger: options.logger,
      mode: getNodeEnv(),
      panicThreshold: options.panicThreshold,
      critical: false,
      context: "fileWriter",
    });
    if (panicError != null) {
      throw panicError;
    }
  }

  if (options.verbose) {
    options.logger?.info(
      `[fileWriter] Starting file write for ${fileType} on route ${options.route}`
    );
  }

  // Handle abort signal early
  if (signal?.aborted) {
    const abortReason = signal?.reason || new Error("File write aborted");
    throw abortReason;
  }

  // Create streams with proper error handling
  const contentCollector = new ContentCollectorStream({
    highWaterMark: 64 * 1024, // 64KB buffer
  });

  const writeStream = createWriteStream(outputPath, {
    highWaterMark: 64 * 1024, // 64KB buffer
  });

  // Create a robust source stream that handles wrappers properly
  let sourceStream: any;
  if (isStreamWrapper) {
    // Create a PassThrough stream to normalize the wrapper
    sourceStream = new PassThrough();
    try {
      (stream as any).pipe(sourceStream);
    } catch (error) {
      throw new Error(`Failed to pipe stream wrapper: ${error}`);
    }
  } else {
    sourceStream = stream;
  }

  // Emit file.write event if onEvent is provided
  if (options.onEvent) {
    try {
      options.onEvent({
        type: "file.write",
        data: {
          path: outputPath,
          route: options.route,
          fileType,
          stream: contentCollector,
          onComplete: () =>
            new Promise<void>((resolveComplete) => {
              resolveComplete();
            }),
        },
      });
    } catch (error) {
      // For file.write events, we need to emit a route.error event
      if (options.onEvent) {
        options.onEvent({
          type: "route.error",
          data: {
            error: error,
            route: options.route,
            panicThreshold: options.panicThreshold
          }
        });
      }
      throw error;
    }
  }

  return new Promise<void>((resolve, reject) => {
    // Handle abort signal
    const abortHandler = () => {
      writeStream.destroy();
      contentCollector.destroy();
      sourceStream.destroy?.();
      const abortReason = signal?.reason || new Error("File write aborted");
      reject(abortReason);
    };

    if (signal) {
      signal.addEventListener("abort", abortHandler);
    }

    // Set up the stream pipeline manually for better control
    sourceStream.pipe(contentCollector).pipe(writeStream);

    // Handle errors from any part of the pipeline
    const handleError = (error: Error) => {
      if (signal) {
        signal.removeEventListener("abort", abortHandler);
      }
      if (options.verbose) {
        options.logger?.error(
          `[fileWriter] Error writing ${fileType} file for route ${options.route}: ${error.message}`
        );
      }
      reject(error);
    };

    sourceStream.on('error', handleError);
    contentCollector.on('error', handleError);
    writeStream.on('error', handleError);

    // Handle successful completion
    writeStream.on("finish", () => {
      if (signal) {
        signal.removeEventListener("abort", abortHandler);
      }

      if (options.verbose) {
        options.logger?.info(
          `[fileWriter] Completed file write for ${fileType} on route ${options.route}`
        );
      }

      // Wait for content collector to finish processing all chunks
      contentCollector.onAllChunksCollected(() => {
        // Emit file.write.done event if onEvent is provided
        if (options.onEvent) {
          if (contentCollector.hasContent()) {
            const content = contentCollector.getContent();
            const chunks = contentCollector.getAllChunks();
            
            if (options.verbose) {
              options.logger?.info(
                `[fileWriter:${fileType}] Emitting file.write.done with content length: ${content.length} bytes, chunks: ${chunks.length}`
              );
              if (content.length > 0) {
                options.logger?.info(
                  `[fileWriter:${fileType}] Content preview: ${content.substring(0, 200)}...`
                );
              }
            }

            // Extract file name from the output path
            const fileName =
              fileType === "html"
                ? options.build.htmlOutputPath
                : options.build.rscOutputPath;

            try {
              options.onEvent({
                type: "file.write.done",
                data: {
                  route: options.route,
                  fileType,
                  content,
                  chunks: chunks.length,
                  path: outputPath,
                  fileName,
                  baseDir: baseDir,
                  routePath: routePath,
                },
              });
            } catch (error) {
              // For file.write.done events, we need to emit a route.error event
              if (options.onEvent) {
                options.onEvent({
                  type: "route.error",
                  data: {
                    error: error,
                    route: options.route,
                    panicThreshold: options.panicThreshold
                  }
                });
              }
              reject(error);
              return;
            }

            // Loud guard against a silently-degraded document. A full-document
            // SSG page must have a root <html> element; if the render fell back
            // to a fragment (e.g. a server-component document wrapper failed to
            // render), the file has content but no <html>/<head>/<body> — a
            // broken page that would otherwise ship in a GREEN build. Surface it
            // as a route.error so panic policy applies, instead of writing it
            // silently. RSC payloads (fileType "rsc") are exempt — only the HTML
            // document is expected to be a full document.
            if (fileType === "html" && !/<html[\s>]/i.test(content)) {
              const degradeError = new Error(
                `[fileWriter] Degraded HTML document for route ${options.route}: ` +
                  `${content.length} bytes emitted with no <html> root element. The ` +
                  `document wrapper did not render — the page shipped without ` +
                  `<html>/<head>/<body>. This is usually a server-component render ` +
                  `that failed and fell back to a fragment (check for a swallowed ` +
                  `RSC render error on this route).`
              );
              options.logger?.error(degradeError.message);
              options.onEvent?.({
                type: "route.error",
                data: {
                  error: degradeError,
                  route: options.route,
                  panicThreshold: options.panicThreshold,
                },
              });
            }
          } else {
            // Instead of rejecting, let's be more lenient about empty content
            // This can happen legitimately with empty files or fast builds
            if (options.verbose) {
              options.logger?.warn(
                `[fileWriter] No content chunks collected for ${fileType} file: ${outputPath}. This may be normal for empty files.`
              );
            }
            
            // Still emit the done event, but with empty content
            const fileName =
              fileType === "html"
                ? options.build.htmlOutputPath
                : options.build.rscOutputPath;

            try {
              options.onEvent({
                type: "file.write.done",
                data: {
                  route: options.route,
                  fileType,
                  content: "",
                  chunks: 0,
                  path: outputPath,
                  fileName,
                  baseDir: baseDir,
                  routePath: routePath,
                },
              });
            } catch (error) {
              if (options.onEvent) {
                options.onEvent({
                  type: "route.error",
                  data: {
                    error: error,
                    route: options.route,
                    panicThreshold: options.panicThreshold
                  }
                });
              }
              reject(error);
              return;
            }
          }
        }

        resolve();
      });
    });
  });
};
