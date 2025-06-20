import type {
  ResolvedUserOptions,    
  SerializedUserOptions,
} from "../types.js";
import type { ModuleInfo } from "rollup";
import { transformModuleIfNeeded } from "./transformModuleIfNeeded.js";
import { MessagePort } from "node:worker_threads";
import type {
  InitializedReactLoaderMessage,
  ServerModuleMessage,
} from "../worker/rsc/types.js";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { hydrateUserOptions } from "../helpers/index.js";
import {  DEFAULT_LOADER_CONFIG } from "../config/defaults.js";
import type { LoadHook, ResolveHook } from "node:module";
import { createTransformer } from "./createTransformer.js";

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

export function initialize(
  data: {
    id: string;
    port: MessagePort;
    userOptions: SerializedUserOptions | null;
  } = {
    id: "react-loader",
    port: new MessagePort(),
    userOptions: null,
  }
) {
  if (userOptions?.verbose) {
    console.log("[react-loader] Initializing with options:", data.id);
  }
  loaderPort = data.port;
  if (data.userOptions) {
    const resolvedUserOptions = hydrateUserOptions(data.userOptions);
    if (resolvedUserOptions.type === "error") {
      throw new Error(resolvedUserOptions.error.message);
    }
    userOptions = resolvedUserOptions.userOptions as never;
    isServerFunction = userOptions.loader.isServerFunctionCode;
    isClientComponent = userOptions.loader.isClientComponentCode;
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
      console.log("[react-loader] Module analysis:", {
        url,
        isServer,
        isClient,
        hasFileLevelServerDirective,
        hasFileLevelClientDirective,
        sourceLength: source.length,
        sourcePreview: source.slice(0, 100) + "...",
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
      finalID = userOptions.moduleID(moduleID);
      if (userOptions?.verbose) {
        console.log("[react-loader] Normalized IDs:", { moduleID, finalID });
      }
    }

    const { code: transformed, map } = await transformModuleIfNeeded(
      source,
      finalID,
      {
        forceServerFunction: isServer,
        forceClientComponent: isClient,
        isServerEnvironment: true,
        loader: userOptions?.loader,
        verbose: userOptions?.verbose,
        directiveWarnings: [],
      }
    );

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

export function createReactServerLoader(
  options: ResolvedUserOptions
) {
  const transformer = createTransformer({
    options: options,
    isServerEnvironment: true,
  });

  return async (source: string, moduleId: string) => {
    const result = await transformer(source, moduleId);
    return {
      source: result.code,
      map: result.map,
      isServer: true,
      isClient: false,
      isServerEnvironment: true,
    };
  };
}
