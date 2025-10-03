import type {
  ResolvedUserOptions,
  SerializedResolvedConfig,
  SerializedUserOptions,
} from "../types.js";
import type { ModuleInfo } from "rollup";
import { parentPort } from "node:worker_threads";
import type { MessagePort } from "node:worker_threads";
import type {
  InitializedReactLoaderMessage,
  ServerModuleMessage,
} from "../worker/rsc/types.js";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { hydrateUserOptions } from "../helpers/hydrateUserOptions.js";
import { DEFAULT_LOADER_CONFIG } from "../config/defaults.js";
import type { LoadHook, ResolveHook } from "node:module";
import type { RawSourceMap } from "source-map";
import { createTransformer } from "./createTransformer.js";

import { createLogger, type Logger } from "vite";
import { createDefaultModuleID } from "../config/createModuleID.js";

export type LoaderOptions = {
  id: string;
  resolveDependencies?: boolean;
  format?: string;
  conditions?: string[];
  importAssertions?: Record<string, unknown>;
  importAttributes?: Record<string, unknown>;
  source: string;
};

export type LoaderFunction = (options: LoaderOptions) => Promise<ModuleInfo>;

let initialized = false;
let userOptions: ResolvedUserOptions;
let loaderPort: MessagePort | null;
let resolvedConfig: SerializedResolvedConfig;
let isServerFunction:
  | RegExpMatchArray
  | RegExp
  | ((source: string, url: string) => boolean)
  | null = DEFAULT_LOADER_CONFIG.isServerFunctionCode;

let isClientComponent:
  | RegExpMatchArray
  | RegExp
  | ((source: string, url: string) => boolean)
  | null = DEFAULT_LOADER_CONFIG.isClientComponentCode;
let logger: Logger;
let verbose: boolean;
let transformer: (
  source: string,
  moduleId: string,
  transformedModuleId: string
) => Promise<{ code: string; map: RawSourceMap | null }>;

export function initialize(data: {
  id: string;
  port: MessagePort;
  userOptions: SerializedUserOptions;
  resolvedConfig: SerializedResolvedConfig;
}) {
  const {
    id,
    port,
    userOptions: serializedUserOptions,
    resolvedConfig: serializedResolvedConfig,
  } = data;
  
  verbose = serializedUserOptions?.verbose ?? false;
  logger = createLogger(serializedResolvedConfig?.logLevel ?? "info", {
    prefix: id,
  });
  
  // Store resolvedConfig at module level for use in other functions
  resolvedConfig = serializedResolvedConfig;
  
  if (verbose) {
    logger.info(`Initializing with options: ${id}`);
  }
  loaderPort = port;
  
  // when user options are provided, use the user options using the hydrateUserOptions function
  const resolvedUserOptions = hydrateUserOptions(serializedUserOptions);
  if (resolvedUserOptions.type === "error") {
    throw resolvedUserOptions.error;
  }

  // Use the hydrated user options directly (includes recreated functions)
  userOptions = resolvedUserOptions.userOptions;

  isServerFunction = userOptions.loader?.isServerFunctionCode ?? DEFAULT_LOADER_CONFIG.isServerFunctionCode;
  isClientComponent = userOptions.loader?.isClientComponentCode ?? DEFAULT_LOADER_CONFIG.isClientComponentCode;
  
  transformer = createTransformer({
    options: userOptions,
  });
  
  if (!initialized && loaderPort) {
    loaderPort.postMessage({
      type: "INITIALIZED_REACT_LOADER",
      id,
    } satisfies InitializedReactLoaderMessage);
  }
  initialized = true;
}

export const load: LoadHook = async (url, context, nextLoad) => {
  if (!initialized) {
    // Fallback initialization when not properly set up
    // This should not happen in normal usage, but provides a basic fallback
    initialize({
      id: "react-loader",
      port: parentPort!,
      userOptions: {} as any,
      resolvedConfig: {} as any,
    });
  }
  const verbose = userOptions?.verbose ?? false;
  if (verbose) {
    logger.info(`Attempting to load: ${url}`);
    logger.info(`Context: ${JSON.stringify({
      format: context.format,
      conditions: context.conditions,
    })}`);
  }

  const { format } = context;
  if (format === "module" || format === "module-typescript") {
    if (verbose) {
      logger.info(`Loading module: ${url}`);
    }
    
    // Load the URL normally
    const result = await nextLoad(url, context);
    
    if (verbose) {
      logger.info(`Next load result: ${JSON.stringify({
        format: result.format,
        shortCircuit: result.shortCircuit,
        source: typeof result.source,
      })}`);
    }

    const source =
      typeof result.source === "string"
        ? result.source
        : result.source instanceof Uint8Array
        ? new TextDecoder().decode(result.source)
        : String(result.source);

    // Check for file-level server directive first
    const hasFileLevelServerDirective =
      source.startsWith('"use server"') || source.startsWith("'use server'");
    const hasFileLevelClientDirective =
      source.startsWith('"use client"') || source.startsWith("'use client'");

    const isServer =
      hasFileLevelServerDirective ||
      (typeof isServerFunction === "function"
        ? isServerFunction(source, url)
        : false);

    const isClient =
      hasFileLevelClientDirective ||
      (typeof isClientComponent === "function"
        ? isClientComponent(source, url)
        : false);

    if (verbose) {
      let startPreviewIndex = 0;
      let startLine = 0;
      const lines = source.split("\n");
      while (
        lines[startLine].trim() === "" || lines[startLine].trim() === "\r" ||
        // comment lines
        lines[startLine].trim().startsWith("//")
        || lines[startLine].trim().startsWith("/**")
        || lines[startLine].trim().startsWith("*")
      ) {
        startPreviewIndex += lines[startLine].length;
        startLine++;
      }
      logger.info(`Module analysis: ${JSON.stringify({
        url,
        isServer,
        isClient,
        hasFileLevelServerDirective,
        hasFileLevelClientDirective,
        sourceLength: source.length,
        sourcePreview: source.slice(startPreviewIndex, startPreviewIndex + 100) + "...",
      })}`);
    }

    if (!isServer && !isClient) {
      if (verbose) {
        logger.info(`Skipping non-server/non-client module: ${url}`);
      }
      return result;
    }

    // Handle file URLs
    const filePath = url.startsWith("file://") ? fileURLToPath(url) : url;
    if (verbose) {
      logger.info(`File path: ${filePath}`);
    }

    if(typeof userOptions.moduleID !== "function") {
      // Ensure we have proper build context for RSC worker
      // If configEnv is not available or doesn't indicate build mode, create a build-compatible configEnv
      const buildConfigEnv = resolvedConfig?.configEnv ?? { command: "build", mode: "production" };
      
      userOptions.moduleID = createDefaultModuleID({
        moduleBase: userOptions.moduleBase,
        moduleBasePath: userOptions.moduleBasePath,
        autoDiscover: userOptions.autoDiscover,
        build: userOptions.build,
        dev: userOptions.dev,
        moduleBaseURL: userOptions.moduleBaseURL,
        projectRoot: userOptions.projectRoot,
      }, buildConfigEnv);
    }

    // Normalize the URL using the same logic as plugin.server.ts
    let moduleID = filePath;
    let finalID = filePath;
    if (userOptions?.normalizer) {
      const [, value] = userOptions.normalizer(filePath);
      moduleID = join(userOptions.moduleBasePath, value);
      finalID = userOptions.moduleID?.(moduleID) || moduleID;
      if (verbose) {
        logger.info(`Normalized IDs: ${moduleID} -> ${finalID}`);
        logger.info(`userOptions: ${JSON.stringify(userOptions)}`);
      }
    }

    const { code: transformed, map } = await transformer(source, moduleID, finalID);

    if (verbose) {
      logger.info(`Transformation result: ${JSON.stringify({
        originalLength: source.length,
        transformedLength: transformed.length,
        wasTransformed: source !== transformed,
        hasSourceMap: !!map,
      })}`);
    }

    if (loaderPort) {
      if (verbose) {
        logger.info("Sending SERVER_MODULE message");
      }
      loaderPort.postMessage({
        type: "SERVER_MODULE",
        id: finalID,
        url: filePath,
        source: transformed,
      } satisfies ServerModuleMessage);
    }

    return {
      ...result,
      source: transformed,
      map,
    };
  }

  if (verbose) {
    logger.info(`Skipping non-module format: ${format}`);
  }
  return nextLoad(url, context);
};

export const resolve: ResolveHook = async (specifier, context, nextResolve) => {
  verbose = userOptions?.verbose ?? false;
  if (verbose) {
    logger.info(`Resolving: ${specifier}`);
    logger.info(`Resolve context: ${JSON.stringify(context)}`);
  }
  const result = await nextResolve(specifier, context);
  if (verbose) {
    logger.info(`Resolve result: ${JSON.stringify(result)}`);
  }
  return result;
};
