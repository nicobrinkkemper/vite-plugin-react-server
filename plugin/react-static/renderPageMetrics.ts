import { join } from "node:path";
import { createRenderMetrics } from "../metrics/createRenderMetrics.js";

/**
 * Where each of the three render streams runs. This is the ONLY thing that
 * differs between renderPage.server and renderPage.client's metrics: the server
 * renders RSC on the main thread and HTML in a worker; the client renders RSC in
 * a worker and HTML on the main thread. Everything else (route, output paths) is
 * identical, so the two files pass an inverted topology to the same builder.
 */
export interface RenderStreamLocation {
  fromMainThread: boolean;
  fromRscWorker: boolean;
  fromHtmlWorker: boolean;
}

export interface RenderMetricsTopology {
  html: RenderStreamLocation;
  rscFull: RenderStreamLocation;
  rscHeadless: RenderStreamLocation;
}

/**
 * Build the html / rsc-full / rsc-headless render metrics for a route. The
 * html and rsc-headless metrics carry the on-disk output path (they are written
 * to files); rsc-full is in-memory only. The return type is left to inference so
 * each metric keeps the precise (per-`type`) shape createRenderMetrics produces —
 * RenderPageFn's yields depend on those narrowed types.
 */
export function createPageRenderMetrics(
  handlerOptions: any,
  topology: RenderMetricsTopology
) {
  const baseDir = join(handlerOptions.build.outDir, handlerOptions.build.static);
  const routePath = handlerOptions.route.replace(/^\//, "");

  const htmlMetrics = createRenderMetrics({
    route: handlerOptions.route,
    type: "html",
    ...topology.html,
    baseDir,
    routePath,
    fileName: handlerOptions.build.htmlOutputPath,
    outputPath: join(baseDir, routePath, handlerOptions.build.htmlOutputPath),
  });

  const rscFullMetrics = createRenderMetrics({
    route: handlerOptions.route,
    type: "rsc-full",
    ...topology.rscFull,
  });

  const rscHeadlessMetrics = createRenderMetrics({
    route: handlerOptions.route,
    type: "rsc-headless",
    ...topology.rscHeadless,
    baseDir,
    routePath,
    fileName: handlerOptions.build.rscOutputPath,
    outputPath: join(baseDir, routePath, handlerOptions.build.rscOutputPath),
  });

  return { htmlMetrics, rscFullMetrics, rscHeadlessMetrics };
}
