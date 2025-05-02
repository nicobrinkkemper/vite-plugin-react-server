import { join, dirname, resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import type { PluginContext } from "rollup";
import type { PluginEvent } from "../types.js";

export async function defaultFileWriter({
  event,
  outputDir,
  pluginContext,
  root = process.cwd()
}: {
  event: PluginEvent;
  outputDir: string;
  pluginContext?: PluginContext;
  root?: string;
}) {
  if (event.type !== 'file.write') return;

  const { route, fileType, content, onComplete } = event.data;
  
  // For direct file writing, use the full output directory path
  const filePath = join(
    outputDir,
    route === '/' ? '' : route,
    `index.${fileType}`
  );
  
  // Create directory if it doesn't exist
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });
  
  // Write file directly
  await writeFile(filePath, content, 'utf-8');

  // Call onComplete if provided
  if (onComplete) {
    await onComplete();
  }
} 