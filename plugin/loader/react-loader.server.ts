import type {
  LoaderContext,
  ResolvedUserOptions,
  SerializedUserOptions,
} from "../types.js";
import type { ModuleInfo } from "rollup";
import { transformModuleIfNeeded } from "./transformModuleIfNeeded.js";
import type { MessagePort } from "node:worker_threads";
import type {
  InitializedReactLoaderMessage,
  ServerModuleMessage,
} from "../worker/types.js";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { resolveOptions } from "../config/resolveOptions.js";
import { hydrateUserOptions } from "../helpers/index.js";

export interface LoaderOptions {
  id: string;
  resolveDependencies?: boolean;
  format?: string;
  conditions?: string[];
  importAssertions?: Record<string, any>;
  importAttributes?: Record<string, any>;
  source: string;
}

export type LoaderFunction = (options: LoaderOptions) => Promise<ModuleInfo>;

let userOptions: ResolvedUserOptions | undefined;
let loaderPort: MessagePort | undefined;
export async function initialize(data: {
  id: string;
  port: MessagePort;
  userOptions: SerializedUserOptions;
}) {
  if (userOptions?.verbose) {
    console.log("[react-loader] Initializing with options:", data.id);
  }
  const resolvedUserOptions = resolveOptions(
    hydrateUserOptions(data.userOptions)
  );
  if (resolvedUserOptions.type === "error") {
    throw new Error(resolvedUserOptions.error.message);
  }
  userOptions = resolvedUserOptions.userOptions;
  loaderPort = data.port;
  loaderPort.postMessage({
    type: "INITIALIZED_REACT_LOADER",
    id: data.id,
  } satisfies InitializedReactLoaderMessage);
}

export async function load(url: string, context: LoaderContext, nextLoad: any) {
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

    const isServer = userOptions?.autoDiscover?.isServerFunctionCode(source);
    const isClient = userOptions?.autoDiscover?.isClientComponentCode(source);
    if (userOptions?.verbose) {
      console.log("[react-loader] Module analysis:", {
        url,
        isServer,
        isClient,
        sourceLength: source.length,
        sourcePreview: source.slice(0, 100) + "...",
      });
    }

    if (!isServer && !isClient) {
      if (userOptions?.verbose) {
        console.log("[react-loader] Skipping non-server/non-client module:", url);
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

    const transformed = transformModuleIfNeeded(
      source,
      finalID,
      isServer,
      isClient,
      true // isServerEnvironment
    );

    if (userOptions?.verbose) {
      console.log("[react-loader] Transformation result:", {
      originalLength: source.length,
      transformedLength: transformed.length,
        wasTransformed: source !== transformed,
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

    // If we have a source map, update it to point to the transformed source
    const map = result.map
      ? {
          ...result.map,
          sourcesContent: [transformed],
          mappings: result.map.mappings,
        }
      : null;

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
}

export async function resolve(
  specifier: string,
  context: any,
  nextResolve: any
) {
  if (userOptions?.verbose) {
    console.log("[react-loader] Resolving:", specifier);
    console.log("[react-loader] Resolve context:", context);
  }
  const result = await nextResolve(specifier, context);
  if (userOptions?.verbose) {
    console.log("[react-loader] Resolve result:", result);
  }
  return result;
}
