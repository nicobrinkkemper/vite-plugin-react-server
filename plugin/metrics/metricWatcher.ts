import type {
  RenderMetrics,
  WorkerStartupMetrics,
  ModuleResolutionMetrics,
  EdgeBakeMetrics,
  InlineFlightMetrics,
  SsgRenderMetrics,
} from "./types.js";
import { isMainThread } from "node:worker_threads";

interface PageMetrics {
  route: string; // route as defined in build.pages
  metrics: {
    rscFull?: RenderMetrics; // the server-side renderToPipeableStream metrics, for html+root+page
    rscHeadless?: RenderMetrics; // the server-side renderToPipeableStream metrics, only the root+page
    html?: RenderMetrics; // the client-side renderToPipeableStream metrics, for rscFull -> html
  };
  workerStartupMetrics: WorkerStartupMetrics[]; // Track worker startup times for this page
  moduleResolutionMetrics: ModuleResolutionMetrics[]; // Track module resolution times for this page
  startTime: number;
}

const pageMetricsMap = new Map<string, PageMetrics>();

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} kB`;
  } else {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
}

function formatTime(ms: number): string {
  if (ms < 1) {
    return `${Math.round(ms * 1000)}μs`;
  } else if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  } else {
    return `${(ms / 1000).toFixed(2)}s`;
  }
}

let startedLogging = false;
// Track logged worker startups to prevent duplicates
const loggedWorkerStartups = new Set<string>();

// Per-batch accumulation (parallel static generation): routes that rendered
// concurrently, their union wall window and summed spans. Flushed as one
// overview line when every route of the batch has reported its html metric,
// so the stream shows what actually ran in parallel and what it bought.
type BatchWindow = {
  size: number;
  routes: Set<string>;
  minStartAt: number;
  maxEndAt: number;
  sumSpans: number;
};
const batchWindows = new Map<number, BatchWindow>();

export function metricWatcher({
  maxTime = 200,
  maxBackpressure = 1,
  warnOnly = false,
  warn = console.warn,
  info = console.info,
}: {
  maxTime?: number;
  maxBackpressure?: number;
  warnOnly?: boolean;
  warn?: (...args: unknown[]) => void;
  info?: (...args: unknown[]) => void;
} = {}) {
  if (!isMainThread) {
    return () => {};
  }
  return (
    metrics:
      | RenderMetrics
      | WorkerStartupMetrics
      | ModuleResolutionMetrics
      | EdgeBakeMetrics
      | InlineFlightMetrics
      | SsgRenderMetrics
  ) => {
    if (metrics.type === "ssg-render") {
      if (!warnOnly) {
        const m = metrics as SsgRenderMetrics;
        const rate =
          m.renderTime > 0 ? (m.pages / (m.renderTime / 1000)).toFixed(1) : "?";
        const failedMsg = m.failed > 0 ? ` \x1b[31m(${m.failed} failed)\x1b[0m` : "";
        info(
          `\x1b[35mrendered\x1b[0m ${m.pages} pages in ${formatTime(m.renderTime)} ` +
            `\x1b[2m(${rate} pages/s)\x1b[0m${failedMsg}`
        );
      }
      return;
    }
    if (metrics.type === "inline-flight") {
      if (!warnOnly) {
        const m = metrics as InlineFlightMetrics;
        info(
          `\x1b[35minlined flight into\x1b[0m ${m.pages} page(s) in ${formatTime(m.inlineTime)}`
        );
      }
      return;
    }
    // Standalone summary, not tied to a route's render pipeline.
    if (metrics.type === "edge-bake") {
      if (!warnOnly) {
        const bake = metrics as EdgeBakeMetrics;
        const what =
          bake.kind === "producer"
            ? "edge producer"
            : `edge consumer (${bake.moduleCount ?? "?"} client module(s))`;
        info(
          `\x1b[35mbaked ${what} in\x1b[0m ${formatTime(bake.bakeTime)} → ${bake.outputPath}`
        );
      }
      return;
    }
    if (!startedLogging) {
      startedLogging = true;
      info("_______ vite-plugin-react-server ______");
    }
    const route = metrics.route;

    // Get or create page metrics
    let pageMetrics = pageMetricsMap.get(route);
    if (!pageMetrics) {
      pageMetrics = {
        route,
        metrics: {},
        workerStartupMetrics: [],
        moduleResolutionMetrics: [],
        startTime: performance.now(),
      };
      pageMetricsMap.set(route, pageMetrics);
    }

    // Store the metric by type
    if (metrics.type === "rsc-full") {
      pageMetrics.metrics.rscFull = metrics as RenderMetrics;
    } else if (metrics.type === "rsc-headless") {
      pageMetrics.metrics.rscHeadless = metrics as RenderMetrics;
    } else if (metrics.type === "html") {
      pageMetrics.metrics.html = metrics as RenderMetrics;
      const html = metrics as RenderMetrics;
      const batch = html.batch;
      const startAt = html.streamMetrics.startAt;
      if (batch && startAt != null && !warnOnly) {
        let win = batchWindows.get(batch.index);
        if (!win) {
          win = {
            size: batch.size,
            routes: new Set(),
            minStartAt: Infinity,
            maxEndAt: -Infinity,
            sumSpans: 0,
          };
          batchWindows.set(batch.index, win);
        }
        if (!win.routes.has(route)) {
          win.routes.add(route);
          win.minStartAt = Math.min(win.minStartAt, startAt);
          win.maxEndAt = Math.max(win.maxEndAt, startAt + html.processingTime);
          win.sumSpans += html.processingTime;
        }
        if (win.routes.size >= win.size) {
          const wall = win.maxEndAt - win.minStartAt;
          const speedup = wall > 0 ? win.sumSpans / wall : 1;
          const label =
            batch.index === 0 && win.size === 1
              ? `warm-up: 1 route in ${formatTime(wall)} (cold module load paid here)`
              : `batch ${batch.index}: ${win.size} routes in ${formatTime(wall)} wall` +
                (win.size > 1
                  ? ` (sum ${formatTime(win.sumSpans)}, ${speedup.toFixed(1)}× parallel)`
                  : "");
          info(`[2m— ${label} —[0m`);
          batchWindows.delete(batch.index);
        }
      }
    } else if (metrics.type === "worker-startup") {
      // Store worker startup metrics separately
      pageMetrics.workerStartupMetrics.push(metrics as WorkerStartupMetrics);

      // Display worker startup metric as standalone entry (deduplicated)
      if (!warnOnly) {
        const workerStartupMetric = metrics as WorkerStartupMetrics;
        const workerKey = `${workerStartupMetric.workerType}-${workerStartupMetric.route}`;
        
        // Only log if we haven't seen this worker type for this route before
        if (!loggedWorkerStartups.has(workerKey)) {
          loggedWorkerStartups.add(workerKey);
          const startupTime = formatTime(workerStartupMetric.startupTime);
          const workerType = workerStartupMetric.workerType;
          info(
            `\x1b[35m${workerType.toUpperCase()}-worker started in \x1b[0m ${startupTime} (initial route: ${route})`
          );
        }
      }
      return; // Don't process worker startup metrics for rendering checks
    } else if (metrics.type === "module-resolution") {
      // Store module resolution metrics separately
      pageMetrics.moduleResolutionMetrics.push(
        metrics as ModuleResolutionMetrics
      );

      // Display module resolution metric as standalone entry. The
      // resolve-start/module-run split decides the LEVEL, not just the text:
      // a span where module code actually ran is the expected once-per-build
      // cold load (the warm-up route pays it) — informative, like the
      // worker-startup line, not a problem. warn() is reserved for the
      // anomalies: a slow span that was ALL cache-hit waiting (with the
      // warm-up in place that shouldn't happen), or a slow load the worker
      // couldn't attribute.
      if (metrics.type === "module-resolution" && "resolutionTime" in metrics && metrics.resolutionTime > maxTime) {
        const m = metrics as ModuleResolutionMetrics;
        const resolutionTime = formatTime(m.resolutionTime);
        if (m.moduleRunAt != null && m.resolveStartAt != null) {
          if (!warnOnly) {
            const resolvePart = m.moduleRunAt - m.resolveStartAt;
            const resolveMsg =
              resolvePart >= 1 ? `resolve ${formatTime(resolvePart)}, ` : "";
            info(
              `[35mcold module load[0m ${formatTime(m.moduleRunTime ?? 0)} ` +
                `(${resolveMsg}${m.workerType}, first route: ${route})`
            );
          }
        } else if (m.resolveStartAt != null) {
          warn(
            `${m.workerType} worker took ${resolutionTime} for route ${route} ` +
              `(all cache hits — time spent waiting, likely on another route's cold load)`
          );
        } else {
          warn(
            `${m.workerType} worker took ${resolutionTime} for route ${route}`
          );
        }
      }
      return; // Don't process module resolution metrics for rendering checks
    } else if (
      metrics.type !== "rsc-full" &&
      metrics.type !== "rsc-headless" &&
      metrics.type !== "html"
    ) {
      // A metric type this watcher predates: ignore it rather than casting it
      // to RenderMetrics and crashing on fields it doesn't have.
      return;
    }

    // Only process RenderMetrics from here on
    const renderMetrics = metrics as RenderMetrics;

    // Check for backpressure first (more critical)
    if (renderMetrics.streamMetrics.backpressureCount > maxBackpressure) {
      warn(
        `Backpressure detected on ${route} (${renderMetrics.type}): ${renderMetrics.streamMetrics.backpressureCount} occurrences`
      );
    }
    // Check for slow processing
    // Calculate total worker startup time for this route
    const totalWorkerStartupTime = pageMetrics.workerStartupMetrics.reduce(
      (total, startup) => total + startup.startupTime,
      0
    );

    // Calculate total module resolution time for this route
    const totalModuleResolutionTime =
      pageMetrics.moduleResolutionMetrics.reduce(
        (total, resolution) => total + resolution.resolutionTime,
        0
      );

    // Cold-start attribution for the first batch. processingTime spans the
    // whole request, which on a cold worker includes startup and module
    // loading; the old blind subtraction went NEGATIVE when those spans
    // overlapped each other (concurrent first-batch routes all report the
    // same waited-on cold load), so first-batch numbers were nonsense. Use
    // the module-run split where the worker reported it: only the actual
    // execution portion is subtracted per route, and never below zero.
    const totalModuleRunTime = pageMetrics.moduleResolutionMetrics.reduce(
      (total, resolution) => total + (resolution.moduleRunTime ?? resolution.resolutionTime),
      0
    );
    const actualProcessingTime = Math.max(
      0,
      renderMetrics.processingTime -
        totalWorkerStartupTime -
        totalModuleRunTime
    );

    if (actualProcessingTime > maxTime) {
      const startupTimeMsg =
        totalWorkerStartupTime > 0
          ? ` (worker startup: ${formatTime(totalWorkerStartupTime)})`
          : "";
      const resolutionTimeMsg =
        totalModuleResolutionTime > 0
          ? ` (module resolution: ${formatTime(totalModuleResolutionTime)}, of which execution ${formatTime(totalModuleRunTime)})`
          : "";

      warn(
        `It took ${formatTime(actualProcessingTime)} to render ${route} (${renderMetrics.type})${startupTimeMsg}${resolutionTimeMsg}`
      );
    }

    // Check if we have all metrics for this page
    const hasAllMetrics =
      pageMetrics.metrics.rscFull &&
      pageMetrics.metrics.rscHeadless &&
      pageMetrics.metrics.html;
    if (hasAllMetrics && !warnOnly) {
      // Get the actual file name and output path from the metrics
      const htmlMetrics = pageMetrics.metrics.html!;
      const rscMetrics = pageMetrics.metrics.rscHeadless!;

      // Helper function to format file output
      const formatFileOutput = (metrics: RenderMetrics) => {
        // Skip if file-related properties are not available
        if (!metrics.fileSize) {
          return null;
        }

        const fileSize = formatFileSize(metrics.fileSize);
        const processingTime = formatTime(metrics.processingTime);

        // Use structured data for coloring: baseDir (gray), routePath (yellow), filename (cyan)
        const isRootRoute = metrics.route === "/";
        const baseDirDisplay = `\x1b[2m${metrics.baseDir}\x1b[0m`;
        const routeDisplay = isRootRoute
          ? ""
          : `\x1b[33m/${metrics.routePath}\x1b[0m`;
        const coloredPath = `${baseDirDisplay}${routeDisplay}\x1b[36m/${metrics.fileName}\x1b[0m`;

        return `${coloredPath} \x1b[1m${fileSize}\x1b[0m \x1b[90m${processingTime}\x1b[0m`;
      };

      // One line per route: the flight (.rsc) feeds the html render — both
      // spans count from the same render start and are PIPELINED (the html
      // render consumes the flight as it streams), so the pair reads as one
      // event: total span + how far the html trailed the flight.
      //
      // The tail is computed from the two write-done stamps, which are BOTH
      // taken on the main thread with performance.now() — µs resolution, one
      // clock. The processingTime difference is Date.now()-based (cross-
      // thread anchoring) and quantizes to whole ms, which made every tail
      // read exactly 0 or 1ms.
      const stem = (name?: string) => name?.replace(/\.[^.]+$/, "");
      const canMerge =
        htmlMetrics.fileSize &&
        rscMetrics.fileSize &&
        stem(htmlMetrics.fileName) === stem(rscMetrics.fileName);
      const htmlEnd = htmlMetrics.streamMetrics.endTime;
      const rscEnd = rscMetrics.streamMetrics.endTime;
      const htmlTail =
        htmlEnd != null && rscEnd != null
          ? Math.max(0, htmlEnd - rscEnd)
          : Math.max(0, htmlMetrics.processingTime - rscMetrics.processingTime);
      // Below ~2ms the "tail" is write-scheduling noise (the two file writes
      // race in Promise.all and complete together) — showing 0μs/1ms suggests
      // precision that isn't there. No suffix = completed together; a suffix
      // means the html genuinely trailed the flight.
      const tailSuffix =
        htmlTail >= 2 ? ` [2m(+${formatTime(htmlTail)} html)[0m` : "";
      // A route's span contains its module-load time — the warm-up route pays
      // the shared graph (the big one), and every route pays its own
      // page/props modules on first use. Split it out so the render time is
      // comparable across lines (317ms total reads as modules 211ms + route
      // 106ms, not as a slow route).
      const modulesInSpan = pageMetrics.moduleResolutionMetrics.reduce(
        (total, m) => total + (m.moduleRunTime ?? 0),
        0
      );
      const spanSuffix =
        modulesInSpan >= 5
          ? ` [2m(modules ${formatTime(modulesInSpan)} + route ${formatTime(
              Math.max(0, htmlMetrics.processingTime - modulesInSpan)
            )})[0m`
          : "";
      if (canMerge) {
        const isRootRoute = htmlMetrics.route === "/";
        const baseDirDisplay = `[2m${htmlMetrics.baseDir}[0m`;
        const routeDisplay = isRootRoute
          ? ""
          : `[33m/${htmlMetrics.routePath}[0m`;
        const pairName = `${stem(htmlMetrics.fileName)}.{rsc,html}`;
        info(
          `${baseDirDisplay}${routeDisplay}[36m/${pairName}[0m ` +
            `[1m${formatFileSize(rscMetrics.fileSize!)}+${formatFileSize(htmlMetrics.fileSize!)}[0m ` +
            `[90m${formatTime(htmlMetrics.processingTime)}[0m` +
            spanSuffix +
            tailSuffix
        );
      } else {
        // Different stems (custom output names) — keep the two-line form.
        const rscOutput = formatFileOutput(rscMetrics);
        const htmlOutput = formatFileOutput(htmlMetrics);
        if (typeof rscOutput === "string") info(rscOutput);
        if (typeof htmlOutput === "string") info(htmlOutput + spanSuffix + tailSuffix);
      }

      // Clean up
      pageMetricsMap.delete(route);
    }
  };
}
