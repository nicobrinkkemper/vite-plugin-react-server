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
import { createWriteStream, unlink } from "node:fs";
import { mkdir } from "node:fs/promises";
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
export const fileWriter: FileWriterFn = async function _fileWriter(
  stream,
  fileType,
  options,
  signal
) {
  const { onEvent } = options;

  // Validate stream
  if (!stream) {
    throw new Error(`Missing stream for route: ${options.route}`);
  }

  const outputPath = join(
    options.build.outDir,
    options.build.static,
    options.route,
    fileType === "html"
      ? options.build.htmlOutputPath
      : options.build.rscOutputPath
  );

  // Ensure directory exists
  try {
    await mkdir(
      join(options.build.outDir, options.build.static, options.route),
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

  // Create transform stream to capture content
  const contentCapture = new Transform({
    transform(chunk, _encoding, callback) {
      // Pass through the chunk
      callback(null, chunk);
    },
  });

  // Collect chunks for content
  const chunks: Buffer[] = [];
  contentCapture.on("data", (chunk) => {
    chunks.push(Buffer.from(chunk));
  });

  // Emit file.write events if onEvent is provided
  if (onEvent) {
    onEvent({
      type: "file.write",
      data: {
        fileType: fileType,
        route: options.route,
        stream: stream,
        path: outputPath,
        onComplete: async () => {},
      },
    });
  }

  // Pipe the stream through content capture to file
  return new Promise((resolve, reject) => {
    let finished = false;
    function done(err?: Error) {
      if (finished) return;
      finished = true;
      if (err) return reject(err);

      // Combine chunks into content
      const content = Buffer.concat(chunks).toString("utf-8");
      const trimmedContent = content.trim();

      // Emit file.write.done event with content (even if empty)
      if (onEvent) {
        onEvent({
          type: "file.write.done",
          data: {
            fileType: fileType,
            route: options.route,
            content: trimmedContent ? content : "",
          },
        });
      }
      resolve();
    }

    // Handle abort signal
    if (signal) {
      signal.addEventListener("abort", () => {
        if (!finished) {
          finished = true;
          // Clean up streams with abort reason
          const reason = signal.reason ?? new Error("Aborted");
          writeStream.destroy(reason);
          contentCapture.destroy(reason);
          stream.destroy(reason);
          
          // Remove the file if it was created
          unlink(outputPath, (unlinkError) => {
            if (unlinkError && unlinkError.code !== 'ENOENT') {
              // Log error but don't fail the abort operation
              options.logger.warn(`Failed to remove file ${outputPath}: ${unlinkError.message}`);
            }
            resolve();
          });
        }
      });
    }

    writeStream.on("finish", () => done());
    writeStream.on("close", () => done());
    writeStream.on("error", (err) => done(err));

    // Handle errors on input stream and content capture
    stream.on("error", (err) => done(err));
    contentCapture.on("error", (err) => done(err));

    stream.pipe(contentCapture).pipe(writeStream);
  });
};
