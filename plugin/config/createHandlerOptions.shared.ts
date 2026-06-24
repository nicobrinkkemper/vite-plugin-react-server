/**
 * createHandlerOptions.shared.ts
 *
 * Logic shared verbatim by createHandlerOptions.server.ts and .client.ts.
 *
 * Scope note: this covers the parts shared across the two variants — the
 * default options, the auto-discovery resolution, the assembly of the fields
 * that are the same in both, and the worker-creation gate + run loop
 * (createHandlerWorkers). The per-kind createWorker args stay at each call site
 * (they genuinely diverge: server passes raw { configEnv, mode }, client
 * serializes + threads configEnv), as does the variant-specific tail
 * (components vs placeholders, clientPipeableStreamOptions coercion, worker
 * selection, children). Coverage: createHandlerOptions.test.ts pins the shared
 * output (workers disabled); createHandlerOptionsWorkers.test.ts pins the
 * per-variant createWorker call shape (workers enabled).
 */
import type { Logger, ConfigEnv, ResolvedConfig } from "vite";
import type { AutoDiscoveredFiles, ResolvedUserOptions } from "../types.js";
import { resolveAutoDiscover } from "./autoDiscover/resolveAutoDiscover.js";
import { DEFAULT_CONFIG } from "./defaults.js";
import { createWorker } from "../worker/createWorker.js";
import { getRouteFiles } from "../helpers/getRouteFiles.js";
import { routeToURL } from "../utils/routeToURL.js";
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

/**
 * Decide whether the RSC / HTML workers should be created. Both variants used
 * the identical gate: a worker is created when its flag is on for the current
 * command (dev flag in serve mode, build flag in build mode).
 */
export function resolveWorkerGate(
  userOptions: ResolvedUserOptions,
  configEnv: ConfigEnv | undefined,
  mode: string | undefined
): { isServeMode: boolean; isBuildMode: boolean; rsc: boolean; html: boolean } {
  const isServeMode =
    configEnv?.command === "serve" ||
    configEnv?.mode === "development" ||
    mode === "development";
  const isBuildMode = configEnv?.command === "build";

  const rsc =
    (!!userOptions.dev?.useRscWorker && isServeMode) ||
    (!!userOptions.build?.useRscWorker && isBuildMode);
  const html =
    (!!userOptions.dev?.useHtmlWorker && isServeMode) ||
    (!!userOptions.build?.useHtmlWorker && isBuildMode);

  return { isServeMode, isBuildMode, rsc, html };
}

export interface CreateHandlerWorkersInput {
  route: string;
  userOptions: ResolvedUserOptions;
  configEnv: ConfigEnv | undefined;
  mode: string | undefined;
  logger: Logger;
  /** Label prefix for log lines, e.g. "[createHandlerOptions.server]". */
  labelPrefix: string;
  /**
   * Per-variant createWorker args. Called once per enabled worker kind; the
   * divergent bits (conditions, workerPath, workerData shape) live here so the
   * gate + run loop can stay shared. See createHandlerOptions.{server,client}.ts.
   */
  buildWorkerArgs: (kind: "rsc" | "html") => Parameters<typeof createWorker>[0];
}

/**
 * The shared worker-creation driver: run the (identical) gate, then run each
 * enabled worker through createConfiguredWorker with the variant's args. Returns
 * the worker-or-undefined pair both variants assemble into their handler options.
 *
 * Covered by test/unit/createHandlerOptionsWorkers.test.ts (the createHandlerOptions
 * characterization test runs workers-disabled, so this carries its own coverage).
 */
export async function createHandlerWorkers(
  input: CreateHandlerWorkersInput
  // The worker fields on CreateHandlerOptions are loosely typed; both variants
  // previously held these in `any` locals. Preserve that to avoid churn here.
): Promise<{ rscWorker: any; htmlWorker: any }> {
  const { route, userOptions, configEnv, mode, logger, labelPrefix, buildWorkerArgs } =
    input;

  const gate = resolveWorkerGate(userOptions, configEnv, mode);

  let rscWorker: any = undefined;
  let htmlWorker: any = undefined;

  if (gate.rsc) {
    rscWorker = await createConfiguredWorker(
      `${labelPrefix} RSC worker (route ${route})`,
      buildWorkerArgs("rsc"),
      logger,
      userOptions.verbose
    );
  }

  if (gate.html) {
    htmlWorker = await createConfiguredWorker(
      `${labelPrefix} HTML worker (route ${route})`,
      buildWorkerArgs("html"),
      logger,
      userOptions.verbose
    );
  }

  return { rscWorker, htmlWorker };
}

export interface HandlerContext {
  defaults: ResolvedDefaults;
  autoDiscoveredFiles: AutoDiscoveredFiles;
  url: string;
  routeFiles: SharedHandlerOptionsInput["routeFiles"];
}

/**
 * The byte-identical prelude both variants ran before their per-side work: merge
 * defaults, resolve auto-discovered files, build the route URL, and load the
 * route's file paths (throwing on failure). Covered by the createHandlerOptions
 * characterization test, which exercises this whole path.
 */
export async function resolveHandlerContext(
  route: string,
  options: CreateHandlerOptionsParams,
  userOptions: ResolvedUserOptions,
  logger: Logger
): Promise<HandlerContext> {
  const defaults = { ...createDefaultOptions(), ...options.defaults };

  const autoDiscoveredFiles = await resolveAutoDiscoveredFiles(
    options,
    userOptions,
    logger
  );

  const url = routeToURL(
    route,
    userOptions.moduleBaseURL,
    userOptions.build.rscOutputPath
  );

  const routeFilesResult = await getRouteFiles(
    route,
    autoDiscoveredFiles,
    userOptions,
    logger
  );

  if (routeFilesResult.type === "error") {
    throw routeFilesResult.error || new Error("Failed to get route files");
  }

  return { defaults, autoDiscoveredFiles, url, routeFiles: routeFilesResult };
}
