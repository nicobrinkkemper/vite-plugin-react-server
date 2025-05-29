import type { LoaderContext, ResolvedUserOptions } from "../types.js";
import type { ModuleInfo } from "rollup";
import { transformModuleIfNeeded } from "./transformModuleIfNeeded.js";
import type { MessagePort } from "node:worker_threads";
import type { InitializedReactLoaderMessage, ServerModuleMessage } from "../worker/types.js";
import { hydrateUserOptions } from "../helpers/index.js";
import { resolveOptions } from "../config/index.js";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

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
export async function initialize(data: { id: string, port: MessagePort, userOptions: any }) {
  const userOptionsResult = resolveOptions(hydrateUserOptions(data.userOptions));
  loaderPort = data.port;
  loaderPort.postMessage({ type: "INITIALIZED_REACT_LOADER", id: data.id } satisfies InitializedReactLoaderMessage);
  if(userOptionsResult.type === "error") {
    throw userOptionsResult.error
  }
  userOptions = userOptionsResult.userOptions;
}

export async function load(url: string, context: LoaderContext, nextLoad: any) {
  const { format } = context;

  if (format === "module") {
    const result = await nextLoad(url, context);
    const source = typeof result.source === 'string' ? result.source : 
                  result.source instanceof Uint8Array ? new TextDecoder().decode(result.source) :
                  String(result.source);

    // Handle file URLs
    const filePath = url.startsWith("file://") ? fileURLToPath(url) : url;

    // Normalize the URL using the same logic as plugin.server.ts
    let moduleID = filePath;
    let finalID = filePath;
    if (userOptions?.normalizer) {
      const [, value] = userOptions.normalizer(filePath);
      moduleID = join(userOptions.moduleBasePath, value);
      finalID = userOptions.moduleID(moduleID);
    }
    if (userOptions?.verbose) {
      console.log("[react-loader] moduleID:", moduleID);
      console.log("[react-loader] finalID:", finalID);
    }

    const transformed = transformModuleIfNeeded(
      source,
      url,
      finalID,
      userOptions?.autoDiscover?.isServerFunction(source),
      userOptions?.autoDiscover?.isClientComponent(source),
      true, // isServerEnvironment
    );

    if (userOptions?.verbose) {
      console.log("[react-loader] Transformed source:", transformed);
    }

    if (loaderPort) {
      if (userOptions?.verbose) {
        console.log("[react-loader] Sending SERVER_MODULE message:", { id: finalID, url: filePath });
      }
      loaderPort.postMessage({
        type: "SERVER_MODULE",
        id: finalID,
        url: filePath,
        source: transformed,
      } satisfies ServerModuleMessage);
    }

    // If we have a source map, update it to point to the transformed source
    const map = result.map ? {
      ...result.map,
      sourcesContent: [transformed],
      mappings: result.map.mappings
    } : null;

    return {
      ...result,
      source: transformed,
      map
    };
  }

  return nextLoad(url, context);
}

export async function resolve(
  specifier: string,
  context: any,
  nextResolve: any
) {
  return nextResolve(specifier, context);
}
