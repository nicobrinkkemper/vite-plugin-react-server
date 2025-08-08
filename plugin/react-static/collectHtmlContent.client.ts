/**
 * collectHtmlContent.client.ts
 *
 * PURPOSE: Takes an RSC stream and returns an HTML stream
 *
 * Uses the same pattern as handleHtmlRender.ts: ReactDOMClient.createFromNodeStream + ReactDOMServer.renderToPipeableStream
 */

import { PassThrough } from "node:stream";
import { createStreamMetrics } from "../metrics/createStreamMetrics.js";
import type { CollectHtmlContentFn } from "./types.js";
import { ReactDOMServer } from "../vendor/vendor.client.js";
import { join } from "node:path";
import { tryManifest } from "../helpers/tryManifest.js";
import type { Manifest } from "vite";
import { createNodeStream } from "../helpers/createNodeStream.client.js";

export const collectHtmlContent: CollectHtmlContentFn =
  async function _collectHtmlContent(rsc, handlerOptions) {
    const metrics = createStreamMetrics();

    if (handlerOptions.verbose) {
      handlerOptions.logger.info(
        `[collectHtmlContent.client] Starting HTML rendering for route: ${handlerOptions.route}`
      );
    }

    try {
      if (!rsc) {
        throw new Error("RSC stream is required for HTML rendering");
      }

      // Check if rsc is a handler object with a stream property
      const rscStream = (rsc as any).stream || rsc;
      if (!rscStream) {
        throw new Error("No RSC stream available for HTML rendering");
      }

      if (handlerOptions.verbose) {
        handlerOptions.logger.info(
          `[collectHtmlContent.client] Using RSC stream from handler`
        );
      }

      // Load the static manifest for module resolution
      const projectRoot = handlerOptions.projectRoot || process.cwd();
      const buildOutDir = handlerOptions.build?.outDir || "dist";
      const staticDir = handlerOptions.build?.static || "static";
      
      const manifestResult = await tryManifest({
        root: projectRoot,
        ssrManifest: false,
        outDir: join(buildOutDir, staticDir),
      });

      let manifest: Manifest = {};
      if (manifestResult.type === "success") {
        manifest = manifestResult.manifest;
        if (handlerOptions.verbose) {
          handlerOptions.logger.info(
            `[collectHtmlContent.client] Loaded manifest with ${Object.keys(manifest).length} entries`
          );
        }
      } else if (manifestResult.type === "error") {
        if (handlerOptions.verbose) {
          handlerOptions.logger.warn(
            `[collectHtmlContent.client] Failed to load manifest: ${manifestResult.error.message}`
          );
        }
      } else {
        // manifestResult.type === "skip"
        if (handlerOptions.verbose) {
          handlerOptions.logger.warn(
            `[collectHtmlContent.client] Manifest loading skipped`
          );
        }
      }

      // Create client build loader for module resolution
      // clientDir is no longer needed since moduleRootPath is set in config

      // Construct the correct moduleRootPath following the HTML worker pattern
      let resolvedModuleRootPath = handlerOptions.moduleRootPath || "";

      if (typeof resolvedModuleRootPath !== "string") {
        throw new Error("moduleRootPath is required");
      } else if (!resolvedModuleRootPath.startsWith(projectRoot)) {
        resolvedModuleRootPath = join(projectRoot, resolvedModuleRootPath);
      }

      // For client static generation, we need to resolve client components
      // The moduleRootPath is already set correctly in resolveUserConfig based on command
      resolvedModuleRootPath = handlerOptions.moduleRootPath.endsWith("/") ? handlerOptions.moduleRootPath : handlerOptions.moduleRootPath + "/";

      if (handlerOptions.verbose) {
        handlerOptions.logger.info(
          `[collectHtmlContent.client] Using moduleRootPath: "${resolvedModuleRootPath}"`
        );
      }

      // Convert RSC stream to React elements using ReactDOMClient.createFromNodeStream
      const { elements } = createNodeStream({
        rscStream,
        moduleBaseURL: handlerOptions.moduleBaseURL || '/',
        moduleRootPath: resolvedModuleRootPath,
        moduleBasePath: resolvedModuleRootPath,
        logger: handlerOptions.logger
      });

      // Convert React elements to HTML using ReactDOMServer.renderToPipeableStream
      const htmlStream = new PassThrough();
      
      if (handlerOptions.verbose) {
        handlerOptions.logger.info(
          `[collectHtmlContent.client] Starting ReactDOMServer.renderToPipeableStream for route: ${handlerOptions.route}`
        );
      }
      
      const { pipe, abort } = ReactDOMServer.renderToPipeableStream(
        elements,
        {
          onAllReady() {
            if (handlerOptions.verbose) {
              handlerOptions.logger.info(
                `[collectHtmlContent.client] onAllReady() called - piping and ending htmlStream for route: ${handlerOptions.route}`
              );
            }
            pipe(htmlStream);
            // Note: Don't call htmlStream.end() here - the pipe operation will handle it
          },
          onError(error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (handlerOptions.verbose) {
              handlerOptions.logger.error(
                `[collectHtmlContent.client] React rendering error: ${errorMessage}`
              );
            }
            // Don't destroy the stream in onError - let it handle the error gracefully
          }
        }
      );

      // Track metrics
      htmlStream.on('data', (chunk) => {
        metrics.chunks++;
        metrics.bytes += chunk.length;
        if (handlerOptions.verbose) {
          handlerOptions.logger.info(
            `[collectHtmlContent.client] htmlStream data event: chunk ${metrics.chunks}, bytes: ${chunk.length}, total: ${metrics.bytes}`
          );
        }
      });

      htmlStream.on('end', () => {
        if (handlerOptions.verbose) {
          handlerOptions.logger.info(
            `[collectHtmlContent.client] htmlStream end event - Generated HTML: ${metrics.bytes} bytes`
          );
        }
      });

      htmlStream.on('close', () => {
        if (handlerOptions.verbose) {
          handlerOptions.logger.info(
            `[collectHtmlContent.client] htmlStream close event for route: ${handlerOptions.route}`
          );
        }
      });

      htmlStream.on('error', (error) => {
        if (handlerOptions.verbose) {
          handlerOptions.logger.error(
            `[collectHtmlContent.client] htmlStream error event: ${error.message}`
          );
        }
      });

      // Return the HTML stream with metrics
      return { 
        pipe: htmlStream.pipe.bind(htmlStream), 
        abort: () => {
          abort();
          htmlStream.destroy();
        }, 
        metrics 
      };

    } catch (error: any) {
      if (handlerOptions.verbose) {
        handlerOptions.logger.error(
          `[collectHtmlContent.client] Error: ${error.message}`
        );
      }

      const errorStream = new PassThrough();
      errorStream.end();

      return {
        pipe: errorStream.pipe.bind(errorStream),
        abort: () => errorStream.destroy(),
        metrics,
      };
    }
  }; 