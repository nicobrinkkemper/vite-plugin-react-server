import { collectBundleManifestCss } from "../helpers/collectBundleManifestCss.js";
import { createRenderMetrics } from "../helpers/metrics.js";
import { resolvePageAndProps } from "../helpers/resolvePageAndProps.js";
import type { CreateHandlerOptions, RenderPageResult } from "../types.js";
import { join } from "node:path";
import { renderStreams } from "./renderStreams.js";
import { collectHtmlContent } from "./collectHtmlContent.js";
import { collectRscContent } from "./collectRscContent.js";

export async function *renderPage(
    handlerOptions: Omit<CreateHandlerOptions<unknown, React.ComponentType<unknown>>, "cssFiles">
  ): AsyncGenerator<RenderPageResult, void, unknown> {
    if (!handlerOptions.pagePath) {
      yield {
        type: "skip",
      };
      return;
    }
  
    try {
      const metrics = createRenderMetrics(handlerOptions.route);
      
      // Collect CSS files using bundle manifest
      const cssFiles = await collectBundleManifestCss({
        bundleManifest: handlerOptions.manifest,
        pagePath: handlerOptions.pagePath,
        css: handlerOptions.css,
        autoDiscover: handlerOptions.autoDiscover,
        moduleBaseURL: handlerOptions.moduleBaseURL,
        moduleBasePath: handlerOptions.moduleBasePath,
        moduleRootPath: handlerOptions.moduleRootPath,
        build: handlerOptions.build,
        projectRoot: handlerOptions.projectRoot,
      });
  
      const pageAndPropsResult = await resolvePageAndProps({
        pagePath: handlerOptions.pagePath,
        propsPath: handlerOptions.propsPath,
        pageExportName: handlerOptions.pageExportName,
        propsExportName: handlerOptions.propsExportName,
        route: handlerOptions.route,
        loader: handlerOptions.loader,
      });
  
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
      // Set up file paths
      const routeHtmlPath = handlerOptions.htmlOutputPath
        ? handlerOptions.htmlOutputPath
        : join(
            handlerOptions.build.outDir,
            handlerOptions.build.server,
            handlerOptions.build.static,
            handlerOptions.route === "/"
              ? handlerOptions.htmlOutputPath || "index.html"
              : join(
                  handlerOptions.route,
                  handlerOptions.htmlOutputPath || "index.html"
                )
          ).replace(/^\//, "");
  
      const routeRscPath = handlerOptions.rscOutputPath
        ? handlerOptions.rscOutputPath
        : join(
            handlerOptions.build.outDir,
            handlerOptions.build.server,
            handlerOptions.build.static,
            handlerOptions.route === "/"
              ? handlerOptions.rscOutputPath || "index.rsc"
              : join(
                  handlerOptions.route,
                  handlerOptions.rscOutputPath || "index.rsc"
                )
          ).replace(/^\//, "");
  
      const newHandlerOptions = {
        ...handlerOptions,
        rscOutputPath: routeRscPath,
        htmlOutputPath: routeHtmlPath,
        PageComponent: PageComponent,
        pageProps: pageProps,
        cssFiles: cssFiles,
        pipeableStreamOptions: {
          ...handlerOptions.pipeableStreamOptions,
          identifierPrefix: '/../client/',
        },
      } satisfies CreateHandlerOptions;
      // Create streams with CSS files
      const [rscFull, rscHeadless] = await renderStreams(newHandlerOptions);
      
      // Handle stream creation errors
      if (rscFull.type !== "success") {
        yield {
          type: "error",
          error: new Error(
            rscFull.type === "error"
              ? `Failed to create RSC full stream: ${rscFull.error instanceof Error ? rscFull.error.message : String(rscFull.error)}`
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
              ? `Failed to create RSC headless stream: ${rscHeadless.error instanceof Error ? rscHeadless.error.message : String(rscHeadless.error)}`
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
      const [htmlContent, rscContent] = await Promise.all([
        collectHtmlContent(
          rscFull.stream,
          newHandlerOptions,
          2000
        ),
        collectRscContent(rscHeadless.stream, handlerOptions.route, 2000),
      ]);
      
      // Update metrics
      metrics.htmlSizes.set(handlerOptions.route, htmlContent.content.length);
      metrics.rscSizes.set(handlerOptions.route, rscContent.content.length);
      metrics.htmlSize = htmlContent.content.length;
      metrics.rscSize = rscContent.content.length;
      
      // Combine metrics from both streams
      metrics.streamMetrics = {
        ...htmlContent.metrics,
        chunks: Math.max(htmlContent.metrics.chunks, rscContent.metrics.chunks),
        bytes: Math.max(htmlContent.metrics.bytes, rscContent.metrics.bytes),
        duration: Math.max(htmlContent.metrics.duration, rscContent.metrics.duration),
        startTime: Math.min(htmlContent.metrics.startTime, rscContent.metrics.startTime)
      };
      
      metrics.totalChunks = metrics.streamMetrics.chunks;
      metrics.processingTime = metrics.streamMetrics.duration;
      metrics.chunks = metrics.streamMetrics.chunks;
      metrics.chunkRate = metrics.streamMetrics.chunks / (metrics.processingTime / 1000);
      
      // Emit metrics via callback
      if (handlerOptions.onMetrics) {
        handlerOptions.onMetrics(metrics);
      }
      // Emit file write events if handler exists
      if (handlerOptions.onEvent) {
        handlerOptions.onEvent({
          type: "file.write",
          data: {
            route: handlerOptions.route,
            fileType: "html",
            content: htmlContent.content,
            onComplete: async () => {},
          },
        });
  
        handlerOptions.onEvent({
          type: "file.write",
          data: {
            route: handlerOptions.route,
            fileType: "rsc",
            content: rscContent.content,
            onComplete: async () => {},
          },
        });
      }
  
      yield {
        type: "success",
        html: htmlContent.content,
        rsc: rscContent.content,
        metrics: {
          rscFull: htmlContent.metrics,
          rscHeadless: rscContent.metrics,
        },
      };
    } catch (err) {
      yield {
        type: "error",
        error: err instanceof Error ? err : new Error(String(err)),
      };
    }
  }