import type { Worker } from "node:worker_threads";
import type { ResolveComponentsMessage, ComponentsResolvedMessage } from "../worker/rsc/types.js";
import { createModuleResolutionMetrics } from "../metrics/createModuleResolutionMetrics.js";
import { performance } from "node:perf_hooks";

export interface ResolveComponentsOptions {
  route: string;
  pagePath?: string;
  propsPath?: string;
  rootPath?: string;
  htmlPath?: string;
  pageExportName?: string;
  propsExportName?: string;
  rootExportName?: string;
  htmlExportName?: string;
  worker: Worker;
  onMetrics?: (metrics: any) => void;
  logger?: any;
  verbose?: boolean;
}

export interface ResolvedComponents {
  PageComponent?: any;
  pageProps?: any;
  RootComponent?: any;
  HtmlComponent?: any;
  resolutionTime: number;
}

/**
 * Resolves components using the RSC worker for client-side rendering
 * 
 * This function:
 * 1. Sends a RESOLVE_COMPONENTS message to the RSC worker
 * 2. RSC worker resolves components using built paths from manifest
 * 3. Returns resolved components with proper built paths
 * 4. Tracks resolution metrics
 * 
 * This separates component resolution from RSC generation, making the
 * subsequent RSC render completely synchronous.
 */
export async function resolveComponents(
  options: ResolveComponentsOptions
): Promise<ResolvedComponents> {
  const {
    route,
    pagePath,
    propsPath,
    rootPath,
    htmlPath,
    pageExportName,
    propsExportName,
    rootExportName,
    htmlExportName,
    worker,
    onMetrics,
    logger,
    verbose,
  } = options;

  const resolutionStartTime = performance.now();

  if (verbose) {
    logger?.info(`[resolveComponents.client] Resolving components for route: ${route}`);
    logger?.info(`[resolveComponents.client] pagePath: ${pagePath}`);
    logger?.info(`[resolveComponents.client] propsPath: ${propsPath}`);
    logger?.info(`[resolveComponents.client] rootPath: ${rootPath}`);
    logger?.info(`[resolveComponents.client] htmlPath: ${htmlPath}`);
  }

  // Send RESOLVE_COMPONENTS message to RSC worker
  const resolveMessage: ResolveComponentsMessage = {
    type: "RESOLVE_COMPONENTS",
    id: `${route}-resolve-${Date.now()}`,
    route,
    streamType: "rsc",
    rscVariant: "rsc-full", // We'll determine this based on htmlPath later
    pagePath,
    propsPath,
    rootPath,
    htmlPath,
    pageExportName,
    propsExportName,
    rootExportName,
    htmlExportName,
  };

  try {
    // Send message to worker and wait for response
    const response = await new Promise<ComponentsResolvedMessage>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Component resolution timeout for route: ${route}`));
      }, 3000); // 3 second timeout

      const messageHandler = (message: any) => {
        if (message.type === "COMPONENTS_RESOLVED" && message.route === route) {
          clearTimeout(timeout);
          worker.off("message", messageHandler);
          resolve(message);
        } else if (message.type === "ERROR" && message.id === resolveMessage.id) {
          clearTimeout(timeout);
          worker.off("message", messageHandler);
          reject(new Error(`Component resolution failed: ${message.error?.message || 'Unknown error'}`));
        }
      };

      worker.on("message", messageHandler);
      worker.postMessage(resolveMessage);
    });

    const resolutionTime = performance.now() - resolutionStartTime;

    if (verbose) {
      logger?.info(`[resolveComponents.client] Components resolved for route: ${route} in ${resolutionTime.toFixed(2)}ms`);
    }

    // Emit resolution metrics
    if (onMetrics) {
      const moduleResolutionMetric = createModuleResolutionMetrics({
        route,
        workerType: "rsc",
        resolutionTime,
        fromMainThread: false,
        fromRscWorker: true,
        fromHtmlWorker: false,
        description: `Component resolution for route ${route} on RSC worker`,
      });
      onMetrics(moduleResolutionMetric);
    }

    return {
      PageComponent: response.PageComponent,
      pageProps: response.pageProps,
      RootComponent: response.RootComponent,
      HtmlComponent: response.HtmlComponent,
      resolutionTime,
    };

  } catch (error) {
    const resolutionTime = performance.now() - resolutionStartTime;
    logger?.error(`[resolveComponents.client] Failed to resolve components for route ${route}: ${error}`);
    
    // Emit error metrics
    if (onMetrics) {
      const moduleResolutionMetric = createModuleResolutionMetrics({
        route,
        workerType: "rsc",
        resolutionTime,
        fromMainThread: false,
        fromRscWorker: true,
        fromHtmlWorker: false,
        description: `Component resolution failed for route ${route} on RSC worker`,
      });
      onMetrics(moduleResolutionMetric);
    }

    throw error;
  }
}
