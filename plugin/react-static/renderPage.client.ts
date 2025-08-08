import { createRenderMetrics } from "../metrics/createRenderMetrics.js";
import { routeToURL } from "../utils/routeToURL.js";
import type { RenderPageFn } from "./types.js";
import { handleError } from "../error/handleError.js";
import { assertNonReactServer } from "../config/getCondition.js";
import { createHandler } from "../helpers/createHandler.client.js";
import { collectRscContent } from "./collectRscContent.js";
import { collectHtmlContent } from "./collectHtmlContent.client.js";

assertNonReactServer();

/**
 * Client version of renderPage that uses the react-client pattern
 * This uses the same infrastructure as the react-client plugin but for static generation
 */
export const renderPage: RenderPageFn = async function* _renderPageClient(
  handlerOptions
) {
  // Skip if no pagePath AND no PageComponent provided (fallback case)
  if (!handlerOptions.pagePath) {
    yield {
      type: "skip",
      reason: "No pagePath provided",
    };
    return;
  }
  if (!handlerOptions.url) {
    handlerOptions.url = routeToURL(
      handlerOptions.route,
      handlerOptions.moduleBaseURL,
      handlerOptions.build.rscOutputPath
    );
  }

  try {
    const metrics = createRenderMetrics(handlerOptions.route);

    if (handlerOptions.verbose) {
      handlerOptions.logger.info(
        `[renderPageClient] Client-side rendering for route: ${handlerOptions.route}`
      );
    }

    // Generate unique IDs to avoid worker conflicts while keeping the original route
    const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    
    // Step 1: Create headless handler for RSC content (no HTML structure)
    const rscHeadless = createHandler({
      ...handlerOptions,
      htmlPath: '', // Empty string triggers headless mode in resolveComponents
      id: `${handlerOptions.route}-headless-${uniqueId}`,
      rscTimeout: 30000 // 30 seconds for static generation
    });

    if (!rscHeadless.stream) {
      throw new Error("RSC stream is required for rendering");
    }

    // Step 2: Collect RSC content from headless handler
    const rscResult = await collectRscContent(rscHeadless, handlerOptions);
    const rscMetrics = rscResult.metrics;
    
    // Set up event listener for file.write.done to update metrics
    const originalOnEvent = handlerOptions.onEvent;
    handlerOptions.onEvent = (event) => {
      if (event.type === "file.write.done" && event.data.fileType === "html" && event.data.route === handlerOptions.route) {
        // Update metrics to reflect actual file content size (trimmed)
        metrics.htmlSize = event.data.content.length;
        metrics.htmlSizes.set(handlerOptions.route, event.data.content.length);
        if (handlerOptions.verbose) {
          handlerOptions.logger.info(
            `[renderPage.client] Updated HTML metrics to file size: ${event.data.content.length} bytes`
          );
        }
      }
      if (originalOnEvent) {
        originalOnEvent(event);
      }
    };
    
    // Step 3: Create full HTML handler (with default HTML component)
    const rscFull = createHandler({
      ...handlerOptions,
      // Don't set htmlPath - let it use default HTML component
      id: `${handlerOptions.route}-full-${uniqueId}`,
      rscTimeout: 30000 // 30 seconds for static generation
    });

    if (!rscFull.stream) {
      throw new Error("RSC stream is required for rendering");
    }

    // Step 4: Collect HTML content from full handler
    const htmlResult = await collectHtmlContent(rscFull, handlerOptions);
    
    // Create a PassThrough stream to copy the HTML content for both metrics and file writing
    const { PassThrough } = await import("node:stream");
    const htmlCopyStream = new PassThrough();
    
    // Pipe the HTML result to our copy stream
    htmlResult.pipe(htmlCopyStream);
    
    // Create a readable stream for the file writer
    const htmlReadableStream = new PassThrough();
    htmlCopyStream.pipe(htmlReadableStream);
    
    // Create an object that matches the expected interface with abort method
    const htmlStreamWrapper = {
      pipe: htmlReadableStream.pipe.bind(htmlReadableStream),
      abort: () => {
        htmlResult.abort();
        htmlCopyStream.destroy();
        htmlReadableStream.destroy();
      }
    };
    
    // Wait for the stream to complete to get accurate metrics
    await new Promise<void>((resolve, reject) => {
      htmlCopyStream.on('end', () => {
        resolve();
      });
      htmlCopyStream.on('error', reject);
    });
    
    // Get the initial metrics from the stream
    const htmlMetrics = htmlResult.metrics;
    


    // Update metrics (will be updated after file write to reflect actual file content size)
    metrics.htmlSize = htmlMetrics.bytes;
    metrics.rscSize = rscMetrics.bytes;
    metrics.processingTime = Date.now() - metrics.streamMetrics.startTime;
    metrics.chunks = htmlMetrics.chunks + rscMetrics.chunks;
    metrics.chunkRate = metrics.chunks / (metrics.processingTime / 1000);
    metrics.htmlSizes.set(handlerOptions.route, htmlMetrics.bytes);
    metrics.rscSizes.set(handlerOptions.route, rscMetrics.bytes);

    // Emit metrics via callback (like server version)
    if (handlerOptions.onMetrics) {
      handlerOptions.onMetrics(metrics);
    }

    yield {
      type: "success",
      html: htmlStreamWrapper,
      rsc: rscResult,
      metrics: {
        rscFull: htmlMetrics,
        rscHeadless: rscMetrics,
      },
    };
  } catch (error) {
    const panicError = handleError({
      error,
      logger: handlerOptions.logger,
      context: "renderPageClient",
      panicThreshold: handlerOptions.panicThreshold,
    });

    if (panicError != null) {
      yield {
        type: "error",
        error: panicError,
      };
    }
  }
}; 