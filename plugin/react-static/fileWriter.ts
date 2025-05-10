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
import type { FileWriterOptions } from "../types.js";
import { join } from "node:path";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { Readable } from "node:stream";

/**
 * Writes HTML and RSC files for a route using streams
 *
 * @param stream The readable stream containing the content
 * @param fileType The type of file being written ("html" or "rsc")
 * @param options The file writer options
 * @returns A promise that resolves when the file is written
 */
export async function fileWriter(
  stream: Readable,
  fileType: "html" | "rsc",
  options: FileWriterOptions
): Promise<void> {
  const { onEvent } = options;

  // Validate stream
  if (!stream) {
    throw new Error(`Missing stream for route: ${options.route}`);
  }

  const outputPath = join(
    options.build.outDir,
    options.build.static,
    options.route,
    fileType === "html" ? options.build.htmlOutputPath : options.build.rscOutputPath
  );

  // Ensure directory exists
  await mkdir(join(options.build.outDir, options.build.static, options.route), { recursive: true });

  // Create write stream
  const writeStream = createWriteStream(outputPath);

  // Emit file.write events if onEvent is provided
  if (onEvent) {
    onEvent({
      type: "file.write",
      data: {
        stream: stream,
        path: outputPath,
        onComplete: async () => {
          console.log(`[RSC] Wrote ${fileType.toUpperCase()} file to ${options.route}`);
        },
      },
    });
  }

  // Pipe the stream to the file
  return new Promise((resolve, reject) => {
    stream
      .pipe(writeStream)
      .on("finish", resolve)
      .on("error", reject);
  });
}
