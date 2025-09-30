import type {
  RenderMetrics,
  WorkerStartupMetrics,
  ModuleResolutionMetrics,
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
    metrics: RenderMetrics | WorkerStartupMetrics | ModuleResolutionMetrics
  ) => {
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

      // Display module resolution metric as standalone entry
      if (metrics.type === "module-resolution" && "resolutionTime" in metrics && metrics.resolutionTime > maxTime) {
        const moduleResolutionMetric = metrics as ModuleResolutionMetrics;
        const resolutionTime = formatTime(
          moduleResolutionMetric.resolutionTime
        );
        warn(
          `${moduleResolutionMetric.workerType} worker took ${resolutionTime} for route ${route}`
        );
      }
      return; // Don't process module resolution metrics for rendering checks
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

    // Subtract worker startup and module resolution time from processing time for the first page
    const actualProcessingTime =
      renderMetrics.processingTime -
      totalWorkerStartupTime -
      totalModuleResolutionTime;

    if (actualProcessingTime > maxTime) {
      const startupTimeMsg =
        totalWorkerStartupTime > 0
          ? ` (worker startup: ${formatTime(totalWorkerStartupTime)})`
          : "";
      const resolutionTimeMsg =
        totalModuleResolutionTime > 0
          ? ` (module resolution: ${formatTime(totalModuleResolutionTime)})`
          : "";

      warn(
        `It took ${actualProcessingTime}ms to render ${route} (${renderMetrics.type})${startupTimeMsg}${resolutionTimeMsg}`
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

      // Show HTML and RSC files
      const htmlOutput = formatFileOutput(htmlMetrics);
      const rscOutput = formatFileOutput(rscMetrics);

      if (typeof htmlOutput === "string") info(htmlOutput);
      if (typeof rscOutput === "string") info(rscOutput);

      // Clean up
      pageMetricsMap.delete(route);
    }
  };
}
