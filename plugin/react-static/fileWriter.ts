/**
 * fileWriter.ts
 * 
 * PURPOSE: Handles file writing operations for React Server Components (RSC) rendering
 * 
 * This module:
 * 1. Writes HTML and RSC files to the filesystem
 * 2. Creates necessary directories
 * 3. Handles file path construction
 * 4. Provides a clean interface for file operations
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { PageData, FileWriterOptions } from "../types.js";


/**
 * Writes HTML and RSC files for a route
 * 
 * @param route The route to write files for
 * @param pageData The page data containing HTML and RSC content
 * @param options The file writer options
 * @returns A promise that resolves when the files are written
 */
export async function writePageFiles(
  route: string,
  pageData: PageData,
  options: FileWriterOptions
): Promise<void> {
  const { outDir, htmlOutputRoot, htmlOutputPath, onEvent } = options;
  
  // Validate page data
  if (!pageData.html || !pageData.rsc) {
    throw new Error(`Missing HTML or RSC content for route: ${route}`);
  }
  
  // Construct file paths
  let routeHtmlPath = join(
    outDir,
    htmlOutputRoot,
    route,
    htmlOutputPath
  );
  
  // Handle absolute paths
  if (routeHtmlPath.startsWith("/")) {
    routeHtmlPath = routeHtmlPath.slice(1);
  }
  
  // Construct RSC path by replacing .html with .rsc
  const routeRscPath = routeHtmlPath.slice(0, -5) + ".rsc";
  
  // Emit file.write events if onEvent is provided
  if (onEvent) {
    onEvent({
      type: 'file.write',
      data: {
        route,
        fileType: 'rsc',
        content: pageData.rsc.content,
        onComplete: async () => {
          console.log(`[RSC] Wrote RSC file to ${routeRscPath}`);
        }
      }
    });

    onEvent({
      type: 'file.write',
      data: {
        route,
        fileType: 'html',
        content: pageData.html.raw,
        onComplete: async () => {
          console.log(`[RSC] Wrote HTML file to ${routeHtmlPath}`);
        }
      }
    });
  }
} 