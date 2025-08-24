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
import { Transform } from "node:stream";
import type { FileWriterFn } from "./types.js";
import { getNodeEnv } from "../config/getNodeEnv.js";
import { handleError } from "../error/handleError.js";

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
  const isStreamWrapper = (stream as any).pipe && typeof (stream as any).pipe === 'function';

  // Remove leading slash from route for file path construction
  const routePath = options.route === "/" ? "" : options.route.replace(/^\//, "");
  const baseDir = join(
    options.build.outDir,
    options.build.static,
  );
  const outputPath = join(
    baseDir,
    routePath,
    fileType === "html"
      ? options.build.htmlOutputPath
      : options.build.rscOutputPath
  );

  // Ensure directory exists
  try {
    mkdirSync(
      join(baseDir, routePath),
      { recursive: true }
    );
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

  // Create write stream
  const writeStream = createWriteStream(outputPath);

  if (options.verbose) {
    options.logger?.info(`[fileWriter] Starting file write for ${fileType} on route ${options.route}`);
  }

  

  return new Promise<void>((resolve, reject) => {
    // Handle abort signal
    if (signal?.aborted) {
      writeStream.destroy();
      // Preserve the original error that caused the abort
      const abortReason = signal?.reason || new Error("File write aborted");
      reject(abortReason);
      return;
    }

    const abortHandler = () => {
      writeStream.destroy();
      // Preserve the original error that caused the abort
      const abortReason = signal?.reason || new Error("Failed to write: " + outputPath);
      reject(abortReason);
    };

    if (signal) {
      signal.addEventListener("abort", abortHandler);
    }

    // Buffer to collect content for the event
    const chunks: Buffer[] = [];
    const contentStream = new Transform({
      transform(chunk: any, _encoding: any, callback: any) {
        const buffer = Buffer.from(chunk);
        chunks.push(buffer);
        if (options.verbose) {
          options.logger?.info(`[fileWriter:${fileType}] Captured chunk: ${buffer.length} bytes, total chunks: ${chunks.length}`);
          // preview
          if (buffer.length > 0) {
            options.logger?.info(`[fileWriter:${fileType}] Content preview: ${buffer.toString('utf8').substring(0, 200)}...`);
          }
        }
        this.push(chunk);
        callback();
      }
    });

    // Emit file.write event if onEvent is provided
    if (options.onEvent) {
      options.onEvent({
        type: "file.write",
        data: {
          path: outputPath,
          route: options.route,
          fileType,
          stream: contentStream,
          onComplete: () => new Promise<void>((resolveComplete) => {
            // This will be called when the file write completes
            resolveComplete();
          }),
        },
      });
    }

    // Handle stream wrapper or direct stream
    if (isStreamWrapper) {
      // Use the wrapper's pipe method
      (stream as any).pipe(contentStream).pipe(writeStream);
    } else {
      // Direct stream pipe
      stream.pipe(contentStream).pipe(writeStream);
    }

    // Handle completion
    writeStream.on("finish", () => {
      if (signal) {
        signal.removeEventListener("abort", abortHandler);
      }

      if (options.verbose) {
        options.logger?.info(`[fileWriter] Completed file write for ${fileType} on route ${options.route}`);
      }

      // Emit file.write.done events if onEvent is provided
      if (options.onEvent) {
        const content = Buffer.concat(chunks).toString('utf8');
        if (options.verbose) {
          options.logger?.info(`[fileWriter:${fileType}] Emitting file.write.done with content length: ${content.length} bytes, chunks: ${chunks.length}`);
          if (content.length > 0) {
            options.logger?.info(`[fileWriter:${fileType}] Content preview: ${content.substring(0, 200)}...`);
          }
        }
        // Extract file name from the output path
        const fileName = fileType === "html" 
          ? options.build.htmlOutputPath 
          : options.build.rscOutputPath;
          
        // Extract base directory and route path for coloring
        const routePathForEvent = routePath; // This is already the route path without leading slash
          
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
            routePath: routePathForEvent,
          },
        });
      }

      resolve();
    });

    // Handle errors
    writeStream.on("error", (error) => {
      if (signal) {
        signal.removeEventListener("abort", abortHandler);
      }

      if (options.verbose) {
        options.logger?.error(`[fileWriter] Error writing ${fileType} file for route ${options.route}: ${error.message}`);
      }

      reject(error);
    });

        // Handle stream errors (only for direct streams, wrappers handle their own errors)
    if (!isStreamWrapper) {
      stream.on("error", (error) => {
        if (signal) {
          signal.removeEventListener("abort", abortHandler);
        }

        if (options.verbose) {
          options.logger?.error(`[fileWriter] Stream error for ${fileType} file on route ${options.route}: ${error.message}`, {error});
          options.logger?.info(`[fileWriter] Rejecting promise with error: ${error.message}`);
        }

        reject(error);
      });
    }
  });
};

