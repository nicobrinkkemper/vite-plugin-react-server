import { dirname, join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import type { PluginEvent } from "../types.js";

export async function defaultFileWriter({
  event,
  projectRoot,
}: {
  event: PluginEvent;
  projectRoot: string;
}) {
  if (event.type !== 'file.write') return;

  const { path, content, stream, onComplete } = event.data;
  
  // For direct file writing, use the full output directory path
  const filePath = path;
  
  // Create directory if it doesn't exist
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });
  
  if (stream) {
    // Handle streaming write
    const writeStream = createWriteStream(join(projectRoot, filePath));
    await new Promise<void>((resolve, reject) => {
      stream
        .pipe(writeStream)
        .on("finish", () => resolve())
        .on("error", reject);
    });
  } else if (content) {
    // Handle string content write
    await writeFile(join(projectRoot, filePath), content, 'utf-8');
  } else {
    throw new Error('Neither content nor stream provided for file write');
  }

  // Call onComplete if provided
  if (onComplete) {
    await onComplete();
  }
} 