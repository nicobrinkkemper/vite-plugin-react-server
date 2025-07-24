import type {
  ResolvedUserOptions,
  SerializedResolvedConfig,
  SerializedUserOptions,
} from "../types.js";
import type { ModuleInfo } from "rollup";
import { MessagePort } from "node:worker_threads";
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
import { getNodeEnv } from "../getNodeEnv.js";

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
let loaderPort: MessagePort | undefined;
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

let transformer: (
  source: string,
  moduleId: string
) => Promise<{ code: string; map: RawSourceMap | null }>;

export function initialize(
  data: {
    id: string;
    port: MessagePort;
    userOptions: SerializedUserOptions | null;
    resolvedConfig: SerializedResolvedConfig | null;
  } = {
    id: "react-loader",
    port: new MessagePort(),
    userOptions: null,
    resolvedConfig: null,
  }
) {
  if (userOptions?.verbose) {
    console.log("[react-loader] Initializing with options:", data.id);
  }
  loaderPort = data.port;
  if (data.userOptions) {
    // when user options are provided, use the user options using the hydrateUserOptions function
    const resolvedUserOptions = hydrateUserOptions(data.userOptions);
    if (resolvedUserOptions.type === "error") {
      throw new Error(resolvedUserOptions.error.message);
    }

    // Use the hydrated user options directly (includes recreated functions)
    userOptions = resolvedUserOptions.userOptions;

    isServerFunction = userOptions.loader?.isServerFunctionCode ?? DEFAULT_LOADER_CONFIG.isServerFunctionCode;
    isClientComponent = userOptions.loader?.isClientComponentCode ?? DEFAULT_LOADER_CONFIG.isClientComponentCode;
    
    transformer = createTransformer({
      options: userOptions,
    });
  } else {
    // when no user options are provided, use the default loader config
    transformer = createTransformer({
      options: {
        loader: {
          ...DEFAULT_LOADER_CONFIG,
          mode: getNodeEnv(),
        },
        verbose: false,
        panicThreshold: "critical_errors", 
      },
    });
  }
  if (!initialized && loaderPort) {
    loaderPort.postMessage({
      type: "INITIALIZED_REACT_LOADER",
      id: data.id,
    } satisfies InitializedReactLoaderMessage);
  }
  initialized = true;
}

export const load: LoadHook = async (url, context, nextLoad) => {
  if (!initialized) {
    initialize(context as never);
  }
  if (userOptions?.verbose) {
    console.log("[react-loader] Attempting to load:", url);
    console.log("[react-loader] Context:", {
      format: context.format,
      conditions: context.conditions,
    });
  }

  const { format } = context;
  if (format === "module" || format === "module-typescript") {
    if (userOptions?.verbose) {
      console.log("[react-loader] Loading module:", url);
    }
    const result = await nextLoad(url, context);
    if (userOptions?.verbose) {
      console.log("[react-loader] Next load result:", {
        format: result.format,
        shortCircuit: result.shortCircuit,
        source: typeof result.source,
      });
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

    if (userOptions?.verbose) {
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
      console.log("[react-loader] Module analysis:", {
        url,
        isServer,
        isClient,
        hasFileLevelServerDirective,
        hasFileLevelClientDirective,
        sourceLength: source.length,
        sourcePreview: source.slice(startPreviewIndex, startPreviewIndex + 100) + "...",
      });
    }

    if (!isServer && !isClient) {
      if (userOptions?.verbose) {
        console.log(
          "[react-loader] Skipping non-server/non-client module:",
          url
        );
      }
      return result;
    }

    // Handle file URLs
    const filePath = url.startsWith("file://") ? fileURLToPath(url) : url;
    if (userOptions?.verbose) {
      console.log("[react-loader] File path:", filePath);
    }

    // Normalize the URL using the same logic as plugin.server.ts
    let moduleID = filePath;
    let finalID = filePath;
    if (userOptions?.normalizer) {
      const [, value] = userOptions.normalizer(filePath);
      moduleID = join(userOptions.moduleBasePath, value);
      finalID = userOptions.moduleID?.(moduleID) || moduleID;
      if (userOptions?.verbose) {
        console.log("[react-loader] Normalized IDs:", { moduleID, finalID });
      }
    }

    const { code: transformed, map } = await transformer(source, finalID);

    if (userOptions?.verbose) {
      console.log("[react-loader] Transformation result:", {
        originalLength: source.length,
        transformedLength: transformed.length,
        wasTransformed: source !== transformed,
        hasSourceMap: !!map,
      });
    }

    if (loaderPort) {
      if (userOptions?.verbose) {
        console.log("[react-loader] Sending SERVER_MODULE message");
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

  if (userOptions?.verbose) {
    console.log("[react-loader] Skipping non-module format:", format);
  }
  return nextLoad(url, context);
};

export const resolve: ResolveHook = async (specifier, context, nextResolve) => {
  if (userOptions?.verbose) {
    console.log("[react-loader] Resolving:", specifier);
    console.log("[react-loader] Resolve context:", context);
  }
  const result = await nextResolve(specifier, context);
  if (userOptions?.verbose) {
    console.log("[react-loader] Resolve result:", result);
  }
  return result;
};
