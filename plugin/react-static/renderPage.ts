import { createRenderMetrics } from "../helpers/metrics.js";
import { resolvePageAndProps } from "../helpers/resolvePageAndProps.js";
import type { CreateHandlerOptions, RenderPageResult } from "../types.js";
import { renderStreams } from "./renderStreams.js";
import { collectHtmlWorkerContent } from "./collectHtmlWorkerContent.js";
import { collectRscContent } from "./collectRscContent.js";

export async function* renderPage<T = unknown, InlineCSS extends boolean | undefined = undefined>(
  handlerOptions: CreateHandlerOptions<T, React.ComponentType<T>, InlineCSS>
): AsyncGenerator<RenderPageResult, void, unknown> {
  if (!handlerOptions.pagePath) {
    yield {
      type: "skip",
    };
    return;
  }

  try {
    const metrics = createRenderMetrics(handlerOptions.route);

    const pageAndPropsResult = await resolvePageAndProps(handlerOptions);

    if (pageAndPropsResult.type === "error") {
      yield {
        type: "error",
        error: pageAndPropsResult.error,
      };
      return;
    }

    if (pageAndPropsResult.type === "skip") {
      yield {
        type: "skip",
      };
      return;
    }

    const { PageComponent, pageProps } = pageAndPropsResult;

    const newHandlerOptions = {
      ...handlerOptions,
      PageComponent,
      pageProps,
    } as CreateHandlerOptions<T, React.ComponentType<T>, InlineCSS>;
    // Create streams with CSS files
    const [rscFull, rscHeadless] = await renderStreams(newHandlerOptions);
    // Handle stream creation errors
    if (rscFull.type !== "success") {
      yield {
        type: "error",
        error: new Error(
          rscFull.type === "error"
            ? `Failed to create RSC full stream: ${
                rscFull.error instanceof Error
                  ? rscFull.error.message
                  : String(rscFull.error)
              }`
            : "RSC full stream creation was skipped"
        ),
      };
      return;
    }

    if (!rscFull.stream) {
      yield {
        type: "error",
        error: new Error("RSC full stream is undefined"),
      };
      return;
    }

    if (rscHeadless.type !== "success") {
      yield {
        type: "error",
        error: new Error(
          rscHeadless.type === "error"
            ? `Failed to create RSC headless stream: ${
                rscHeadless.error instanceof Error
                  ? rscHeadless.error.message
                  : String(rscHeadless.error)
              }`
            : "RSC headless stream creation was skipped"
        ),
      };
      return;
    }

    if (!rscHeadless.stream) {
      yield {
        type: "error",
        error: new Error("RSC headless stream is undefined"),
      };
      return;
    }

    // Collect HTML and RSC content
    const [
      { stream: rscStream, metrics: rscMetrics },
      { stream: htmlStream, metrics: htmlMetrics },
    ] = await Promise.all([
      collectRscContent(rscHeadless.stream, handlerOptions),
      collectHtmlWorkerContent(rscFull.stream, handlerOptions),
    ]);

    // Update metrics
    metrics.htmlSizes.set(handlerOptions.route, htmlMetrics.bytes);
    metrics.rscSizes.set(handlerOptions.route, rscMetrics.bytes);
    metrics.htmlSize = htmlMetrics.bytes;
    metrics.rscSize = rscMetrics.bytes;

    // Combine metrics from both streams
    metrics.streamMetrics = {
      ...htmlMetrics,
      chunks: Math.max(htmlMetrics.chunks, rscMetrics.chunks),
      bytes: Math.max(htmlMetrics.bytes, rscMetrics.bytes),
      duration: Math.max(htmlMetrics.duration, rscMetrics.duration),
      startTime: Math.min(htmlMetrics.startTime, rscMetrics.startTime),
    };

    metrics.processingTime = metrics.streamMetrics.duration;
    metrics.chunks = metrics.streamMetrics.chunks;
    metrics.chunkRate =
      metrics.streamMetrics.chunks / (metrics.processingTime / 1000);

    // Emit metrics via callback
    if (handlerOptions.onMetrics) {
      handlerOptions.onMetrics(metrics);
    }

    yield {
      type: "success",
      html: htmlStream,
      rsc: rscStream,
      metrics: {
        rscFull: htmlMetrics,
        rscHeadless: rscMetrics,
      },
    } as const;
  } catch (err) {
    yield {
      type: "error",
      error:
        err instanceof Error
          ? err
          : typeof err === "string"
          ? new Error(err)
          : (err as Error),
    };
  }
}
