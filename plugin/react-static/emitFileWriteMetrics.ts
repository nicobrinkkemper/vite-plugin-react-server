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
  options: { onMetrics?: (metrics: any) => void }
): void {
  if (event.type !== "file.write.done" || event.data.route !== route) {
    return;
  }

  const routeResult = routeResults.get(route);
  if (!routeResult || routeResult.type !== "success") {
    return;
  }

  if (event.data.fileType === "html") {
    const endTime = performance.now();
    const htmlMetrics = createRenderMetrics({
      route: route,
      type: routeResult.metrics.html.type,
      fromMainThread: routeResult.metrics.html.fromMainThread,
      fromRscWorker: routeResult.metrics.html.fromRscWorker,
      fromHtmlWorker: routeResult.metrics.html.fromHtmlWorker,
      fileSize: event.data.content.length,
      chunks: event.data.chunks || 0,
      processingTime: endTime - routeResult.metrics.html.streamMetrics.startTime,
      chunkRate:
        (event.data.chunks || 0) /
        ((endTime - routeResult.metrics.html.streamMetrics.startTime) / 1000),
      fileName: event.data.fileName,
      outputPath: event.data.path,
      baseDir: event.data.baseDir,
      routePath: event.data.routePath,
      streamMetrics: createStreamMetrics({
        ...routeResult.metrics.html.streamMetrics,
        chunks: event.data.chunks || 0,
        bytes: event.data.content.length,
        duration: endTime - routeResult.metrics.html.streamMetrics.startTime,
        endTime: endTime,
      }),
    });

    if (options.onMetrics) {
      options.onMetrics(htmlMetrics);
    }

    // Also emit RSC Full metrics if available (may be missing on errors)
    if (routeResult.metrics?.rscFull) {
      const rscFullEndTime = performance.now();
      const rscFullMetrics = createRenderMetrics({
        route: route,
        type: routeResult.metrics.rscFull.type,
        fromMainThread: routeResult.metrics.rscFull.fromMainThread,
        fromRscWorker: routeResult.metrics.rscFull.fromRscWorker,
        fromHtmlWorker: routeResult.metrics.rscFull.fromHtmlWorker,
        processingTime:
          rscFullEndTime - routeResult.metrics.rscFull.streamMetrics.startTime,
        chunks: routeResult.metrics.rscFull.streamMetrics.chunks,
        chunkRate:
          routeResult.metrics.rscFull.streamMetrics.chunks /
          ((rscFullEndTime -
            routeResult.metrics.rscFull.streamMetrics.startTime) /
            1000),
        fileName: event.data.fileName,
        outputPath: event.data.path,
        baseDir: event.data.baseDir,
        routePath: event.data.routePath,
        streamMetrics: createStreamMetrics({
          ...routeResult.metrics.rscFull.streamMetrics,
          duration:
            rscFullEndTime - routeResult.metrics.rscFull.streamMetrics.startTime,
          endTime: rscFullEndTime,
        }),
      });

      if (options.onMetrics) {
        options.onMetrics(rscFullMetrics);
      }
    }
  } else if (event.data.fileType === "rsc") {
    const rscEndTime = performance.now();
    const rscMetrics = createRenderMetrics({
      route: route,
      type: routeResult.metrics.rscHeadless.type,
      fromMainThread: routeResult.metrics.rscHeadless.fromMainThread,
      fromRscWorker: routeResult.metrics.rscHeadless.fromRscWorker,
      fromHtmlWorker: routeResult.metrics.rscHeadless.fromHtmlWorker,
      fileSize: event.data.content.length,
      chunks: event.data.chunks || 0,
      processingTime:
        rscEndTime - routeResult.metrics.rscHeadless.streamMetrics.startTime,
      chunkRate:
        (event.data.chunks || 0) /
        ((rscEndTime - routeResult.metrics.rscHeadless.streamMetrics.startTime) /
          1000),
      fileName: event.data.fileName,
      outputPath: event.data.path,
      baseDir: event.data.baseDir,
      routePath: event.data.routePath,
      streamMetrics: createStreamMetrics({
        ...routeResult.metrics.rscHeadless.streamMetrics,
        chunks: event.data.chunks || 0,
        bytes: event.data.content.length,
        duration:
          rscEndTime - routeResult.metrics.rscHeadless.streamMetrics.startTime,
        endTime: rscEndTime,
      }),
    });

    if (options.onMetrics) {
      options.onMetrics(rscMetrics);
    }
  }
}
