import type { CssContent, ResolvedUserOptions } from "../types.js";
import type { Logger } from "vite";
import { createCssProps } from "./createCssProps.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Unified CSS Processor
 * 
 * PURPOSE: Consolidate CSS processing logic used across:
 * - processCssFilesForPages (plugin.server.ts, plugin.client.ts)
 * - RSC worker message handler (messageHandler.tsx)
 * - HTML worker message handler
 * 
 * This helper provides consistent CSS processing behavior across all environments
 * and reduces code duplication.
 */

export interface UnifiedCssProcessorOptions {
  /** User options for CSS processing */
  userOptions: ResolvedUserOptions;
  /** Logger for verbose output */
  logger?: Logger;
  /** Whether to enable verbose logging */
  verbose?: boolean;
  /** Static build output directory */
  staticOutDir?: string;
  /** Static manifest for CSS file resolution */
  staticManifest?: any;
  /** Bundle containing CSS files */
  bundle?: any;
}

export interface CssProcessingResult {
  /** CSS files organized by page/route */
  cssFilesByPage: Map<string, Map<string, CssContent>>;
  /** Global CSS files */
  globalCss: Map<string, CssContent>;
  /** Combined CSS files for a specific route */
  combinedCssFiles: Map<string, CssContent>;
}

/**
 * Processes CSS files from static build output
 * 
 * @param cssInputs - CSS file inputs from manifest
 * @param options - Processing options
 * @returns Processed CSS content map
 */
export function processCssFromStaticBuild(
  cssInputs: Record<string, string>,
  options: UnifiedCssProcessorOptions
): Map<string, CssContent> {
  const { userOptions, logger, verbose, staticOutDir, staticManifest } = options;
  const cssMap = new Map<string, CssContent>();

  for (const [key] of Object.entries(cssInputs)) {
    if (verbose) {
      logger?.info(`[unified-css] Loading CSS content for ${key}`);
    }

    // Get CSS content from static build output files
    let cssContent = "";

    // Try to get CSS from static build output directory
    if (staticManifest && staticOutDir) {
      const cssFilePath = join(staticOutDir, key);
      try {
        cssContent = readFileSync(cssFilePath, 'utf-8');
        if (verbose) {
          logger?.info(`[unified-css] Got CSS from static build file: ${cssFilePath}`);
        }
      } catch (error) {
        if (verbose) {
          logger?.info(`[unified-css] Failed to read CSS file: ${cssFilePath} - ${error}`);
        }
      }
    } else {
      if (verbose) {
        logger?.info(`[unified-css] No static manifest available for CSS file: ${key}`);
      }
    }

    if (verbose) {
      logger?.info(
        `[unified-css] CSS content for ${key}: ${typeof cssContent}, length: ${
          cssContent?.length
        }, preview: ${cssContent?.substring(0, 100)}`
      );
    }

    if (
      typeof cssContent !== "string" ||
      cssContent === "undefined" ||
      !cssContent
    ) {
      if (verbose) {
        logger?.info(`[unified-css] Skipping CSS file ${key} - invalid content`);
      }
      continue;
    }

    if (cssContent) {
      cssMap.set(
        key,
        createCssProps({
          id: key,
          code: cssContent,
          userOptions: userOptions,
        })
      );
      if (verbose) {
        logger?.info(`[unified-css] Added CSS file ${key} to map`);
      }
    }
  }

  return cssMap;
}

/**
 * Combines CSS files from multiple sources
 * 
 * @param sources - Array of CSS file maps to combine
 * @returns Combined CSS file map
 */
export function combineCssFiles(
  ...sources: Array<Map<string, CssContent> | undefined>
): Map<string, CssContent> {
  const combined = new Map<string, CssContent>();
  
  for (const source of sources) {
    if (source) {
      for (const [key, value] of source.entries()) {
        combined.set(key, value);
      }
    }
  }
  
  return combined;
}

/**
 * Processes inline CSS content for stateful systems
 * 
 * @param cssFiles - CSS files map
 * @param addCssFileContent - Function to add CSS content to state
 * @param userOptions - User options
 */
export function processInlineCssForState(
  cssFiles: Map<string, CssContent>,
  addCssFileContent: (id: string, content: string, userOptions: ResolvedUserOptions) => void,
  userOptions: ResolvedUserOptions
): void {
  for (const [id, cssContent] of cssFiles.entries()) {
    if (cssContent.children && typeof cssContent.children === 'string') {
      addCssFileContent(id, cssContent.children, userOptions);
    }
  }
}

/**
 * Creates a unified CSS processor instance
 * 
 * @param options - Processing options
 * @returns CSS processor functions
 */
export function createUnifiedCssProcessor(options: UnifiedCssProcessorOptions) {
  return {
    processCssFromStaticBuild: (cssInputs: Record<string, string>) => 
      processCssFromStaticBuild(cssInputs, options),
    combineCssFiles,
    processInlineCssForState,
  };
}
