import { createRenderMetrics } from "../metrics/createRenderMetrics.js";
import { resolveComponents } from "../helpers/resolveComponents.js";
import type {
  RenderPageResult,
  ReactStreamHandlerFn,
} from "../types.js";
import { renderStreams } from "./renderStreams.js";
import { collectHtmlWorkerContent } from "./collectHtmlWorkerContent.js";
import { collectRscContent } from "./collectRscContent.js";


export type RenderPageReturn = AsyncGenerator<RenderPageResult, void, unknown>;

export type RenderPageFn = ReactStreamHandlerFn<RenderPageReturn>

export const renderPage: RenderPageFn = async function* _renderPage(
  handlerOptions
) {
  if (!handlerOptions.pagePath) {
    yield {
      type: "skip",
    };
    return;
  }

  try {
    const metrics = createRenderMetrics(handlerOptions.route);

    // Resolve all components together (alongside component resolution like other places)
    if (handlerOptions.verbose) {
      console.log(`[renderPage] renderPage - route: ${handlerOptions.route}, rootPath: ${handlerOptions.rootPath}, htmlPath: ${handlerOptions.htmlPath}`);
    }

    const componentsResult = await resolveComponents({
      pagePath: handlerOptions.pagePath,
      propsPath: handlerOptions.propsPath,
      rootPath: handlerOptions.rootPath,
      htmlPath: handlerOptions.htmlPath,
      pageExportName: handlerOptions.pageExportName,
      propsExportName: handlerOptions.propsExportName,
      rootExportName: handlerOptions.rootExportName,
      htmlExportName: handlerOptions.htmlExportName,
      route: handlerOptions.route,
      loader: handlerOptions.loader,
      verbose: handlerOptions.verbose,
      // Use direct component overrides if available (for static builds)
      RootComponent: handlerOptions.components?.Root || handlerOptions.RootComponent,
      HtmlComponent: handlerOptions.components?.Html || handlerOptions.HtmlComponent,
    });

    if (componentsResult.type === "error") {
      yield {
        type: "error",
        error: componentsResult.error,
      };
      return;
    }

    const { PageComponent, pageProps, RootComponent, HtmlComponent } = componentsResult;

    const newHandlerOptions = {
      ...handlerOptions,
      PageComponent: PageComponent,
      pageProps: pageProps as never,
      RootComponent: RootComponent,
      HtmlComponent: HtmlComponent,
    };
    // Create streams with CSS files
    const [rscFull, rscHeadless] = renderStreams(newHandlerOptions);
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
