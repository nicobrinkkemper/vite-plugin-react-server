/**
 * createHandlerOptions.shared.ts
 *
 * Logic shared verbatim by createHandlerOptions.server.ts and .client.ts.
 *
 * Scope note: this intentionally covers only the parts that are byte-identical
 * across the two variants AND guarded by test/unit/createHandlerOptions.test.ts
 * — the default options, the auto-discovery resolution, and the assembly of the
 * fields that are the same in both. The worker-creation blocks and the
 * variant-specific tail (components vs placeholders, clientPipeableStreamOptions
 * coercion, worker selection, children) deliberately stay in each variant; the
 * characterization test runs with workers disabled, so unifying the worker
 * blocks needs its own coverage first.
 */
import type { Logger, ConfigEnv, ResolvedConfig } from "vite";
import type { AutoDiscoveredFiles, ResolvedUserOptions } from "../types.js";
import { resolveAutoDiscover } from "./autoDiscover/resolveAutoDiscover.js";
import { DEFAULT_CONFIG } from "./defaults.js";
import { createWorker } from "../worker/createWorker.js";
import type {
  CreateHandlerOptionsParams,
  ResolvedDefaults,
} from "./createHandlerOptions.types.js";

export function createDefaultOptions(): ResolvedDefaults {
  return {
    pageExportName: DEFAULT_CONFIG.PAGE_EXPORT_NAME,
    propsExportName: DEFAULT_CONFIG.PROPS_EXPORT_NAME,
    rootExportName: DEFAULT_CONFIG.ROOT_EXPORT_NAME,
    htmlExportName: DEFAULT_CONFIG.HTML_EXPORT_NAME,
    cssFiles: new Map(),
    globalCss: new Map(),
    manifest: {},
    css: DEFAULT_CONFIG.CSS,
  };
}

export async function resolveAutoDiscoveredFiles(
  options: CreateHandlerOptionsParams,
  stashedOptions: any,
  logger: Logger
): Promise<AutoDiscoveredFiles> {
  if (options.autoDiscoveredFiles) {
    return options.autoDiscoveredFiles;
  }

  const result = await resolveAutoDiscover({
    config: (options.config as ResolvedConfig) || ({} as ResolvedConfig),
    configEnv:
      (options.configEnv as ConfigEnv) ||
      ({ mode: "production", command: "build" } as ConfigEnv),
    userOptions: stashedOptions,
    logger,
  });

  if (result.type === "error") {
    throw result.error || new Error("Failed to resolve autoDiscover");
  }

  return result.autoDiscoveredFiles;
}

export interface SharedHandlerOptionsInput {
  route: string;
  url: string;
  id: string;
  userOptions: ResolvedUserOptions;
  defaults: ResolvedDefaults;
  routeFiles: {
    page: string;
    props?: string | undefined;
    root?: string | undefined;
    html?: string | undefined;
  };
  logger: Logger;
  rscWorker: any;
  htmlWorker: any;
}

/**
 * The handler-options fields that are identical in both variants. Each variant
 * spreads `...userOptions`, then this, then its own divergent tail
 * (components/placeholders, clientPipeableStreamOptions, worker, children).
 */
export function buildSharedHandlerOptions(input: SharedHandlerOptionsInput) {
  const { route, url, id, userOptions, defaults, routeFiles, logger, rscWorker, htmlWorker } =
    input;

  return {
    // File paths
    pagePath: routeFiles.page,
    propsPath: routeFiles.props,
    rootPath: routeFiles.root,
    htmlPath: routeFiles.html,

    // Export names
    pageExportName: userOptions.pageExportName,
    propsExportName: userOptions.propsExportName,
    rootExportName: userOptions.rootExportName,
    htmlExportName: userOptions.htmlExportName,

    // Route and loader
    route,
    loader: defaults.loader || (() => Promise.resolve({})),

    // Configuration
    panicThreshold: userOptions.panicThreshold,
    verbose: userOptions.verbose,
    moduleBaseURL: userOptions.moduleBaseURL,
    build: userOptions.build,
    dev: {
      useHtmlWorker: userOptions.dev.useHtmlWorker,
      useRscWorker: userOptions.dev.useRscWorker,
    },
    logger,

    // Required properties
    normalizer: userOptions.normalizer,
    onEvent: userOptions.onEvent,
    onMetrics: userOptions.onMetrics,
    autoDiscover: userOptions.autoDiscover,
    css: userOptions.css,
    projectRoot: userOptions.projectRoot,
    moduleBase: userOptions.moduleBase,
    moduleBasePath: userOptions.moduleBasePath,
    moduleRootPath: userOptions.moduleRootPath,
    moduleID: userOptions.moduleID,
    url,
    manifest: defaults.manifest,
    cssFiles: defaults.cssFiles,
    globalCss: defaults.globalCss,

    // Timeouts and paths
    rscTimeout: userOptions.rscTimeout,
    htmlTimeout: userOptions.htmlTimeout,
    fileWriteTimeout: userOptions.fileWriteTimeout,
    workerShutdownTimeout: userOptions.workerShutdownTimeout,
    rscWorkerPath: userOptions.rscWorkerPath,
    htmlWorkerPath: userOptions.htmlWorkerPath,
    publicOrigin: userOptions.publicOrigin,

    // Stream options (server-side; clientPipeableStreamOptions is variant-specific)
    serverPipeableStreamOptions: userOptions.serverPipeableStreamOptions,

    // Identity + workers (the `worker` field selection is variant-specific)
    id,
    rscWorker,
    htmlWorker,
  };
}

/**
 * Run a createWorker() call and reduce its tagged result to a worker-or-undefined,
 * logging error/skip uniformly.
 *
 * Both variants create up to two workers (RSC + HTML), and each block wrapped the
 * createWorker() call in byte-identical try/catch + result-handling boilerplate —
 * only the createWorker ARGS differ per side and per kind. This centralizes the
 * boilerplate; the per-call args stay at the call site.
 *
 * Covered by test/unit/createConfiguredWorker.test.ts (the createHandlerOptions
 * characterization test runs workers-disabled, so this carries its own coverage).
 */
export async function createConfiguredWorker(
  label: string,
  args: Parameters<typeof createWorker>[0],
  logger: Logger,
  verbose?: boolean
): Promise<unknown> {
  try {
    const result = await createWorker(args);
    if (result.type === "error") {
      logger.warn(`${label} failed: ${result.error?.message}`);
      return undefined;
    }
    if (result.type === "skip") {
      logger.warn(`${label} skipped: ${result.reason}`);
      return undefined;
    }
    if (verbose) logger.info(`${label} created successfully`);
    return result.worker;
  } catch (error) {
    logger.warn(
      `${label} failed: ${error instanceof Error ? error.message : String(error)}`
    );
    return undefined;
  }
}
