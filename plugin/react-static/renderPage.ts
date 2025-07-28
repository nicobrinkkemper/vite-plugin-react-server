import { createRenderMetrics } from "../metrics/createRenderMetrics.js";
import { resolveComponents } from "../helpers/resolveComponents.js";
import { renderStreams } from "./renderStreams.js";
import { collectHtmlWorkerContent } from "./collectHtmlWorkerContent.js";
import { collectRscContent } from "./collectRscContent.js";
import { routeToURL } from "../utils/routeToURL.js";
import type { RenderPageFn } from "./types.js";
import { handleError } from "../error/handleError.js";

export const renderPage: RenderPageFn = async function* _renderPage(
  handlerOptions
) {
  // Skip if no pagePath AND no PageComponent provided (fallback case)
  if (!handlerOptions.pagePath && !handlerOptions.PageComponent) {
    yield {
      type: "skip",
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

    // Resolve all components together (alongside component resolution like other places)
    if (handlerOptions.verbose) {
      handlerOptions.logger.info(
        `[renderPage] renderPage - route: ${handlerOptions.route}, rootPath: ${handlerOptions.rootPath}, htmlPath: ${handlerOptions.htmlPath}`
      );
    }

    let PageComponent, pageProps, RootComponent, HtmlComponent;

    // Determine which Page component to use based on precedence
    // 1. handlerOptions.PageComponent (highest priority - for fallback)
    // 2. handlerOptions.components.Page (medium priority - for static builds)
    // 3. Resolved from pagePath (lowest priority - normal resolution)
    const useProvidedPageComponent =
      handlerOptions.PageComponent || handlerOptions.components?.Page;

    if (useProvidedPageComponent) {
      if (handlerOptions.verbose) {
        const source = handlerOptions.PageComponent
          ? "PageComponent"
          : "components.Page";
        handlerOptions.logger.info(
          `[renderPage] Using provided Page component from ${source} for route: ${
            handlerOptions.route
          } (fallback mode: ${!handlerOptions.pagePath ? "yes" : "no"})`
        );
      }

      // Resolve components - use empty strings to skip page resolution when PageComponent is provided
      const componentsResult = await resolveComponents({
        ...handlerOptions,
        // Use empty strings to prevent page resolution when PageComponent is provided
        pagePath: "",
        propsPath: "",
        // Use direct component overrides if available (for static builds)
        RootComponent:
          handlerOptions.components?.Root || handlerOptions.RootComponent,
        HtmlComponent:
          handlerOptions.components?.Html || handlerOptions.HtmlComponent,
      });

      if (componentsResult.type === "error") {
        yield {
          type: "error",
          error: componentsResult.error,
        };
        return;
      }

      // Use the provided Page component (either PageComponent or components.Page)
      PageComponent = useProvidedPageComponent;
      // Use resolved props if available, otherwise use provided props or empty object
      pageProps = componentsResult.pageProps || handlerOptions.pageProps || {};
      RootComponent = componentsResult.RootComponent;
      HtmlComponent = componentsResult.HtmlComponent;

      // Ensure we have the required components for fallback render
      if (!RootComponent || !HtmlComponent) {
        yield {
          type: "error",
          error: new Error(
            `Fallback render failed: missing required components (Root: ${!!RootComponent}, Html: ${!!HtmlComponent})`
          ),
        };
        return;
      }
    } else {
      // Normal resolution including Page component
      const componentsResult = await resolveComponents({
        ...handlerOptions,
        // Use direct component overrides if available (for static builds)
        RootComponent:
          handlerOptions.components?.Root || handlerOptions.RootComponent,
        HtmlComponent:
          handlerOptions.components?.Html || handlerOptions.HtmlComponent,
      });

      if (componentsResult.type === "error") {
        yield {
          type: "error",
          error: componentsResult.error,
        };
        return;
      }

      ({ PageComponent, pageProps, RootComponent, HtmlComponent } =
        componentsResult);

      // Ensure we have all required components
      if (!PageComponent || !RootComponent || !HtmlComponent) {
        yield {
          type: "error",
          error: new Error(
            `Component resolution failed: missing required components (Page: ${!!PageComponent}, Root: ${!!RootComponent}, Html: ${!!HtmlComponent})`
          ),
        };
        return;
      }
    }

    const newHandlerOptions = {
      ...handlerOptions,
      url: `${handlerOptions.url}`,
      route: `${handlerOptions.route}`,
      PageComponent: PageComponent,
      pageProps: pageProps,
      RootComponent: RootComponent,
      HtmlComponent: HtmlComponent,
    };
    // Create streams with CSS files
    const [rscFull, rscHeadless] = renderStreams(newHandlerOptions);
    //

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
    const  { stream: rscStream, metrics: rscMetrics }= await collectRscContent(rscHeadless, newHandlerOptions)
    
    // Handle HTML collection as async generator - properly consume the generator
    const htmlGenerator = collectHtmlWorkerContent(rscFull, newHandlerOptions);
    let htmlResult;
    try {
      htmlResult = await htmlGenerator.next();
    } finally {
      // Ensure the generator is properly closed
      try {
        await htmlGenerator.return?.({ type: "error", error: null });
      } catch {
        // Ignore errors during cleanup
      }
    }
    if (htmlResult.done && htmlResult.value) {
      if (htmlResult.value.type === "success") {
        const htmlStream = htmlResult.value.stream;
        const htmlMetrics = htmlResult.value.metrics;
        
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
      } else {
        yield {
          type: "error",
          error: htmlResult.value.error || new Error("HTML collection failed"),
        };
        return;
      }
    } else {
      yield {
        type: "error",
        error: new Error("HTML collection did not complete successfully"),
      };
      return;
    }
  } catch (err) {
    if (handlerOptions.verbose) {
      handlerOptions.logger.error(`[renderPage] Error: ${JSON.stringify(err)}`);
    }
    const panicError = handleError({
      error: err,
      critical: false,
      logger: handlerOptions.logger,
      panicThreshold: handlerOptions.panicThreshold,
      context: `RenderPage Error (${handlerOptions.route})`,
    });
    if (panicError != null) {
      yield {
        type: "error",
        error: panicError,
      };
    }
    yield {
      type: "skip",
    };
  }
};
