/**
 * emitFileWriteMetrics.ts
 *
 * Shared `file.write.done` metrics emission used by both renderPages.ts and
 * renderPagesBatched.ts. On a successful route's file-write completion it
 * rebuilds the html / rsc-full / rsc-headless render metrics with the real
 * on-disk file data and forwards them to options.onMetrics.
 *
 * The two renderers previously inlined this ~90-line block verbatim (they only
 * differed in the name of the results Map). This is the full path only; the
 * skip-branch in renderPages emits html-only metrics by design and is left as-is.
 */
import { createRenderMetrics } from "../metrics/createRenderMetrics.js";
import { createStreamMetrics } from "../metrics/createStreamMetrics.js";
import type { RenderPageResult } from "../types.js";

export function emitFileWriteMetrics(
  event: any,
  route: string,
  routeResults: Map<string, RenderPageResult>,
  options: { onMetrics?: (metrics: any) => void; batch?: { index: number; size: number } }
): void {
  if (event.type !== "file.write.done" || event.data.route !== route) {
    return;
  }

  const routeResult = routeResults.get(route);
  if (!routeResult || routeResult.type !== "success") {
    return;
  }

  // Cross-thread span: the stream's startTime is performance.now() in the
  // thread that STAMPED it (often a worker), while this function runs on the
  // main thread — different performance timeOrigins, so subtracting them
  // inflates every first-batch span by the worker's spawn offset. Prefer the
  // wall-clock startAt when the producer stamped one.
  const spanSince = (sm: { startTime: number; startAt?: number }): number =>
    sm.startAt != null ? Date.now() - sm.startAt : performance.now() - sm.startTime;

  if (event.data.fileType === "html") {
    const endTime = performance.now();
    const htmlSpan = spanSince(routeResult.metrics.html.streamMetrics);
    const htmlMetrics = createRenderMetrics({
      route: route,
      batch: options.batch,
      type: routeResult.metrics.html.type,
      fromMainThread: routeResult.metrics.html.fromMainThread,
      fromRscWorker: routeResult.metrics.html.fromRscWorker,
      fromHtmlWorker: routeResult.metrics.html.fromHtmlWorker,
      fileSize: event.data.content.length,
      chunks: event.data.chunks || 0,
      processingTime: htmlSpan,
      chunkRate: (event.data.chunks || 0) / (htmlSpan / 1000),
      fileName: event.data.fileName,
      outputPath: event.data.path,
      baseDir: event.data.baseDir,
      routePath: event.data.routePath,
      streamMetrics: createStreamMetrics({
        ...routeResult.metrics.html.streamMetrics,
        chunks: event.data.chunks || 0,
        bytes: event.data.content.length,
        duration: htmlSpan,
        endTime: endTime,
      }),
    });

    if (options.onMetrics) {
      options.onMetrics(htmlMetrics);
    }

    // Also emit RSC Full metrics if available (may be missing on errors)
    if (routeResult.metrics?.rscFull) {
      const rscFullEndTime = performance.now();
      const rscFullSpan = spanSince(routeResult.metrics.rscFull.streamMetrics);
      const rscFullMetrics = createRenderMetrics({
        route: route,
      batch: options.batch,
        type: routeResult.metrics.rscFull.type,
        fromMainThread: routeResult.metrics.rscFull.fromMainThread,
        fromRscWorker: routeResult.metrics.rscFull.fromRscWorker,
        fromHtmlWorker: routeResult.metrics.rscFull.fromHtmlWorker,
        processingTime: rscFullSpan,
        chunks: routeResult.metrics.rscFull.streamMetrics.chunks,
        chunkRate:
          routeResult.metrics.rscFull.streamMetrics.chunks / (rscFullSpan / 1000),
        fileName: event.data.fileName,
        outputPath: event.data.path,
        baseDir: event.data.baseDir,
        routePath: event.data.routePath,
        streamMetrics: createStreamMetrics({
          ...routeResult.metrics.rscFull.streamMetrics,
          duration: rscFullSpan,
          endTime: rscFullEndTime,
        }),
      });

      if (options.onMetrics) {
        options.onMetrics(rscFullMetrics);
      }
    }
  } else if (event.data.fileType === "rsc") {
    const rscEndTime = performance.now();
    const rscSpan = spanSince(routeResult.metrics.rscHeadless.streamMetrics);
    const rscMetrics = createRenderMetrics({
      route: route,
      batch: options.batch,
      type: routeResult.metrics.rscHeadless.type,
      fromMainThread: routeResult.metrics.rscHeadless.fromMainThread,
      fromRscWorker: routeResult.metrics.rscHeadless.fromRscWorker,
      fromHtmlWorker: routeResult.metrics.rscHeadless.fromHtmlWorker,
      fileSize: event.data.content.length,
      chunks: event.data.chunks || 0,
      processingTime: rscSpan,
      chunkRate: (event.data.chunks || 0) / (rscSpan / 1000),
      fileName: event.data.fileName,
      outputPath: event.data.path,
      baseDir: event.data.baseDir,
      routePath: event.data.routePath,
      streamMetrics: createStreamMetrics({
        ...routeResult.metrics.rscHeadless.streamMetrics,
        chunks: event.data.chunks || 0,
        bytes: event.data.content.length,
        duration: rscSpan,
        endTime: rscEndTime,
      }),
    });

    if (options.onMetrics) {
      options.onMetrics(rscMetrics);
    }
  }
}
